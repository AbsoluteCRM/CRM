import { z } from 'zod'

import { formatAddressQuery, isValidLonLat } from './address'
import { GeocoderError, fetchJson } from './http'
import type {
  GeocodeAccuracy,
  GeocodeResult,
  GeocodeSuggestion,
  Geocoder,
} from './types'

// MapTiler Geocoding API: https://docs.maptiler.com/cloud/api/geocoding/
// MapTiler permits storing geocoding results permanently "for most use
// cases" (maptiler.com/search); see ADR 0013 for the plan caveat.
// Feature ids are not stable across re-indexes, so they are never stored.

const feature = z.object({
  center: z.tuple([z.number(), z.number()]),
  place_name: z.string(),
  place_type: z.array(z.string()).min(1),
  relevance: z.number().optional(),
})
const payload = z.object({ features: z.array(feature) })

export function maptilerAccuracy(placeTypes: Array<string>): GeocodeAccuracy {
  const type = placeTypes.at(0) ?? ''
  if (type === 'address' || type === 'poi') return 'rooftop'
  if (type === 'road') return 'street'
  if (type === 'postal_code') return 'postal'
  if (
    [
      'municipality',
      'municipal_district',
      'locality',
      'neighbourhood',
      'place',
      'joint_municipality',
      'joint_submunicipality',
    ].includes(type)
  )
    return 'locality'
  return 'unknown'
}

export function createMaptilerGeocoder(options: {
  apiKey: string
  timeoutMs?: number
  baseUrl?: string
}): Geocoder {
  const timeoutMs = options.timeoutMs ?? 3000
  const base = options.baseUrl ?? 'https://api.maptiler.com/geocoding/'

  async function search(
    query: string,
    params: Record<string, string>,
    signal?: AbortSignal,
  ) {
    const url = new URL(`${encodeURIComponent(query)}.json`, base)
    url.search = new URLSearchParams({
      key: options.apiKey,
      ...params,
    }).toString()
    const parsed = payload.safeParse(
      await fetchJson('maptiler', url, { timeoutMs, signal }),
    )
    if (!parsed.success)
      throw new GeocoderError('maptiler', 'unexpected response')
    return parsed.data.features.filter(({ center: [lon, lat] }) =>
      isValidLonLat(lon, lat),
    )
  }

  return {
    name: 'maptiler',
    async geocode(address, opts): Promise<GeocodeResult | null> {
      const hits = await search(
        formatAddressQuery(address),
        {
          limit: '1',
          autocomplete: 'false',
          fuzzyMatch: 'false',
          country: address.country.toLowerCase(),
        },
        opts?.signal,
      )
      const hit = hits.at(0)
      if (!hit) return null
      return {
        lon: hit.center[0],
        lat: hit.center[1],
        accuracy: maptilerAccuracy(hit.place_type),
        normalizedAddress: hit.place_name,
        source: 'maptiler',
      }
    },
    async suggest(query, near, opts): Promise<Array<GeocodeSuggestion>> {
      const hits = await search(
        query,
        {
          limit: '5',
          autocomplete: 'true',
          ...(near && { proximity: `${near.lon},${near.lat}` }),
        },
        opts?.signal,
      )
      return hits.map((hit) => ({
        lon: hit.center[0],
        lat: hit.center[1],
        label: hit.place_name,
        accuracy: maptilerAccuracy(hit.place_type),
      }))
    },
  }
}
