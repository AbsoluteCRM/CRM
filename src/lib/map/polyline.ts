/**
 * Encoded polylines (Google's algorithm, 1e5 precision), the format OSRM and
 * VROOM return and `routes.polyline` stores. Pure: shared by the server (the
 * fake optimizer, validation) and the browser (drawing the road route). Must
 * not import `ol`.
 */
import type { LonLat } from './geo'

const PRECISION = 1e5

/** Longest polyline we will decode, so a corrupt value cannot hang the page. */
export const MAX_POLYLINE_LENGTH = 2_000_000

function encodeNumber(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1
  let out = ''
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
    v >>= 5
  }
  return out + String.fromCharCode(v + 63)
}

/** Encodes lon/lat points (the polyline itself is lat,lon order). */
export function encodePolyline(points: ReadonlyArray<LonLat>): string {
  let lat = 0
  let lon = 0
  let out = ''
  for (const p of points) {
    const nextLat = Math.round(p.lat * PRECISION)
    const nextLon = Math.round(p.lon * PRECISION)
    out += encodeNumber(nextLat - lat) + encodeNumber(nextLon - lon)
    lat = nextLat
    lon = nextLon
  }
  return out
}

/**
 * Decodes an encoded polyline to lon/lat points, or `null` when the text is
 * not a valid polyline (bad characters, truncated, or out of range).
 */
export function decodePolyline(encoded: string): Array<LonLat> | null {
  if (encoded.length > MAX_POLYLINE_LENGTH) return null
  const points: Array<LonLat> = []
  let index = 0
  let lat = 0
  let lon = 0

  const next = (): number | null => {
    let result = 0
    let shift = 0
    for (;;) {
      if (index >= encoded.length) return null
      const code = encoded.charCodeAt(index++) - 63
      if (code < 0 || code > 63) return null
      result |= (code & 0x1f) << shift
      shift += 5
      if (code < 0x20) break
      if (shift > 30) return null
    }
    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    const dLat = next()
    const dLon = next()
    if (dLat === null || dLon === null) return null
    lat += dLat
    lon += dLon
    const point = { lon: lon / PRECISION, lat: lat / PRECISION }
    if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return null
    points.push(point)
  }
  return points
}
