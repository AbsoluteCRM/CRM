import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const OTHER = '0198f0a0-0000-7000-8000-000000000009'
const ROUTE = '0198f0a0-0000-7000-8000-0000000000a1'
const ROUTE_2 = '0198f0a0-0000-7000-8000-0000000000a2'
const STOP = '0198f0a0-0000-7000-8000-0000000000b1'
const STOP_2 = '0198f0a0-0000-7000-8000-0000000000b2'
const VISIT = '0198f0a0-0000-7000-8000-0000000000c1'
const CREW = '0198f0a0-0000-7000-8000-0000000000d1'
const NEW_ID = '0198f0a0-0000-7000-8000-0000000000e1'
const DATE = '2026-11-03'
const caller = () => trpcRouter.createCaller(createTRPCContext())

beforeEach(() => {
  fake.reset()
  fake.setRole('dispatcher')
  fake.rpc = { data: null, error: null }
})

// Each mutation, with a valid input and the function it calls.
const MUTATIONS = {
  create: {
    input: { date: DATE, crewId: CREW },
    fn: 'create_route',
    args: { p_route_date: DATE, p_crew_id: CREW },
  },
  assignCrew: {
    input: { routeId: ROUTE, crewId: CREW },
    fn: 'change_route_crew',
    args: { p_route_id: ROUTE, p_crew_id: CREW },
  },
  addStop: {
    input: { routeId: ROUTE, visitId: VISIT, position: 2 },
    fn: 'add_route_stop',
    args: { p_route_id: ROUTE, p_visit_id: VISIT, p_position: 2 },
  },
  moveStop: {
    input: { stopId: STOP, toRouteId: ROUTE_2, position: 1 },
    fn: 'move_route_stop',
    args: { p_stop_id: STOP, p_to_route_id: ROUTE_2, p_position: 1 },
  },
  reorderStops: {
    input: { routeId: ROUTE, stopIds: [STOP_2, STOP] },
    fn: 'reorder_route_stops',
    args: { p_route_id: ROUTE, p_stop_ids: [STOP_2, STOP] },
  },
  removeStop: {
    input: { stopId: STOP },
    fn: 'remove_route_stop',
    args: { p_stop_id: STOP },
  },
  delete: {
    input: { routeId: ROUTE },
    fn: 'delete_route',
    args: { p_route_id: ROUTE },
  },
} as const

type Name = keyof typeof MUTATIONS
const NAMES = Object.keys(MUTATIONS) as Array<Name>

function run(name: Name, organizationId: string = ORG) {
  const call = caller().routes[name] as (input: unknown) => Promise<unknown>
  return call({ organizationId, ...MUTATIONS[name].input })
}

describe.each(NAMES)('routes.%s', (name) => {
  const { fn, args } = MUTATIONS[name]

  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(run(name)).rejects.toThrow('UNAUTHORIZED')
    expect(fake.called('rpc')).toBe(false)
  })

  it('rejects non-members before calling the database', async () => {
    fake.setRole(null)
    await expect(run(name)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.called('rpc')).toBe(false)
  })

  it('rejects workers', async () => {
    fake.setRole('worker')
    await expect(run(name)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.called('rpc')).toBe(false)
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    fake.setRole(role)
    await expect(run(name)).resolves.not.toThrow()
  })

  it(`calls ${fn} scoped to the verified org`, async () => {
    await run(name)
    expect(fake.calls).toContainEqual([
      'rpc',
      fn,
      { p_organization_id: ORG, ...args },
    ])
  })

  it('uses the requested org for a multi-org user, never another', async () => {
    fake.memberships = { [ORG]: 'worker', [OTHER]: 'dispatcher' }
    await run(name, OTHER)
    expect(fake.callsTo('rpc')[0][2]).toMatchObject({
      p_organization_id: OTHER,
    })
    await expect(run(name, ORG)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.callsTo('rpc')).toHaveLength(1)
  })

  it('does not write with the table API', async () => {
    await run(name)
    for (const [key] of fake.calls)
      expect(key).not.toMatch(/\.(insert|update|delete)$/)
  })

  it('maps a missing row to NOT_FOUND with its message', async () => {
    fake.rpc = {
      data: null,
      error: { message: 'route not found', code: 'P0002' },
    }
    await expect(run(name)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'route not found',
    })
  })

  it('maps a locked route to CONFLICT with its message', async () => {
    fake.rpc = {
      data: null,
      error: {
        message: 'only a draft or optimized route can be changed',
        code: '55000',
      },
    }
    await expect(run(name)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'only a draft or optimized route can be changed',
    })
  })

  it('hides raw Postgres messages', async () => {
    fake.rpc = {
      data: null,
      error: {
        message:
          'duplicate key value violates unique constraint "route_stops_organization_id_visit_id_key"',
        code: '23505',
      },
    }
    await expect(run(name)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'That conflicts with existing data',
    })
  })

  it('maps an unexpected error to a generic INTERNAL_SERVER_ERROR', async () => {
    fake.rpc = {
      data: null,
      error: { message: 'deadlock detected', code: '40P01' },
    }
    await expect(run(name)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database error',
    })
  })
})

