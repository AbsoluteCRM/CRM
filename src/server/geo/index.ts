import { env } from '#/env'
import { createGeocoderFromConfig, parseChain } from './chain'
import type { Geocoder } from './types'

export * from './address'
export * from './types'
export {
  createGeocoderChain,
  createGeocoderFromConfig,
  parseChain,
} from './chain'

let geocoder: Geocoder | undefined

// The app's geocoder, built once per process so Nominatim's throttle is
// shared. Set by GEOCODER_CHAIN (default `maptiler`).
export function getGeocoder(): Geocoder {
  geocoder ??= createGeocoderFromConfig({
    chain: parseChain(env.GEOCODER_CHAIN),
    maptilerApiKey: env.MAPTILER_API_KEY,
    nominatimUserAgent: env.NOMINATIM_USER_AGENT,
    allowNominatim: process.env.NODE_ENV !== 'production',
  })
  return geocoder
}
