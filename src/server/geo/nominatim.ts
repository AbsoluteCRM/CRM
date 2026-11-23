import { z } from 'zod'

import { formatAddressQuery, isValidLonLat } from './address'
import { GeocoderError, fetchJson } from './http'
import type { GeocodeAccuracy, GeocodeResult, Geocoder } from './types'

// Public OSM Nominatim, for dev and backfill only. Usage policy
// (operations.osmfoundation.org/policies/nominatim/): at most 1 request per
// second, an identifying User-Agent, no autocomplete, attribution (ODbL).
// So this provider has no `suggest`, and it throttles itself.

export const DEFAULT_NOMINATIM_USER_AGENT =
  'AbsoluteCRM/0.1 (+https://github.com/AbsoluteCRM/CRM)'

const hit = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  display_name: z.string(),
  place_rank: z.number().int().optional(),
  addresstype: z.string().optional(),
  type: z.string().optional(),
})
const payload = z.array(hit)

export function nominatimAccuracy(
  value: Pick<z.infer<typeof hit>, 'place_rank' | 'addresstype' | 'type'>,
): GeocodeAccuracy {
  if (value.addresstype === 'postcode' || value.type === 'postcode')
    return 'postal'
  const rank = value.place_rank ?? 0
  if (rank >= 30) return 'rooftop'
  if (rank >= 26) return 'street'
  if (rank >= 12) return 'locality'
  return 'unknown'
}

export function createNominatimGeocoder(options: {
  userAgent?: string
  baseUrl?: string
  timeoutMs?: number
  minIntervalMs?: number
}): Geocoder {
  const timeoutMs = options.timeoutMs ?? 5000
  const minIntervalMs = options.minIntervalMs ?? 1000
  const base = options.baseUrl ?? 'https://nominatim.openstreetmap.org/'
  let nextSlot = 0

  async function throttle() {
    const now = Date.now()
    const wait = Math.max(0, nextSlot - now)
    nextSlot = Math.max(now, nextSlot) + minIntervalMs
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  }

  return {
    name: 'nominatim',
    async geocode(address, opts): Promise<GeocodeResult | null> {
      await throttle()
      const url = new URL('search', base)
      url.search = new URLSearchParams({
        format: 'jsonv2',
        limit: '1',
        countrycodes: address.country.toLowerCase(),
        q: formatAddressQuery(address),
      }).toString()
      const parsed = payload.safeParse(
        await fetchJson('nominatim', url, {
          timeoutMs,
          signal: opts?.signal,
          headers: {
            'user-agent': options.userAgent ?? DEFAULT_NOMINATIM_USER_AGENT,
          },
        }),
      )
      if (!parsed.success)
        throw new GeocoderError('nominatim', 'unexpected response')
      const first = parsed.data.at(0)
      if (!first || !isValidLonLat(first.lon, first.lat)) return null
      return {
        lon: first.lon,
        lat: first.lat,
        accuracy: nominatimAccuracy(first),
        normalizedAddress: first.display_name,
        source: 'nominatim',
      }
    },
  }
}
