import {
  addressHash,
  isLowConfidence,
  normalizeAddress,
} from '#/server/geo/address'
import { GEOCODE_ACCURACIES } from '#/server/geo/types'
import { createSupabaseAdminClient } from './supabase-admin'
import type {
  AddressInput,
  GeocodeAccuracy,
  GeocodeResult,
  Geocoder,
} from '#/server/geo/types'

// The geocode cache holds no tenant data, but it is service-role only, so it
// is read and written here (ADR 0009). Property writes stay on ctx.supabase.

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

function adminClientOrNull(): AdminClient | null {
  try {
    return createSupabaseAdminClient()
  } catch {
    return null
  }
}

function isAccuracy(value: string): value is GeocodeAccuracy {
  return (GEOCODE_ACCURACIES as ReadonlyArray<string>).includes(value)
}

export type CachedGeocode = GeocodeResult & { cached: boolean }

// Cache first, then the geocoder. Trusted results are written back; low
// confidence and empty results are not, so a later attempt can do better.
// Never throws: any failure resolves to null (or to an uncached result).
export async function geocodeAddressCached(
  address: AddressInput,
  options: { geocoder: Geocoder; client?: AdminClient | null },
): Promise<CachedGeocode | null> {
  const client =
    options.client === undefined ? adminClientOrNull() : options.client
  const hash = addressHash(address)

  if (client) {
    try {
      const { data } = await client
        .from('geocode_cache')
        .select('provider, lon, lat, accuracy')
        .eq('normalized_address_hash', hash)
        .maybeSingle()
      if (data && isAccuracy(data.accuracy)) {
        return {
          lon: data.lon,
          lat: data.lat,
          accuracy: data.accuracy,
          source: data.provider,
          normalizedAddress: normalizeAddress(address),
          cached: true,
        }
      }
    } catch {
      // Fall through to the provider.
    }
  }

  let result: GeocodeResult | null
  try {
    result = await options.geocoder.geocode(address)
  } catch {
    return null
  }
  if (!result) return null

  if (client && !isLowConfidence(result.accuracy)) {
    try {
      await client.from('geocode_cache').upsert({
        normalized_address_hash: hash,
        provider: result.source,
        lon: result.lon,
        lat: result.lat,
        accuracy: result.accuracy,
        fetched_at: new Date().toISOString(),
      })
    } catch {
      // A cache write failure doesn't affect the save.
    }
  }
  return { ...result, cached: false }
}
