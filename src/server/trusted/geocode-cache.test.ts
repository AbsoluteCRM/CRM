import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase-admin', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  },
}))

const { geocodeAddressCached } = await import('./geocode-cache')
const { createFakeGeocoder } = await import('#/server/geo/fake')
const { addressHash, normalizeAddress } = await import('#/server/geo/address')

const ADDRESS = {
  line1: '1 Main St',
  city: 'Calgary',
  region: 'AB',
  postalCode: 'T2P 1J9',
  country: 'CA',
}
const KEY = normalizeAddress(ADDRESS)

function fakeClient(row: Record<string, unknown> | null) {
  const upserts: Array<unknown> = []
  const reads: Array<unknown> = []
  const client = {
    upserts,
    reads,
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => {
            reads.push([table, column, value])
            return Promise.resolve({ data: row, error: null })
          },
        }),
      }),
      upsert: (value: unknown) => {
        upserts.push([table, value])
        return Promise.resolve({ error: null })
      },
    }),
  }
  return client
}
type Client = Parameters<typeof geocodeAddressCached>[1]['client']

describe('geocodeAddressCached', () => {
  it('returns a cache hit without calling any provider', async () => {
    const client = fakeClient({
      provider: 'maptiler',
      lon: -114.05,
      lat: 51.04,
      accuracy: 'rooftop',
    })
    const geocoder = createFakeGeocoder({
      [KEY]: { lon: 0, lat: 0, accuracy: 'rooftop' },
    })
    const result = await geocodeAddressCached(ADDRESS, {
      geocoder,
      client: client as unknown as Client,
    })
    expect(result).toMatchObject({
      lon: -114.05,
      lat: 51.04,
      accuracy: 'rooftop',
      source: 'maptiler',
      cached: true,
    })
    expect(geocoder.calls).toEqual([])
    expect(client.reads).toEqual([
      ['geocode_cache', 'normalized_address_hash', addressHash(ADDRESS)],
    ])
  })

  it('writes a trusted miss to the cache, keyed by hash with no tenant data', async () => {
    const client = fakeClient(null)
    const geocoder = createFakeGeocoder({
      [KEY]: { lon: -114, lat: 51, accuracy: 'street' },
    })
    const result = await geocodeAddressCached(ADDRESS, {
      geocoder,
      client: client as unknown as Client,
    })
    expect(result).toMatchObject({ source: 'fake', cached: false })
    expect(client.upserts).toEqual([
      [
        'geocode_cache',
        {
          normalized_address_hash: addressHash(ADDRESS),
          provider: 'fake',
          lon: -114,
          lat: 51,
          accuracy: 'street',
          fetched_at: expect.any(String),
        },
      ],
    ])
  })

  it('does not cache a low-confidence result', async () => {
    const client = fakeClient(null)
    const geocoder = createFakeGeocoder({
      [KEY]: { lon: -114, lat: 51, accuracy: 'locality' },
    })
    await geocodeAddressCached(ADDRESS, {
      geocoder,
      client: client as unknown as Client,
    })
    expect(client.upserts).toEqual([])
  })

  it('geocodes without the cache when the service role is unavailable', async () => {
    const geocoder = createFakeGeocoder({
      [KEY]: { lon: -114, lat: 51, accuracy: 'rooftop' },
    })
    await expect(
      geocodeAddressCached(ADDRESS, { geocoder }),
    ).resolves.toMatchObject({ cached: false, lon: -114 })
  })

  it('returns null instead of throwing when the geocoder throws', async () => {
    const geocoder = createFakeGeocoder({ [KEY]: new Error('down') })
    await expect(
      geocodeAddressCached(ADDRESS, { geocoder, client: null }),
    ).resolves.toBeNull()
  })
})
