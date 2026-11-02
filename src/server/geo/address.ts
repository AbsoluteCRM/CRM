import { createHash } from 'node:crypto'

import type { AddressInput, GeocodeAccuracy, GeocodeResult } from './types'

const PRECISION: Record<GeocodeAccuracy, number> = {
  rooftop: 4,
  street: 3,
  postal: 2,
  locality: 1,
  unknown: 0,
}

export function accuracyRank(accuracy: GeocodeAccuracy) {
  return PRECISION[accuracy]
}

// A city centroid (or worse) is useless for routing and service areas: store
// it, but flag it so someone drops a pin.
export function isLowConfidence(accuracy: GeocodeAccuracy | null | undefined) {
  return accuracy === 'locality' || accuracy === 'unknown'
}

function clean(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[.,#;:'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The fields that move the point, normalized. Used for the cache key and for
// "did the address change". `line2` is excluded on purpose.
export function normalizeAddress(address: AddressInput) {
  return [
    clean(address.line1),
    clean(address.city),
    clean(address.region),
    clean(address.postalCode).replace(/\s+/g, ''),
    clean(address.country),
  ].join('|')
}

export function addressHash(address: AddressInput) {
  return createHash('sha256').update(normalizeAddress(address)).digest('hex')
}

export function geocodeKeyChanged(before: AddressInput, after: AddressInput) {
  return normalizeAddress(before) !== normalizeAddress(after)
}

// The free-text query sent to providers: "line1, city, region postal, country".
export function formatAddressQuery(address: AddressInput) {
  const regionPostal = [address.region, address.postalCode]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(' ')
  return [
    address.line1.trim(),
    address.city.trim(),
    regionPostal,
    address.country,
  ]
    .filter(Boolean)
    .join(', ')
}

export function isValidLonLat(lon: unknown, lat: unknown) {
  return (
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  )
}

// EWKT accepted by PostGIS for a geography(Point,4326) column through
// PostgREST (the same literal supabase/seed.sql uses).
export function toEwkt(lon: number, lat: number) {
  return `SRID=4326;POINT(${lon} ${lat})`
}

// The four location columns on `properties`, from a result (or cleared).
export function locationColumns(
  result: Pick<GeocodeResult, 'lon' | 'lat' | 'accuracy' | 'source'> | null,
  now: Date = new Date(),
) {
  if (!result) {
    return {
      location: null,
      geocoded_at: null,
      geocode_source: null,
      geocode_accuracy: null,
    }
  }
  return {
    location: toEwkt(result.lon, result.lat),
    geocoded_at: now.toISOString(),
    geocode_source: result.source,
    geocode_accuracy: result.accuracy,
  }
}

export type LocationStatus = 'ok' | 'low_confidence' | 'missing'

export function locationStatus(row: {
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
  geocode_accuracy: string | null
}): LocationStatus {
  if (row.latitude === null || row.longitude === null) return 'missing'
  if (row.geocode_source === 'manual') return 'ok'
  return isLowConfidence(row.geocode_accuracy as GeocodeAccuracy | null)
    ? 'low_confidence'
    : 'ok'
}
