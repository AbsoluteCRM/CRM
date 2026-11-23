import * as Sentry from '@sentry/tanstackstart-react'

import { accuracyRank, isLowConfidence, isValidLonLat } from './address'
import { createMaptilerGeocoder } from './maptiler'
import { createNominatimGeocoder } from './nominatim'
import type { GeocodeResult, Geocoder } from './types'

// Tries each provider in order. Returns the first trusted result; if every
// provider is low confidence, the most precise one; if none answer, null.
// Never throws: provider errors, timeouts and bad payloads become a miss.
export function createGeocoderChain(providers: Array<Geocoder>): Geocoder {
  return {
    name: providers.map((p) => p.name).join(',') || 'none',
    async geocode(address, options) {
      let best: GeocodeResult | null = null
      for (const provider of providers) {
        let result: GeocodeResult | null = null
        try {
          result = await Sentry.startSpan(
            { name: `geocode.${provider.name}`, op: 'geocode' },
            () => provider.geocode(address, options),
          )
        } catch {
          // Sanitized by the provider (never the URL: it holds the key).
          continue
        }
        if (!result || !isValidLonLat(result.lon, result.lat)) continue
        if (!isLowConfidence(result.accuracy)) return result
        if (
          !best ||
          accuracyRank(result.accuracy) > accuracyRank(best.accuracy)
        )
          best = result
      }
      return best
    },
    async suggest(query, near, options) {
      for (const provider of providers) {
        if (!provider.suggest) continue
        try {
          return await Sentry.startSpan(
            { name: `geocode.suggest.${provider.name}`, op: 'geocode' },
            () => provider.suggest!(query, near, options),
          )
        } catch {
          continue
        }
      }
      return []
    },
  }
}

export const KNOWN_PROVIDERS = ['maptiler', 'nominatim'] as const

export function parseChain(value: string | undefined) {
  return (value ?? 'maptiler')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
}

export type GeocoderConfig = {
  chain: Array<string>
  maptilerApiKey?: string
  nominatimUserAgent?: string
  // Public Nominatim is dev and backfill only (its usage policy).
  allowNominatim: boolean
}

// Builds the chain from config. Unknown names, providers without a key, and
// Nominatim when not allowed are skipped.
export function createGeocoderFromConfig(config: GeocoderConfig): Geocoder {
  const providers: Array<Geocoder> = []
  for (const name of config.chain) {
    if (name === 'maptiler' && config.maptilerApiKey) {
      providers.push(createMaptilerGeocoder({ apiKey: config.maptilerApiKey }))
    } else if (name === 'nominatim' && config.allowNominatim) {
      providers.push(
        createNominatimGeocoder({ userAgent: config.nominatimUserAgent }),
      )
    }
  }
  return createGeocoderChain(providers)
}
