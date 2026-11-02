import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type State = {
  user: { id: string } | null
  role: string | null
  memberOrg: string
  current: Row | null
  result: { data: unknown; error: null | Record<string, string> }
  geocode: unknown
  calls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'dispatcher',
  memberOrg: '',
  current: null,
  result: { data: null, error: null },
  geocode: null,
  calls: [],
}))

const geocodeAddressCached = vi.hoisted(() =>
  vi.fn(async (..._args: Array<unknown>) => {
    if (state.geocode instanceof Error) throw state.geocode
    return state.geocode
  }),
)

vi.mock('#/server/trusted/geocode-cache', () => ({ geocodeAddressCached }))

vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const done = () => Promise.resolve(state.result)
    for (const m of ['select', 'eq', 'is', 'order', 'insert', 'update']) {
      q[m] = (...a: Array<unknown>) => (
        state.calls.push([`${table}.${m}`, ...a]),
        q
      )
    }
    q.maybeSingle = () =>
      table === 'organization_members'
        ? Promise.resolve({
            data: state.role
              ? {
                  id: 'm1',
                  organization_id: state.memberOrg,
                  role: state.role,
                  status: 'active',
                }
              : null,
            error: null,
          })
        : Promise.resolve({ data: state.current, error: null })
    q.single = done
    q.then = (r: (v: unknown) => unknown) => done().then(r)
    return q
  }
  return {
    createSupabaseServerClient: () => ({
      auth: {
        getUser: () =>
          Promise.resolve(
            state.user
              ? { data: { user: state.user }, error: null }
              : { data: { user: null }, error: { message: 'no session' } },
          ),
      },
      from: (table: string) => chain(table),
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const OTHER_ORG = '0198f0a0-0000-7000-8000-0000000000ff'
const CLIENT = '0198f0a0-0000-7000-8000-000000000002'
const PROPERTY = '0198f0a0-0000-7000-8000-000000000003'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const ADDRESS = {
  address_line1: '11220 83 Ave NW',
  address_line2: null,
  city: 'Edmonton',
  region: 'AB',
  postal_code: 'T6G 0T8',
  country: 'CA',
}
const SAVED = {
  id: PROPERTY,
  latitude: 53.5186,
  longitude: -113.5219,
  geocode_source: 'maptiler',
  geocode_accuracy: 'rooftop',
}
const HIT = {
  lon: -113.5219,
  lat: 53.5186,
  accuracy: 'rooftop',
  source: 'maptiler',
  normalizedAddress: 'x',
  cached: false,
}

const writes = (op: 'insert' | 'update') =>
  state.calls.filter(([k]) => k === `properties.${op}`).map(([, v]) => v as Row)

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'dispatcher'
  state.memberOrg = ORG
  state.current = null
  state.result = { data: SAVED, error: null }
  state.geocode = HIT
  state.calls = []
  geocodeAddressCached.mockClear()
})

describe('clients.properties: access', () => {
  it('rejects unauthenticated callers', async () => {
    state.user = null
    await expect(
      caller().clients.properties.list({
        organizationId: ORG,
        clientId: CLIENT,
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects non-members and portal users (no active membership)', async () => {
    state.role = null
    await expect(
      caller().clients.properties.create({
        organizationId: ORG,
        clientId: CLIENT,
        ...ADDRESS,
      }),
    ).rejects.toThrow('You do not have access to this organization')
    expect(writes('insert')).toEqual([])
    expect(geocodeAddressCached).not.toHaveBeenCalled()
  })

  it('rejects workers on every procedure', async () => {
    state.role = 'worker'
    const c = caller().clients.properties
    await expect(
      c.list({ organizationId: ORG, clientId: CLIENT }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      c.setLocation({
        organizationId: ORG,
        propertyId: PROPERTY,
        lon: 0,
        lat: 0,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      c.update({ organizationId: ORG, propertyId: PROPERTY, name: 'x' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    state.role = role
    await expect(
      caller().clients.properties.create({
        organizationId: ORG,
        clientId: CLIENT,
        ...ADDRESS,
      }),
    ).resolves.toMatchObject({ id: PROPERTY, location_status: 'ok' })
  })

  it('scopes every query to the verified active org (multi-org user)', async () => {
    state.memberOrg = OTHER_ORG
    state.result = { data: [SAVED], error: null }
    await caller().clients.properties.list({
      organizationId: OTHER_ORG,
      clientId: CLIENT,
    })
    expect(state.calls).toContainEqual([
      'properties.eq',
      'organization_id',
      OTHER_ORG,
    ])
    expect(state.calls).not.toContainEqual([
      'properties.eq',
      'organization_id',
      ORG,
    ])
  })
})

describe('clients.properties.create', () => {
  it('geocodes server-side and writes the point as EWKT', async () => {
    await caller().clients.properties.create({
      organizationId: ORG,
      clientId: CLIENT,
      ...ADDRESS,
      country: 'ca',
    })
    expect(geocodeAddressCached).toHaveBeenCalledTimes(1)
    expect(geocodeAddressCached.mock.calls[0][0]).toMatchObject({
      line1: '11220 83 Ave NW',
      city: 'Edmonton',
      country: 'CA',
    })
    expect(writes('insert')).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        client_id: CLIENT,
        country: 'CA',
        location: 'SRID=4326;POINT(-113.5219 53.5186)',
        geocode_source: 'maptiler',
        geocode_accuracy: 'rooftop',
        geocoded_at: expect.any(String),
      }),
    ])
  })

  it('still saves, with no location, when geocoding fails', async () => {
    state.geocode = null
    state.result = {
      data: {
        ...SAVED,
        latitude: null,
        longitude: null,
        geocode_source: null,
        geocode_accuracy: null,
      },
      error: null,
    }
    await expect(
      caller().clients.properties.create({
        organizationId: ORG,
        clientId: CLIENT,
        ...ADDRESS,
      }),
    ).resolves.toMatchObject({ location_status: 'missing' })
    expect(writes('insert')).toEqual([
      expect.objectContaining({
        location: null,
        geocoded_at: null,
        geocode_source: null,
        geocode_accuracy: null,
      }),
    ])
  })

  it('still saves when the geocoder throws', async () => {
    state.geocode = new Error('provider exploded')
    await expect(
      caller().clients.properties.create({
        organizationId: ORG,
        clientId: CLIENT,
        ...ADDRESS,
      }),
    ).resolves.toMatchObject({ id: PROPERTY })
    expect(writes('insert')[0]).toMatchObject({ location: null })
  })

  it('flags a low-confidence result', async () => {
    state.result = {
      data: { ...SAVED, geocode_accuracy: 'locality' },
      error: null,
    }
    await expect(
      caller().clients.properties.create({
        organizationId: ORG,
        clientId: CLIENT,
        ...ADDRESS,
      }),
    ).resolves.toMatchObject({ location_status: 'low_confidence' })
  })
})

describe('clients.properties.update', () => {
  beforeEach(() => {
    state.result = { data: [SAVED], error: null }
  })
  const manual = {
    ...ADDRESS,
    latitude: 53.5,
    geocode_source: 'manual',
  }

  it('preserves a manual pin when the address text is unchanged', async () => {
    state.current = manual
    await caller().clients.properties.update({
      organizationId: ORG,
      propertyId: PROPERTY,
      address_line1: ' 11220 83 Ave NW ',
      access_notes: 'Side gate',
    })
    expect(geocodeAddressCached).not.toHaveBeenCalled()
    const [update] = writes('update')
    expect(update).toMatchObject({ access_notes: 'Side gate' })
    expect(update).not.toHaveProperty('location')
    expect(update).not.toHaveProperty('geocode_source')
  })

  it('re-geocodes a manual pin when the address changes', async () => {
    state.current = manual
    await caller().clients.properties.update({
      organizationId: ORG,
      propertyId: PROPERTY,
      city: 'Calgary',
    })
    expect(geocodeAddressCached.mock.calls[0][0]).toMatchObject({
      city: 'Calgary',
      line1: '11220 83 Ave NW',
    })
    expect(writes('update')[0]).toMatchObject({
      city: 'Calgary',
      geocode_source: 'maptiler',
    })
  })

  it('clears a stale point when the new address fails to geocode', async () => {
    state.current = { ...ADDRESS, latitude: 53.5, geocode_source: 'maptiler' }
    state.geocode = null
    await caller().clients.properties.update({
      organizationId: ORG,
      propertyId: PROPERTY,
      address_line1: '1 New St',
    })
    expect(writes('update')[0]).toMatchObject({
      address_line1: '1 New St',
      location: null,
      geocode_source: null,
    })
  })

  it('retries a missing point on any save, and leaves it alone if it fails again', async () => {
    state.current = { ...ADDRESS, latitude: null, geocode_source: null }
    await caller().clients.properties.update({
      organizationId: ORG,
      propertyId: PROPERTY,
      name: 'Main house',
    })
    expect(writes('update')[0]).toMatchObject({ geocode_source: 'maptiler' })

    state.calls = []
    state.geocode = null
    await caller().clients.properties.update({
      organizationId: ORG,
      propertyId: PROPERTY,
      name: 'Main house',
    })
    expect(writes('update')[0]).toEqual({ name: 'Main house' })
  })

  it('does not geocode a non-address change on a located property', async () => {
    state.current = { ...ADDRESS, latitude: 53.5, geocode_source: 'maptiler' }
    await caller().clients.properties.update({
      organizationId: ORG,
      propertyId: PROPERTY,
      address_line2: 'Unit 4',
    })
    expect(geocodeAddressCached).not.toHaveBeenCalled()
  })

  it('returns NOT_FOUND for a property outside the active org', async () => {
    state.current = null
    await expect(
      caller().clients.properties.update({
        organizationId: ORG,
        propertyId: PROPERTY,
        name: 'x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(writes('update')).toEqual([])
  })

  it('rejects an empty update', async () => {
    await expect(
      caller().clients.properties.update({
        organizationId: ORG,
        propertyId: PROPERTY,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('clients.properties.setLocation', () => {
  it('writes a manual pin in the active org', async () => {
    state.result = {
      data: [{ ...SAVED, geocode_source: 'manual' }],
      error: null,
    }
    await expect(
      caller().clients.properties.setLocation({
        organizationId: ORG,
        propertyId: PROPERTY,
        lon: -114.07,
        lat: 51.05,
      }),
    ).resolves.toMatchObject({ location_status: 'ok' })
    expect(writes('update')).toEqual([
      {
        location: 'SRID=4326;POINT(-114.07 51.05)',
        geocoded_at: expect.any(String),
        geocode_source: 'manual',
        geocode_accuracy: 'rooftop',
      },
    ])
    expect(state.calls).toContainEqual([
      'properties.eq',
      'organization_id',
      ORG,
    ])
    expect(state.calls).toContainEqual(['properties.eq', 'id', PROPERTY])
  })

  it('rejects out-of-range coordinates', async () => {
    await expect(
      caller().clients.properties.setLocation({
        organizationId: ORG,
        propertyId: PROPERTY,
        lon: -200,
        lat: 51,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('returns NOT_FOUND when no row matched (other tenant)', async () => {
    state.result = { data: [], error: null }
    await expect(
      caller().clients.properties.setLocation({
        organizationId: ORG,
        propertyId: PROPERTY,
        lon: -114,
        lat: 51,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