describe('routes mutation results', () => {
  it('create returns the new route id', async () => {
    fake.rpc = { data: NEW_ID, error: null }
    await expect(run('create')).resolves.toEqual({ id: NEW_ID })
  })

  it('assignCrew returns the replacement route id', async () => {
    fake.rpc = { data: NEW_ID, error: null }
    await expect(run('assignCrew')).resolves.toEqual({ id: NEW_ID })
  })

  it('addStop returns the stop id and omits an unset position', async () => {
    fake.rpc = { data: NEW_ID, error: null }
    const call = caller().routes.addStop
    await expect(
      call({ organizationId: ORG, routeId: ROUTE, visitId: VISIT }),
    ).resolves.toEqual({ id: NEW_ID })
    expect(fake.callsTo('rpc')[0][2]).toMatchObject({ p_position: undefined })
  })

  it.each(['moveStop', 'reorderStops', 'removeStop', 'delete'] as const)(
    '%s returns nothing',
    async (name) => {
      await expect(run(name)).resolves.toBeUndefined()
    },
  )

  it('maps a date mismatch to BAD_REQUEST', async () => {
    fake.rpc = {
      data: null,
      error: {
        message: 'a visit can only be routed on its scheduled date',
        code: '23514',
      },
    }
    await expect(run('addStop')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'a visit can only be routed on its scheduled date',
    })
  })

  it('maps a visit already routed to CONFLICT', async () => {
    fake.rpc = {
      data: null,
      error: { message: 'that visit is already on a route', code: '23505' },
    }
    await expect(run('addStop')).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'that visit is already on a route',
    })
  })
})

describe('routes input validation', () => {
  const bad = (name: Name, input: Record<string, unknown>) =>
    (caller().routes[name] as (i: unknown) => Promise<unknown>)({
      organizationId: ORG,
      ...input,
    })

  it('rejects malformed ids, dates and positions without calling the database', async () => {
    await expect(
      bad('create', { date: 'tomorrow', crewId: CREW }),
    ).rejects.toThrow()
    await expect(
      bad('create', { date: DATE, crewId: 'nope' }),
    ).rejects.toThrow()
    await expect(bad('assignCrew', { routeId: ROUTE })).rejects.toThrow()
    await expect(
      bad('addStop', { routeId: ROUTE, visitId: VISIT, position: 0 }),
    ).rejects.toThrow()
    await expect(
      bad('addStop', { routeId: ROUTE, visitId: VISIT, position: 1.5 }),
    ).rejects.toThrow()
    await expect(
      bad('moveStop', { stopId: STOP, toRouteId: ROUTE, position: -1 }),
    ).rejects.toThrow()
    await expect(bad('removeStop', { stopId: 'nope' })).rejects.toThrow()
    await expect(bad('delete', {})).rejects.toThrow()
    expect(fake.called('rpc')).toBe(false)
  })

  it('rejects an empty or repeating stop order', async () => {
    await expect(
      bad('reorderStops', { routeId: ROUTE, stopIds: [] }),
    ).rejects.toThrow()
    await expect(
      bad('reorderStops', { routeId: ROUTE, stopIds: [STOP, STOP] }),
    ).rejects.toThrow()
    expect(fake.called('rpc')).toBe(false)
  })
})
