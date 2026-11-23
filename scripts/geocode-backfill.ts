// Geocode properties that have no point yet. Uses the service role (trusted
// code, ADR 0009), the shared geocode cache, and a rate limit between
// provider calls. Dry run by default.
//
//   pnpm geocode:backfill                       # dry run: list candidates
//   pnpm geocode:backfill --apply --org <uuid>  # geocode and write
//
// Flags:
//   --apply                    write results (default: dry run, no provider calls)
//   --org <uuid>               only this organization
//   --limit <n>                at most n properties (default 500)
//   --chain <a,b>              provider order (default GEOCODER_CHAIN or maptiler,nominatim)
//   --interval-ms <n>          wait between provider calls (default 1100: Nominatim's 1 req/s)
//   --include-low-confidence   also retry non-manual rows flagged locality/unknown
import { parseArgs } from 'node:util'

import { createGeocoderFromConfig, parseChain } from '#/server/geo/chain'
import {
  isLowConfidence,
  locationColumns,
  normalizeAddress,
} from '#/server/geo/address'
import { geocodeAddressCached } from '#/server/trusted/geocode-cache'
import { createSupabaseAdminClient } from '#/server/trusted/supabase-admin'
import type { AddressInput, Geocoder } from '#/server/geo/types'

const { values } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    org: { type: 'string' },
    limit: { type: 'string', default: '500' },
    chain: { type: 'string' },
    'interval-ms': { type: 'string', default: '1100' },
    'include-low-confidence': { type: 'boolean', default: false },
  },
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (values.org && !UUID.test(values.org)) {
  console.error('--org must be an organization uuid')
  process.exit(1)
}
const limit = Number(values.limit)
const intervalMs = Number(values['interval-ms'])
if (!Number.isInteger(limit) || limit < 1 || !(intervalMs >= 0)) {
  console.error('--limit must be a positive integer and --interval-ms >= 0')
  process.exit(1)
}

const client = createSupabaseAdminClient()

let query = client
  .from('properties')
  .select(
    'id, organization_id, address_line1, address_line2, city, region, postal_code, country, latitude, geocode_source, geocode_accuracy',
  )
  .is('archived_at', null)
  .order('created_at', { ascending: true })
  .limit(limit)
if (values.org) query = query.eq('organization_id', values.org)
// Never a manual pin. One `or` filter per query, so the conditions are nested.
query = values['include-low-confidence']
  ? query.or(
      'and(location.is.null,geocode_source.is.null),' +
        'and(location.is.null,geocode_source.neq.manual),' +
        'and(geocode_accuracy.in.(locality,unknown),geocode_source.neq.manual)',
    )
  : query
      .is('location', null)
      .or('geocode_source.is.null,geocode_source.neq.manual')

const { data: rows, error } = await query
if (error) {
  console.error(`Could not read properties: ${error.message}`)
  process.exit(1)
}

console.log(
  `${rows.length} propert${rows.length === 1 ? 'y' : 'ies'} to geocode` +
    (values.org ? ` in org ${values.org}` : '') +
    (values.apply ? '' : ' (dry run: pass --apply to geocode and write)'),
)

if (!values.apply) {
  for (const row of rows) {
    console.log(
      `  ${row.id}  ${row.address_line1}, ${row.city} ${row.postal_code ?? ''}`,
    )
  }
  process.exit(0)
}

// Pace the provider calls; cache hits don't wait.
let lastProviderCall = 0
function paced(inner: Geocoder): Geocoder {
  return {
    name: inner.name,
    async geocode(address, options) {
      const wait = lastProviderCall + intervalMs - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      lastProviderCall = Date.now()
      return inner.geocode(address, options)
    },
  }
}

const geocoder = paced(
  createGeocoderFromConfig({
    chain: parseChain(
      values.chain ?? process.env.GEOCODER_CHAIN ?? 'maptiler,nominatim',
    ),
    maptilerApiKey: process.env.MAPTILER_API_KEY,
    nominatimUserAgent: process.env.NOMINATIM_USER_AGENT,
    allowNominatim: true,
  }),
)
if (geocoder.name === 'none') {
  console.error(
    'No usable provider: set MAPTILER_API_KEY or pass --chain nominatim',
  )
  process.exit(1)
}

const counts = { located: 0, lowConfidence: 0, failed: 0, skipped: 0 }
for (const row of rows) {
  const address: AddressInput = {
    line1: row.address_line1,
    line2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
  }
  const result = await geocodeAddressCached(address, { geocoder, client })
  if (!result) {
    counts.failed += 1
    console.log(`  miss  ${row.id}  ${normalizeAddress(address)}`)
    continue
  }
  // Guard the write: never overwrite a pin dropped since the read, and only
  // replace an existing point when it was low confidence.
  let update = client
    .from('properties')
    .update(locationColumns(result))
    .eq('organization_id', row.organization_id)
    .eq('id', row.id)
    .or('geocode_source.is.null,geocode_source.neq.manual')
  update =
    row.latitude === null
      ? update.is('location', null)
      : update.in('geocode_accuracy', ['locality', 'unknown'])
  const { data, error: writeError } = await update.select('id')
  if (writeError) {
    counts.failed += 1
    console.log(`  error ${row.id}  ${writeError.message}`)
  } else if (data.length === 0) {
    counts.skipped += 1
    console.log(`  skip  ${row.id}  (changed since read)`)
  } else {
    if (isLowConfidence(result.accuracy)) counts.lowConfidence += 1
    else counts.located += 1
    console.log(
      `  ${result.accuracy.padEnd(8)} ${row.id}  ${result.source}${result.cached ? ' (cache)' : ''}`,
    )
  }
}

console.log(
  `Done: ${counts.located} located, ${counts.lowConfidence} low confidence, ${counts.failed} failed, ${counts.skipped} skipped`,
)
