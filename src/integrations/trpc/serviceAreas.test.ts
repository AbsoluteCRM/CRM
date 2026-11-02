import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  user: { id: string } | null
  role: string | null
  result: { data: unknown; error: null | Record<string, string> }
  calls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'owner',
  result: { data: null, error: null },
  calls: [],
}))

vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const done = () => Promise.resolve(state.result)
    for (const m of ['select', 'eq', 'is', 'insert', 'update']) {
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
      rpc: (fn: string, args: unknown) => (
        state.calls.push(['rpc', fn, args]),
        Promise.resolve(state.result)
      ),
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const AREA = '0198f0a0-0000-7000-8000-000000000002'
const CREW = '0198f0a0-0000-7000-8000-000000000003'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const square = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-114.1, 51.0],
      [-114.0, 51.0],
      [-114.0, 51.1],
      [-114.1, 51.1],
      [-114.1, 51.0],
    ] as Array<[number, number]>,
  ],
}

const rpcCalls = () => state.calls.filter(([k]) => k === 'rpc')

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'owner'
  state.result = { data: null, error: null }
  state.calls = []
})

describe('serviceAreas: access', () => {
  it('rejects unauthenticated callers', async () => {
    state.user = null
    await expect(
      caller().serviceAreas.list({ organizationId: ORG }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects non-members of the org', async () => {
    state.role = null
    await expect(
      caller().serviceAreas.list({ organizationId: ORG }),
    ).rejects.toThrow('You do not have access to this organization')
    expect(rpcCalls()).toHaveLength(0)
  })

  it.each(['owner', 'admin', 'dispatcher', 'worker'])(
    'lets %s list areas and regions',
    async (role) => {
      state.role = role
      state.result = {
        data: { type: 'FeatureCollection', features: [] },
        error: null,
      }
      await expect(
        caller().serviceAreas.list({ organizationId: ORG }),
      ).resolves.toEqual({ type: 'FeatureCollection', features: [] })
      await expect(
        caller().serviceAreas.regions.list({ organizationId: ORG }),
      ).resolves.toEqual({ type: 'FeatureCollection', features: [] })
    },
  )

  it.each(['dispatcher', 'worker'])('forbids %s from writing', async (role) => {
    state.role = role
    await expect(
      caller().serviceAreas.upsert({
        organizationId: ORG,
        name: 'North',
        boundary: square,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      caller().serviceAreas.preview({
        organizationId: ORG,
        name: 'North',
        boundary: square,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      caller().serviceAreas.archive({
        organizationId: ORG,
        id: AREA,
        archived: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      caller().serviceAreas.rotations.set({
        organizationId: ORG,
        serviceAreaId: AREA,
        rotations: [],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      caller().serviceAreas.regions.upsert({
        organizationId: ORG,
        name: 'Calgary',
        center: { type: 'Point', coordinates: [-114.07, 51.04] },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(rpcCalls()).toHaveLength(0)
  })

  it.each(['owner', 'admin'])('lets %s write', async (role) => {
    state.role = role
    state.result = { data: AREA, error: null }
    await expect(
      caller().serviceAreas.upsert({
        organizationId: ORG,
        name: 'North',
        boundary: square,
      }),
    ).resolves.toEqual({ id: AREA })
  })

  it('limits coverage to office staff', async () => {
    state.role = 'worker'
    await expect(
      caller().serviceAreas.coverage({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    state.role = 'dispatcher'
    state.result = { data: { areas: [] }, error: null }
    await expect(
      caller().serviceAreas.coverage({ organizationId: ORG }),
    ).resolves.toEqual({ areas: [] })
  })
})

describe('serviceAreas: org scoping', () => {
  it('lists with the verified org', async () => {
    await caller().serviceAreas.list({ organizationId: ORG })
    expect(state.calls).toContainEqual([
      'rpc',
      'service_areas_geojson',
      { p_organization_id: ORG, p_include_archived: false },
    ])
  })

  it('upserts with the verified org and omits empty optional fields', async () => {
    state.result = { data: AREA, error: null }
    await caller().serviceAreas.upsert({
      organizationId: ORG,
      name: '  North  ',
      crewId: CREW,
      priority: 5,
      boundary: square,
    })
    expect(state.calls).toContainEqual([
      'rpc',
      'upsert_service_area',
      {
        p_organization_id: ORG,
        p_id: undefined,
        p_name: 'North',
        p_crew_id: CREW,
        p_region_id: undefined,
        p_color: undefined,
        p_priority: 5,
        p_geojson: square,
      },
    ])
  })

  it('archives only within the verified org', async () => {
    state.result = { data: [{ id: AREA }], error: null }
    await caller().serviceAreas.archive({
      organizationId: ORG,
      id: AREA,
      archived: false,
    })
    expect(state.calls).toContainEqual([
      'service_areas.update',
      { archived_at: null },
    ])
    expect(state.calls).toContainEqual([
      'service_areas.eq',
      'organization_id',
      ORG,
    ])
    expect(state.calls).toContainEqual(['service_areas.eq', 'id', AREA])
  })

  it('returns NOT_FOUND when RLS or the org filter hides the area', async () => {
    state.result = { data: [], error: null }
    await expect(
      caller().serviceAreas.archive({
        organizationId: ORG,
        id: AREA,
        archived: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('maps rotations to the RPC shape', async () => {
    await caller().serviceAreas.rotations.set({
      organizationId: ORG,
      serviceAreaId: AREA,
      rotations: [{ weekday: 1, crewId: CREW }],
    })
    expect(state.calls).toContainEqual([
      'rpc',
      'set_service_area_rotations',
      {
        p_organization_id: ORG,
        p_service_area_id: AREA,
        p_rotations: [{ weekday: 1, crew_id: CREW }],
      },
    ])
  })
})

describe('serviceAreas: errors', () => {
  it.each([
    ['22023', 'BAD_REQUEST'],
    ['23503', 'BAD_REQUEST'],
    ['23505', 'CONFLICT'],
    ['42501', 'FORBIDDEN'],
    ['P0002', 'NOT_FOUND'],
  ])('maps %s to %s', async (code, trpcCode) => {
    state.result = { data: null, error: { message: 'x', code } }
    await expect(
      caller().serviceAreas.upsert({
        organizationId: ORG,
        name: 'North',
        boundary: square,
      }),
    ).rejects.toMatchObject({ code: trpcCode })
  })
})

describe('serviceAreas: GeoJSON validation', () => {
  const reject = (boundary: unknown) =>
    expect(
      caller().serviceAreas.upsert({
        organizationId: ORG,
        name: 'Bad',
        // @ts-expect-error deliberately malformed input
        boundary,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

  it('rejects a non-polygon', async () => {
    await reject({ type: 'Point', coordinates: [-114, 51] })
    expect(rpcCalls()).toHaveLength(0)
  })

  it('rejects an unclosed ring', async () => {
    await reject({
      type: 'Polygon',
      coordinates: [
        [
          [-114.1, 51.0],
          [-114.0, 51.0],
          [-114.0, 51.1],
          [-114.1, 51.1],
        ],
      ],
    })
  })

  it('rejects a ring with too few positions', async () => {
    await reject({
      type: 'Polygon',
      coordinates: [
        [
          [-114.1, 51.0],
          [-114.0, 51.0],
          [-114.1, 51.0],
        ],
      ],
    })
  })

  it('rejects coordinates outside lon/lat range', async () => {
    await reject({
      type: 'Polygon',
      coordinates: [
        [
          [500000, 5650000],
          [501000, 5650000],
          [501000, 5651000],
          [500000, 5650000],
        ],
      ],
    })
  })

  it('rejects more than 5,000 vertices', async () => {
    const ring: Array<[number, number]> = Array.from(
      { length: 5001 },
      (_, i) => [
        -114 + 0.01 * Math.cos((2 * Math.PI * i) / 5001),
        51 + 0.01 * Math.sin((2 * Math.PI * i) / 5001),
      ],
    )
    ring.push(ring[0])
    await reject({ type: 'Polygon', coordinates: [ring] })
  })

  it('accepts a MultiPolygon', async () => {
    state.result = { data: AREA, error: null }
    await expect(
      caller().serviceAreas.upsert({
        organizationId: ORG,
        name: 'Split',
        boundary: { type: 'MultiPolygon', coordinates: [square.coordinates] },
      }),
    ).resolves.toEqual({ id: AREA })
  })

  it('rejects duplicate rotation weekdays', async () => {
    await expect(
      caller().serviceAreas.rotations.set({
        organizationId: ORG,
        serviceAreaId: AREA,
        rotations: [
          { weekday: 2, crewId: CREW },
          { weekday: 2, crewId: CREW },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('requires a boundary or a center for a region', async () => {
    await expect(
      caller().serviceAreas.regions.upsert({
        organizationId: ORG,
        name: 'Nowhere',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
