import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  addressHash,
  formatAddressQuery,
  geocodeKeyChanged,
  locationColumns,
  locationStatus,
  normalizeAddress,
} from './address'
import {
  createGeocoderChain,
  createGeocoderFromConfig,
  parseChain,
} from './chain'
import { createFakeGeocoder } from './fake'
import { createMaptilerGeocoder, maptilerAccuracy } from './maptiler'
import { createNominatimGeocoder, nominatimAccuracy } from './nominatim'
import maptilerAddress from './fixtures/maptiler-address.json'
import maptilerLocality from './fixtures/maptiler-locality.json'
import nominatimAddress from './fixtures/nominatim-address.json'
import nominatimPostcode from './fixtures/nominatim-postcode.json'
import type { AddressInput } from './types'

const ADDRESS: AddressInput = {
  line1: '11220 83 Ave NW',
  line2: 'Unit 4',
  city: 'Edmonton',
  region: 'AB',
  postalCode: 'T6G 0T8',
  country: 'CA',
}
const KEY = normalizeAddress(ADDRESS)

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async (_url: URL, _init?: RequestInit) =>
    Response.json(body, { status }),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('address helpers', () => {
  it('normalizes case, punctuation, whitespace and postal spacing, ignoring line2', () => {
    expect(KEY).toBe('11220 83 ave nw|edmonton|ab|t6g0t8|ca')
    expect(
      normalizeAddress({
        ...ADDRESS,
        line1: ' 11220  83 Ave. NW ',
        line2: null,
        postalCode: 't6g0t8',
      }),
    ).toBe(KEY)
    expect(addressHash(ADDRESS)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('detects an address change only on fields that move the point', () => {
    expect(geocodeKeyChanged(ADDRESS, { ...ADDRESS, line2: 'Suite 9' })).toBe(
      false,
    )
    expect(geocodeKeyChanged(ADDRESS, { ...ADDRESS, city: 'Calgary' })).toBe(
      true,
    )
  })

  it('formats the provider query without line2', () => {
    expect(formatAddressQuery(ADDRESS)).toBe(
      '11220 83 Ave NW, Edmonton, AB T6G 0T8, CA',
    )
  })

  it('builds EWKT location columns and clears them on null', () => {
    const now = new Date('2026-11-02T00:00:00Z')
    expect(
      locationColumns(
        { lon: -113.5, lat: 53.5, accuracy: 'street', source: 'maptiler' },
        now,
      ),
    ).toEqual({
      location: 'SRID=4326;POINT(-113.5 53.5)',
      geocoded_at: '2026-11-02T00:00:00.000Z',
      geocode_source: 'maptiler',
      geocode_accuracy: 'street',
    })
    expect(locationColumns(null)).toEqual({
      location: null,
      geocoded_at: null,
      geocode_source: null,
      geocode_accuracy: null,
    })
  })

  it('flags locality and unknown, but never a manual pin', () => {
    const row = { latitude: 51, longitude: -114, geocode_source: 'maptiler' }
    expect(locationStatus({ ...row, geocode_accuracy: 'rooftop' })).toBe('ok')
    expect(locationStatus({ ...row, geocode_accuracy: 'postal' })).toBe('ok')
    expect(locationStatus({ ...row, geocode_accuracy: 'locality' })).toBe(
      'low_confidence',
    )
    expect(locationStatus({ ...row, geocode_accuracy: 'unknown' })).toBe(
      'low_confidence',
    )
    expect(
      locationStatus({
        ...row,
        geocode_source: 'manual',
        geocode_accuracy: null,
      }),
    ).toBe('ok')
    expect(
      locationStatus({
        latitude: null,
        longitude: null,
        geocode_source: null,
        geocode_accuracy: null,
      }),
    ).toBe('missing')
  })
})

describe('maptiler provider', () => {
  it('parses a recorded address response', async () => {
    const fetch = stubFetch(maptilerAddress)
    const result = await createMaptilerGeocoder({ apiKey: 'k' }).geocode(
      ADDRESS,
    )
    expect(result).toEqual({
      lon: -113.5219,
      lat: 53.5186,
      accuracy: 'rooftop',
      normalizedAddress:
        '11220 83 Avenue Northwest, Edmonton, Alberta T6G 0T8, Canada',
      source: 'maptiler',
    })
    const url = fetch.mock.calls[0][0]
    expect(url.origin + url.pathname).toBe(
      'https://api.maptiler.com/geocoding/' +
        encodeURIComponent('11220 83 Ave NW, Edmonton, AB T6G 0T8, CA') +
        '.json',
    )
    expect(url.searchParams.get('country')).toBe('ca')
    expect(url.searchParams.get('limit')).toBe('1')
    expect(url.searchParams.get('autocomplete')).toBe('false')
  })

  it('maps a municipality to locality accuracy', async () => {
    stubFetch(maptilerLocality)
    const result = await createMaptilerGeocoder({ apiKey: 'k' }).geocode(
      ADDRESS,
    )
    expect(result?.accuracy).toBe('locality')
  })

  it('returns null on no features and throws a sanitized error on HTTP errors', async () => {
    stubFetch({ type: 'FeatureCollection', features: [] })
    await expect(
      createMaptilerGeocoder({ apiKey: 'k' }).geocode(ADDRESS),
    ).resolves.toBeNull()
    stubFetch({ message: 'Invalid key' }, 403)
    const error = await createMaptilerGeocoder({ apiKey: 'secret' })
      .geocode(ADDRESS)
      .catch((e: unknown) => e)
    expect(String(error)).toContain('maptiler: HTTP 403')
    expect(String(error)).not.toContain('secret')
  })

  it('suggests with proximity', async () => {
    const fetch = stubFetch(maptilerAddress)
    const suggestions = await createMaptilerGeocoder({ apiKey: 'k' }).suggest!(
      '11220 83',
      { lon: -113.5, lat: 53.5 },
    )
    expect(suggestions).toHaveLength(1)
    expect(fetch.mock.calls[0][0].searchParams.get('proximity')).toBe(
      '-113.5,53.5',
    )
  })

  it('maps place types', () => {
    expect(maptilerAccuracy(['road'])).toBe('street')
    expect(maptilerAccuracy(['postal_code'])).toBe('postal')
    expect(maptilerAccuracy(['region'])).toBe('unknown')
  })
})

describe('nominatim provider', () => {
  it('parses a recorded house response and sends an identifying User-Agent', async () => {
    const fetch = stubFetch(nominatimAddress)
    const result = await createNominatimGeocoder({
      minIntervalMs: 0,
      userAgent: 'AbsoluteCRM-test/1.0 (test@example.com)',
    }).geocode(ADDRESS)
    expect(result).toEqual({
      lon: -113.521897,
      lat: 53.518612,
      accuracy: 'rooftop',
      normalizedAddress:
        '11220, 83 Avenue NW, Garneau, Edmonton, Alberta, T6G 0T8, Canada',
      source: 'nominatim',
    })
    const [url, init] = fetch.mock.calls[0]
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('countrycodes')).toBe('ca')
    expect((init?.headers as Record<string, string>)['user-agent']).toBe(
      'AbsoluteCRM-test/1.0 (test@example.com)',
    )
  })

  it('maps a postcode hit to postal accuracy', async () => {
    stubFetch(nominatimPostcode)
    const result = await createNominatimGeocoder({ minIntervalMs: 0 }).geocode(
      ADDRESS,
    )
    expect(result?.accuracy).toBe('postal')
  })

  it('throttles to one request per interval', async () => {
    stubFetch([])
    const geocoder = createNominatimGeocoder({ minIntervalMs: 50 })
    const start = Date.now()
    await geocoder.geocode(ADDRESS)
    await geocoder.geocode(ADDRESS)
    expect(Date.now() - start).toBeGreaterThanOrEqual(45)
  })

  it('has no suggest (autocomplete is against the usage policy)', () => {
    expect(createNominatimGeocoder({}).suggest).toBeUndefined()
    expect(nominatimAccuracy({ place_rank: 26 })).toBe('street')
    expect(nominatimAccuracy({ place_rank: 16 })).toBe('locality')
  })
})

describe('geocoder chain', () => {
  const point = { lon: -113.5, lat: 53.5 }

  it('falls back to the next provider when one throws or finds nothing', async () => {
    const broken = createFakeGeocoder(
      { [KEY]: new Error('boom') },
      { name: 'a' },
    )
    const empty = createFakeGeocoder({}, { name: 'b' })
    const good = createFakeGeocoder(
      { [KEY]: { ...point, accuracy: 'street' } },
      { name: 'c' },
    )
    const result = await createGeocoderChain([broken, empty, good]).geocode(
      ADDRESS,
    )
    expect(result).toMatchObject({ ...point, accuracy: 'street', source: 'c' })
    expect([broken.calls, empty.calls, good.calls]).toEqual([
      [KEY],
      [KEY],
      [KEY],
    ])
  })

  it('stops at the first trusted result', async () => {
    const first = createFakeGeocoder(
      { [KEY]: { ...point, accuracy: 'postal' } },
      { name: 'a' },
    )
    const second = createFakeGeocoder({}, { name: 'b' })
    await createGeocoderChain([first, second]).geocode(ADDRESS)
    expect(second.calls).toEqual([])
  })

  it('keeps looking after a low-confidence hit and returns the most precise', async () => {
    const coarse = createFakeGeocoder(
      { [KEY]: { ...point, accuracy: 'unknown' } },
      { name: 'a' },
    )
    const city = createFakeGeocoder(
      { [KEY]: { ...point, accuracy: 'locality' } },
      { name: 'b' },
    )
    const result = await createGeocoderChain([coarse, city]).geocode(ADDRESS)
    expect(result).toMatchObject({ accuracy: 'locality', source: 'b' })
  })

  it('returns null instead of throwing when every provider fails', async () => {
    const chain = createGeocoderChain([
      createFakeGeocoder({ [KEY]: new Error('down') }),
      createFakeGeocoder({ [KEY]: { lon: 999, lat: 0, accuracy: 'rooftop' } }),
    ])
    await expect(chain.geocode(ADDRESS)).resolves.toBeNull()
    await expect(createGeocoderChain([]).geocode(ADDRESS)).resolves.toBeNull()
  })

  it('falls back from MapTiler over HTTP to Nominatim', async () => {
    const fetch = vi.fn(async (url: URL) =>
      url.hostname === 'api.maptiler.com'
        ? new Response('upstream error', { status: 503 })
        : Response.json(nominatimAddress),
    )
    vi.stubGlobal('fetch', fetch)
    const chain = createGeocoderChain([
      createMaptilerGeocoder({ apiKey: 'k' }),
      createNominatimGeocoder({ minIntervalMs: 0 }),
    ])
    await expect(chain.geocode(ADDRESS)).resolves.toMatchObject({
      source: 'nominatim',
      accuracy: 'rooftop',
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('builds from config, skipping keyless and disallowed providers', () => {
    expect(parseChain(undefined)).toEqual(['maptiler'])
    expect(parseChain(' MapTiler , nominatim ')).toEqual([
      'maptiler',
      'nominatim',
    ])
    const config = { chain: ['maptiler', 'nominatim', 'google'] }
    expect(
      createGeocoderFromConfig({ ...config, allowNominatim: false }).name,
    ).toBe('none')
    expect(
      createGeocoderFromConfig({
        ...config,
        maptilerApiKey: 'k',
        allowNominatim: true,
      }).name,
    ).toBe('maptiler,nominatim')
  })
})
