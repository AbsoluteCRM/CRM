import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  user: { id: string } | null
  role: string | null
  result: { data: unknown; error: null | Record<string, string> }
  calls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'dispatcher',
  result: { data: null, error: null },
  calls: [],
}))

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
      Promise.resolve({
        data: state.role
          ? {
              id: 'm1',
              organization_id: ORG,
              role: state.role,
              status: 'active',
            }
          : null,
        error: null,
      })
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
const CLIENT = '0198f0a0-0000-7000-8000-000000000002'
const PROPERTY = '0198f0a0-0000-7000-8000-000000000003'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const ADDRESS = {
  address_line1: ' 120 Crowfoot Way NW ',
  address_line2: '',
  city: 'Calgary',
  region: 'AB',
  postal_code: 't3g 2r2',
  country: 'ca',
}

const call = (name: string) => state.calls.find((c) => c[0] === name)
const calls = (name: string) => state.calls.filter((c) => c[0] === name)

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'dispatcher'
  state.result = { data: null, error: null }
  state.calls = []
})

describe('properties: access', () => {
  it('rejects signed-out callers', async () => {
    state.user = null
    await expect(
      caller().properties.list({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('stops workers from adding addresses', async () => {
    state.role = 'worker'
    await expect(
      caller().properties.create({
        organizationId: ORG,
        clientId: CLIENT,
        address: ADDRESS,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(call('properties.insert')).toBeUndefined()
  })

  it('stops non-members', async () => {
    state.role = null
    await expect(
      caller().properties.archive({
        organizationId: ORG,
        propertyId: PROPERTY,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('properties.list', () => {
  it('reads active properties in the org', async () => {
    state.result = { data: [], error: null }
    await caller().properties.list({ organizationId: ORG })
    expect(calls('properties.eq')).toContainEqual([
      'properties.eq',
      'organization_id',
      ORG,
    ])
    expect(call('properties.is')).toEqual([
      'properties.is',
      'archived_at',
      null,
    ])
  })
})

describe('properties.create', () => {
  it('stores a geocoded address in the caller’s org', async () => {
    state.result = { data: { id: PROPERTY }, error: null }
    await caller().properties.create({
      organizationId: ORG,
      clientId: CLIENT,
      address: { ...ADDRESS, latitude: 51.12, longitude: -114.2 },
      name: ' ',
      lot_size_sqft: 4200,
    })
    expect(call('properties.insert')?.[1]).toMatchObject({
      organization_id: ORG,
      client_id: CLIENT,
      name: null,
      address_line1: '120 Crowfoot Way NW',
      address_line2: null,
      postal_code: 'T3G 2R2',
      country: 'CA',
      lot_size_sqft: 4200,
      location: 'SRID=4326;POINT(-114.2 51.12)',
      geocode_source: 'geoapify',
    })
  })

  it('stores a typed address without coordinates', async () => {
    state.result = { data: { id: PROPERTY }, error: null }
    await caller().properties.create({
      organizationId: ORG,
      clientId: CLIENT,
      address: ADDRESS,
    })
    expect(call('properties.insert')?.[1]).toMatchObject({
      location: null,
      geocoded_at: null,
      geocode_source: null,
    })
  })

  it.each([
    ['a missing city', { ...ADDRESS, city: ' ' }],
    ['a country name', { ...ADDRESS, country: 'Canada' }],
    ['latitude without longitude', { ...ADDRESS, latitude: 51 }],
    ['an impossible latitude', { ...ADDRESS, latitude: 91, longitude: 0 }],
  ])('rejects %s', async (_label, address) => {
    await expect(
      caller().properties.create({
        organizationId: ORG,
        clientId: CLIENT,
        address,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(call('properties.insert')).toBeUndefined()
  })

  it('reports a client from another org as a bad request', async () => {
    state.result = {
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint' },
    }
    await expect(
      caller().properties.create({
        organizationId: ORG,
        clientId: CLIENT,
        address: ADDRESS,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('properties.update', () => {
  it('only changes the fields that were sent', async () => {
    state.result = { data: [{ id: PROPERTY }], error: null }
    await caller().properties.update({
      organizationId: ORG,
      propertyId: PROPERTY,
      access_notes: 'Gate code 1234',
    })
    expect(call('properties.update')?.[1]).toEqual({
      access_notes: 'Gate code 1234',
    })
    expect(calls('properties.eq')).toContainEqual([
      'properties.eq',
      'organization_id',
      ORG,
    ])
  })

  it('clears old coordinates when the address is retyped', async () => {
    state.result = { data: [{ id: PROPERTY }], error: null }
    await caller().properties.update({
      organizationId: ORG,
      propertyId: PROPERTY,
      address: ADDRESS,
    })
    expect(call('properties.update')?.[1]).toMatchObject({
      address_line1: '120 Crowfoot Way NW',
      location: null,
      geocoded_at: null,
    })
  })

  it('refuses an empty patch', async () => {
    await expect(
      caller().properties.update({ organizationId: ORG, propertyId: PROPERTY }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('reports a property outside the org as not found', async () => {
    state.result = { data: [], error: null }
    await expect(
      caller().properties.update({
        organizationId: ORG,
        propertyId: PROPERTY,
        name: 'Home',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('properties.archive', () => {
  it('archives instead of deleting', async () => {
    state.result = { data: [{ id: PROPERTY }], error: null }
    await caller().properties.archive({
      organizationId: ORG,
      propertyId: PROPERTY,
    })
    const patch = call('properties.update')?.[1] as Record<string, unknown>
    expect(Object.keys(patch)).toEqual(['archived_at'])
    expect(calls('properties.eq')).toContainEqual([
      'properties.eq',
      'organization_id',
      ORG,
    ])
  })
})
