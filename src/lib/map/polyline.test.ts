import { describe, expect, it } from 'vitest'

import { decodePolyline, encodePolyline } from './polyline'

describe('polyline', () => {
  // The worked example from Google's encoded polyline documentation.
  const TEXT = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'
  const POINTS = [
    { lon: -120.2, lat: 38.5 },
    { lon: -120.95, lat: 40.7 },
    { lon: -126.453, lat: 43.252 },
  ]

  it('encodes the documented example', () => {
    expect(encodePolyline(POINTS)).toBe(TEXT)
  })

  it('decodes the documented example', () => {
    expect(decodePolyline(TEXT)).toEqual(POINTS)
  })

  it('round-trips points to five decimals', () => {
    const points = [
      { lon: -114.07191, lat: 51.04473 },
      { lon: -114.07183, lat: 51.04501 },
      { lon: -113.99, lat: 50.9 },
      { lon: 0, lat: 0 },
    ]
    expect(decodePolyline(encodePolyline(points))).toEqual(points)
  })

  it('handles empty and single-point input', () => {
    expect(encodePolyline([])).toBe('')
    expect(decodePolyline('')).toEqual([])
    expect(decodePolyline(encodePolyline([{ lon: 1, lat: 2 }]))).toEqual([
      { lon: 1, lat: 2 },
    ])
  })

  it('rejects text that is not a polyline', () => {
    expect(decodePolyline('not a polyline!')).toBeNull()
    expect(decodePolyline('_p~iF')).toBeNull()
    expect(decodePolyline('\u0000')).toBeNull()
  })

  it('rejects coordinates out of range', () => {
    // 100 degrees of latitude.
    expect(decodePolyline(encodePolyline([{ lon: 0, lat: 100 }]))).toBeNull()
  })
})
