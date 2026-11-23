// Server-only geocoding types. See docs/plans/property-geocoding.md.

export const GEOCODE_ACCURACIES = [
  'rooftop',
  'street',
  'postal',
  'locality',
  'unknown',
] as const
export type GeocodeAccuracy = (typeof GEOCODE_ACCURACIES)[number]

// The address fields a geocoder sees. `line2` (unit, suite) is kept for
// display but never sent to a provider or hashed: it doesn't move the point.
export type AddressInput = {
  line1: string
  line2?: string | null
  city: string
  region?: string | null
  postalCode?: string | null
  // ISO 3166-1 alpha-2, e.g. 'CA'.
  country: string
}

export type LonLat = { lon: number; lat: number }

export type GeocodeResult = LonLat & {
  accuracy: GeocodeAccuracy
  // The provider's formatted address, or our normalized input on a cache hit.
  normalizedAddress: string
  // Provider name: 'maptiler', 'nominatim', 'fake'.
  source: string
}

export type GeocodeSuggestion = LonLat & {
  label: string
  accuracy: GeocodeAccuracy
}

export type GeocodeOptions = { signal?: AbortSignal }

export interface Geocoder {
  readonly name: string
  // Resolves to null when nothing usable was found. Providers may throw; the
  // chain catches, so callers of a chain never see an exception.
  geocode: (
    address: AddressInput,
    options?: GeocodeOptions,
  ) => Promise<GeocodeResult | null>
  suggest?: (
    query: string,
    near?: LonLat,
    options?: GeocodeOptions,
  ) => Promise<Array<GeocodeSuggestion>>
}
