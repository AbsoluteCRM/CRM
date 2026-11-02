/**
 * Map data is stored and passed around as WGS 84 lon/lat (EPSG:4326), the same
 * as `properties.location`. Only the OpenLayers chunk projects it to
 * EPSG:3857 for display. This file must not import `ol`, so seed and route
 * code can use it without pulling the map library into the server bundle.
 */
export interface LonLat {
  lon: number
  lat: number
}

/** Fallback map centre when there is nothing to frame: downtown Calgary. */
export const CALGARY: LonLat = { lon: -114.0719, lat: 51.0447 }

export function isLonLat(value: unknown): value is LonLat {
  if (typeof value !== 'object' || value === null) return false
  const { lon, lat } = value as Partial<LonLat>
  return (
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90
  )
}
