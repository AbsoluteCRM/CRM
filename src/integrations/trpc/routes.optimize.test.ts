import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeOptimizer } from '#/server/optimizer/fake'
import { OptimizerError } from '#/server/optimizer/types'
import { fakeAdmin } from '#/server/trusted/test/fake-admin'
import type { OptimizerInfo } from '#/server/optimizer/types'
import { ORG, fake } from './test/fake-supabase'

const holder = vi.hoisted(() => ({
  client: null as object | null,
  optimizer: null as object | null,
  info: null as object | null,
}))

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))
vi.mock('#/server/trusted/supabase-admin', () => ({
  createSupabaseAdminClient: () => {
    if (!holder.client) throw new Error('no service role')
    return holder.client
  },
}))
vi.mock('#/server/optimizer', () => ({
  getOptimizer: () => holder.optimizer,
  optimizerInfo: () => holder.info,
}))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')
const { settled } = await import('#/server/trusted/optimization-runner')

const OTHER = '0198f0a0-0000-7000-8000-000000000009'
const R1 = '0198f0a0-0000-7000-8000-0000000000b1'
const RUN = '0198f0a0-0000-7000-8000-0000000000c1'
const DATE = '2026-11-03'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const AVAILABLE: OptimizerInfo = {
  available: true,
  provider: 'vroom',
  reason: null,
}
const NONE: OptimizerInfo = {
  available: false,
  provider: 'none',
  reason: 'No route optimizer is set up on this server.',
}

const stop = (n: number, extra: Record<string, unknown> = {}) => ({
  stop_id: `s${n}`,
  visit_id: `v${n}`,
  sequence: n,
  is_locked: false,
  duration_minutes: 30,
  window_start: null,
  window_end: null,
  lon: -114.1,
  lat: 51 + n * 0.02,
  ...extra,
})
const routeInput = (stops = [stop(1), stop(2)]) => ({
  route_id: R1,
  crew_id: 'crew-1',
  status: 'draft',
  planned_start: '2026-11-03T15:00:00Z',
  start: { lon: -114.1, lat: 51 },
  end: { lon: -114.1, lat: 51 },
  max_work_minutes: 480,
  stops,
})
const INPUTS = { routes: [routeInput()], skipped: [] }

let admin: ReturnType<typeof fakeAdmin>
const useAdmin = (
  members: Record<string, string> = { [`${ORG}:u1`]: 'dispatcher' },
) => {
  admin = fakeAdmin({ members })
  holder.client = admin.client
}

const optimize = (organizationId: string = ORG, extra = {}) =>
  caller().routes.optimize({ organizationId, date: DATE, ...extra })

beforeEach(() => {
  fake.reset()
  fake.setRole('dispatcher')
  fake.rpc = { data: INPUTS, error: null }
  holder.optimizer = createFakeOptimizer()
  holder.info = AVAILABLE
  useAdmin()
})

describe.each([
  'optimize',
  'lastRun',
  'optimizationStatus',
  'optimizerInfo',
] as const)('routes.%s access', (name) => {
  const call = () =>
    (
      caller().routes[name] as (
        input: Record<string, unknown>,
      ) => Promise<unknown>
    )({ organizationId: ORG, date: DATE, runId: RUN })

  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(call()).rejects.toThrow('UNAUTHORIZED')
    expect(fake.calls).toEqual([])
    expect(admin.log).toEqual([])
  })

  it('rejects non-members before reading or writing anything', async () => {
    fake.setRole(null)
    await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.called('rpc')).toBe(false)
    expect(fake.called('optimization_runs.select')).toBe(false)
    expect(admin.log).toEqual([])
  })

  it('rejects workers', async () => {
    fake.setRole('worker')
    await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.called('rpc')).toBe(false)
    expect(fake.called('optimization_runs.select')).toBe(false)
    expect(admin.log).toEqual([])
  })
})

describe('routes.optimizerInfo', () => {
  it('says why no optimizer is available', async () => {
    holder.info = NONE
    await expect(
      caller().routes.optimizerInfo({ organizationId: ORG }),
    ).resolves.toEqual(NONE)
  })

  it('says when one is', async () => {
    await expect(
      caller().routes.optimizerInfo({ organizationId: ORG }),
    ).resolves.toEqual(AVAILABLE)
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    fake.setRole(role)
    await expect(
      caller().routes.optimizerInfo({ organizationId: ORG }),
    ).resolves.toMatchObject({ provider: 'vroom' })
  })
})

describe('routes.optimize', () => {
  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    fake.setRole(role)
    useAdmin({ [`${ORG}:u1`]: role })
    const { run } = await optimize()
    await settled()
    expect(run.status).toBe('queued')
  })

  it('reads the inputs as the caller, for the verified org, date and routes', async () => {
    await optimize(ORG, { routeIds: [R1] })
    await settled()
    expect(fake.callsTo('rpc')).toEqual([
      [
        'rpc',
        'optimizer_inputs',
        { p_organization_id: ORG, p_date: DATE, p_route_ids: [R1] },
      ],
    ])
  })

  it('returns the queued run at once and finishes it in the background', async () => {
    const { run, skipped } = await optimize()
    expect(run).toMatchObject({
      status: 'queued',
      provider: 'fake',
      date: DATE,
      crewCount: 1,
      error: null,
    })
    expect(skipped).toEqual([])
    await settled()
    expect(admin.runs[0].status).toBe('succeeded')
  })

  it('writes the result through the trusted runner, never the table API', async () => {
    await optimize()
    await settled()
    expect(admin.rpcCalls.map((c) => c.name)).toEqual([
      'apply_optimization_results',
    ])
    expect(admin.rpcCalls[0].args).toMatchObject({ p_organization_id: ORG })
    for (const [key] of fake.calls) {
      expect(key).not.toMatch(/\.(insert|update|delete|upsert)$/)
    }
    expect(fake.callsTo('rpc')).toHaveLength(1)
  })

  it('records who asked', async () => {
    await optimize()
    await settled()
    expect(admin.runs[0]).toMatchObject({
      organization_id: ORG,
      requested_by: 'u1',
      route_date: DATE,
    })
  })

  it('passes along requested routes the database left out', async () => {
    fake.rpc = {
      data: { routes: [], skipped: [{ route_id: R1, reason: 'not_editable' }] },
      error: null,
    }
    const { skipped, run } = await optimize(ORG, { routeIds: [R1] })
    expect(skipped).toEqual([{ routeId: R1, reason: 'not_editable' }])
    expect(run.status).toBe('failed')
  })

  describe('tenancy', () => {
    it('uses only the verified org for a multi-org user', async () => {
      fake.memberships = { [ORG]: 'worker', [OTHER]: 'dispatcher' }
      useAdmin({ [`${OTHER}:u1`]: 'dispatcher' })
      await optimize(OTHER)
      await settled()
      expect(fake.callsTo('rpc')[0][2]).toMatchObject({
        p_organization_id: OTHER,
      })
      expect(admin.runs[0]).toMatchObject({ organization_id: OTHER })
      expect(admin.rpcCalls[0].args).toMatchObject({ p_organization_id: OTHER })
      // A worker in the first org is still refused there.
      await expect(optimize(ORG)).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(admin.runs).toHaveLength(1)
    })

    it('refuses an org the caller is not in, without touching the service role', async () => {
      await expect(optimize(OTHER)).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(fake.called('rpc')).toBe(false)
      expect(admin.log).toEqual([])
    })

    it('has the runner check membership again with the service role', async () => {
      // The user client says dispatcher; the service-role lookup finds no
      // active membership (removed a moment ago).
      useAdmin({})
      await expect(optimize()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'You do not have permission to optimize routes.',
      })
      expect(admin.runs).toEqual([])
      expect(admin.rpcCalls).toEqual([])
    })

    it('refuses a role the runner does not allow, even if the user client allowed it', async () => {
      useAdmin({ [`${ORG}:u1`]: 'worker' })
      await expect(optimize()).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(admin.runs).toEqual([])
    })

    it('surfaces a role refusal from the read function', async () => {
      fake.rpc = {
        data: null,
        error: { message: 'not allowed to optimize routes', code: '42501' },
      }
      await expect(optimize()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'not allowed to optimize routes',
      })
      expect(admin.runs).toEqual([])
    })
  })

  describe('input', () => {
    it('rejects a malformed date, org id or route id without any call', async () => {
      await expect(optimize(ORG, { date: 'tomorrow' })).rejects.toThrow()
      await expect(optimize('nope')).rejects.toThrow()
      await expect(optimize(ORG, { routeIds: ['nope'] })).rejects.toThrow()
      await expect(optimize(ORG, { routeIds: [] })).rejects.toThrow()
      expect(fake.called('rpc')).toBe(false)
      expect(admin.log).toEqual([])
    })

    it('hides raw database errors', async () => {
      fake.rpc = { data: null, error: { message: 'boom: relation "routes"' } }
      await expect(optimize()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database error',
      })
    })
  })

  describe('when the optimizer cannot run', () => {
    it('with no provider, records a failed run with the reason and changes no route', async () => {
      holder.optimizer = null
      holder.info = NONE
      const { run } = await optimize()
      expect(run).toMatchObject({
        status: 'failed',
        provider: 'none',
        error: NONE.reason,
      })
      expect(admin.rpcCalls).toEqual([])
      expect(admin.log.filter((l) => l.startsWith('routes.'))).toEqual([])
    })

    it('fails soft when the solver is unreachable', async () => {
      holder.optimizer = createFakeOptimizer({
        fail: new OptimizerError(
          'unreachable',
          'The route optimizer could not be reached.',
        ),
      })
      const { run } = await optimize()
      expect(run.status).toBe('queued')
      await settled()
      expect(admin.runs[0]).toMatchObject({
        status: 'failed',
        error: 'The route optimizer could not be reached.',
      })
      expect(admin.rpcCalls).toEqual([])
    })

    it('fails soft on a malformed solver response', async () => {
      holder.optimizer = createFakeOptimizer({
        fail: new OptimizerError(
          'bad_response',
          'The route optimizer returned an unexpected response.',
        ),
      })
      await optimize()
      await settled()
      expect(admin.runs[0]).toMatchObject({
        status: 'failed',
        error: 'The route optimizer returned an unexpected response.',
      })
      expect(admin.rpcCalls).toEqual([])
    })

    it('fails soft when the solver times out', async () => {
      holder.optimizer = createFakeOptimizer({
        fail: new OptimizerError(
          'timeout',
          'The route optimizer did not answer in time.',
        ),
      })
      await optimize()
      await settled()
      expect(admin.runs[0].error).toBe(
        'The route optimizer did not answer in time.',
      )
    })

    it('says so when there are no routes to optimize', async () => {
      fake.rpc = { data: { routes: [], skipped: [] }, error: null }
      const { run } = await optimize()
      expect(run.status).toBe('failed')
      expect(run.error).toMatch(/no draft or optimized routes/)
      expect(admin.rpcCalls).toEqual([])
    })

    it('says so when the server has no service-role access', async () => {
      holder.client = null
      await expect(optimize()).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      })
    })

    it('rejects a malformed answer from the read function', async () => {
      fake.rpc = { data: { routes: 'x' }, error: null }
      await expect(optimize()).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
      })
      expect(admin.runs).toEqual([])
    })
  })

  describe('what the runner sends to be saved', () => {
    const sent = () =>
      admin.rpcCalls[0].args.p_routes as Array<{
        route_id: string
        stops: Array<{
          stop_id: string
          sequence: number
          planned_arrival: string | null
        }>
      }>

    it('keeps locked stops where they are', async () => {
      fake.rpc = {
        data: {
          routes: [
            routeInput([
              stop(3, { sequence: 1 }),
              stop(2, { sequence: 2, is_locked: true }),
              stop(1, { sequence: 3 }),
            ]),
          ],
          skipped: [],
        },
        error: null,
      }
      await optimize()
      await settled()
      const [route] = sent()
      expect(route.stops.find((s) => s.stop_id === 's2')).toMatchObject({
        sequence: 2,
      })
      // The solver never saw the locked stop.
      expect(
        (
          holder.optimizer as ReturnType<typeof createFakeOptimizer>
        ).requests[0].jobs
          .map((j) => j.id)
          .sort(),
      ).toEqual(['s1', 's3'])
    })

    it('leaves stops with no location last and unplanned', async () => {
      fake.rpc = {
        data: {
          routes: [routeInput([stop(1, { lon: null, lat: null }), stop(2)])],
          skipped: [],
        },
        error: null,
      }
      await optimize()
      await settled()
      const [route] = sent()
      expect(route.stops.map((s) => [s.stop_id, s.sequence])).toEqual([
        ['s2', 1],
        ['s1', 2],
      ])
      expect(route.stops[1].planned_arrival).toBeNull()
      expect(admin.rpcCalls[0].args.p_unassigned).toEqual(['v1'])
    })

    it('sends only the routes the database returned (not published ones)', async () => {
      await optimize()
      await settled()
      expect(sent().map((r) => r.route_id)).toEqual([R1])
    })
  })

  it('rejects a second press while a run is active', async () => {
    admin = fakeAdmin({
      members: { [`${ORG}:u1`]: 'dispatcher' },
      insertError: { code: '23505', message: 'duplicate key value' },
    })
    holder.client = admin.client
    await expect(optimize()).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'An optimization is already running for this date.',
    })
  })
})

const RUN_ROW = {
  id: RUN,
  route_date: DATE,
  status: 'succeeded',
  provider: 'vroom',
  error: null,
  crew_ids: ['crew-1', 'crew-2'],
  unassigned_visit_ids: ['v9'],
  started_at: '2026-11-03T12:00:01Z',
  finished_at: '2026-11-03T12:00:05Z',
  created_at: '2026-11-03T12:00:00Z',
}

describe('routes.lastRun', () => {
  it('reads the newest run for the verified org and date', async () => {
    fake.result = { data: [RUN_ROW], error: null }
    await expect(
      caller().routes.lastRun({ organizationId: ORG, date: DATE }),
    ).resolves.toEqual({
      id: RUN,
      date: DATE,
      status: 'succeeded',
      provider: 'vroom',
      error: null,
      crewCount: 2,
      unassignedVisitIds: ['v9'],
      startedAt: '2026-11-03T12:00:01Z',
      finishedAt: '2026-11-03T12:00:05Z',
      createdAt: '2026-11-03T12:00:00Z',
    })
    expect(fake.calls).toContainEqual([
      'optimization_runs.eq',
      'organization_id',
      ORG,
    ])
    expect(fake.calls).toContainEqual([
      'optimization_runs.eq',
      'route_date',
      DATE,
    ])
    expect(fake.calls).toContainEqual([
      'optimization_runs.order',
      'created_at',
      { ascending: false },
    ])
    expect(fake.calls).toContainEqual(['optimization_runs.limit', 1])
  })

  it('uses the verified org for a multi-org user', async () => {
    fake.memberships = { [ORG]: 'worker', [OTHER]: 'dispatcher' }
    await caller().routes.lastRun({ organizationId: OTHER, date: DATE })
    expect(fake.callsTo('optimization_runs.eq')).toContainEqual([
      'optimization_runs.eq',
      'organization_id',
      OTHER,
    ])
    await expect(
      caller().routes.lastRun({ organizationId: ORG, date: DATE }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('returns null when there has been no run', async () => {
    fake.result = { data: [], error: null }
    await expect(
      caller().routes.lastRun({ organizationId: ORG, date: DATE }),
    ).resolves.toBeNull()
  })

  it('shows a run that never finished as failed', async () => {
    fake.result = {
      data: [
        {
          ...RUN_ROW,
          status: 'running',
          finished_at: null,
          created_at: '2020-01-01T00:00:00Z',
        },
      ],
      error: null,
    }
    await expect(
      caller().routes.lastRun({ organizationId: ORG, date: DATE }),
    ).resolves.toMatchObject({
      status: 'failed',
      error: 'The optimization did not finish.',
    })
  })

  it('shows a recent running run as running', async () => {
    fake.result = {
      data: [
        { ...RUN_ROW, status: 'running', created_at: new Date().toISOString() },
      ],
      error: null,
    }
    await expect(
      caller().routes.lastRun({ organizationId: ORG, date: DATE }),
    ).resolves.toMatchObject({ status: 'running' })
  })

  it('hides raw database errors', async () => {
    fake.result = { data: null, error: { message: 'boom' } }
    await expect(
      caller().routes.lastRun({ organizationId: ORG, date: DATE }),
    ).rejects.toMatchObject({ message: 'Database error' })
  })
})

describe('routes.optimizationStatus', () => {
  it('reads one run in the verified org', async () => {
    fake.result = { data: [RUN_ROW], error: null }
    await expect(
      caller().routes.optimizationStatus({ organizationId: ORG, runId: RUN }),
    ).resolves.toMatchObject({ id: RUN, status: 'succeeded' })
    expect(fake.calls).toContainEqual([
      'optimization_runs.eq',
      'organization_id',
      ORG,
    ])
    expect(fake.calls).toContainEqual(['optimization_runs.eq', 'id', RUN])
  })

  it('does not find another organization’s run', async () => {
    // RLS hides it, so the query returns nothing.
    fake.result = { data: [], error: null }
    await expect(
      caller().routes.optimizationStatus({ organizationId: ORG, runId: RUN }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a malformed run id', async () => {
    await expect(
      caller().routes.optimizationStatus({
        organizationId: ORG,
        runId: 'nope',
      }),
    ).rejects.toThrow()
    expect(fake.called('optimization_runs.select')).toBe(false)
  })
})

describe('routes.list road figures', () => {
  const visit = (id: string) => ({
    id,
    duration_minutes: 30,
    window_start: null,
    window_end: null,
    jobs: {
      id: `job-${id}`,
      number: 'J-1',
      title: 'Mow',
      clients: { id: 'c1', display_name: 'Jane' },
    },
    properties: {
      id: `p-${id}`,
      address_line1: '1 Main St',
      city: 'Calgary',
      latitude: 51.04,
      longitude: -114.07,
    },
  })
  const row = (
    extra: Record<string, unknown> = {},
    stopExtra: Record<string, unknown> = {},
  ) => ({
    id: R1,
    route_date: DATE,
    status: 'optimized',
    crew_id: 'crew1',
    planned_start: '2026-11-03T15:00:00Z',
    planned_end: '2026-11-03T18:00:00Z',
    total_distance_m: 12_000,
    total_duration_s: 10_800,
    polyline: '_p~iF~ps|U',
    optimized_stop_count: 2,
    updated_at: '2026-11-03T12:00:05Z',
    optimization_runs: {
      provider: 'vroom',
      finished_at: '2026-11-03T12:00:05Z',
      unassigned_visit_ids: [],
    },
    crews: { id: 'crew1', name: 'North', color: null, vehicle: null },
    route_stops: [
      {
        id: 's1',
        sequence: 1,
        is_locked: false,
        visit_id: 'v1',
        planned_arrival: '2026-11-03T15:10:00Z',
        planned_departure: '2026-11-03T15:40:00Z',
        travel_distance_m: 3000,
        travel_duration_s: 600,
        updated_at: '2026-11-03T12:00:05Z',
        visits: visit('v1'),
        ...stopExtra,
      },
      {
        id: 's2',
        sequence: 2,
        is_locked: false,
        visit_id: 'v2',
        planned_arrival: '2026-11-03T15:50:00Z',
        planned_departure: '2026-11-03T16:20:00Z',
        travel_distance_m: 2000,
        travel_duration_s: 600,
        updated_at: '2026-11-03T12:00:05Z',
        visits: visit('v2'),
      },
    ],
    ...extra,
  })
  const list = async (r: unknown) => {
    fake.result = { data: [r], error: null }
    return (await caller().routes.list({ organizationId: ORG, date: DATE }))[0]
  }

  it('returns the road figures and per-stop times', async () => {
    const route = await list(row())
    expect(route.plannedEnd).toBe('2026-11-03T18:00:00Z')
    expect(route.road).toEqual({
      distanceM: 12_000,
      durationS: 10_800,
      polyline: '_p~iF~ps|U',
      provider: 'vroom',
      optimizedAt: '2026-11-03T12:00:05Z',
      stale: false,
    })
    expect(route.stops[0]).toMatchObject({
      plannedArrival: '2026-11-03T15:10:00Z',
      travelDistanceM: 3000,
      travelDurationS: 600,
    })
  })

  it('has no road figures for a draft route', async () => {
    const route = await list(
      row({
        status: 'draft',
        total_duration_s: null,
        optimization_runs: null,
        optimized_stop_count: null,
      }),
    )
    expect(route.road).toBeNull()
  })

  it('selects the polyline but never the PostGIS columns', async () => {
    await list(row())
    const columns = String(fake.callsTo('routes.select')[0][1])
    expect(columns).toContain('polyline')
    expect(columns).not.toMatch(/start_location|end_location/)
  })

  it('marks a route stale after a stop was added', async () => {
    const stale = await list(row({}, {}))
    expect(stale.road?.stale).toBe(false)
    const added = row()
    added.route_stops.push({
      ...added.route_stops[1],
      id: 's3',
      sequence: 3,
      visit_id: 'v3',
      planned_arrival: null as never,
      visits: visit('v3'),
    })
    expect((await list(added)).road?.stale).toBe(true)
  })

  it('marks a route stale after an edit following the run', async () => {
    const edited = row({ updated_at: '2026-11-03T13:00:00Z' })
    expect((await list(edited)).road?.stale).toBe(true)
  })

  it('does not call a visit the run left unassigned stale', async () => {
    const r = row({
      optimization_runs: {
        provider: 'vroom',
        finished_at: '2026-11-03T12:00:05Z',
        unassigned_visit_ids: ['v2'],
      },
    })
    r.route_stops[1].planned_arrival = null as never
    expect((await list(r)).road?.stale).toBe(false)
  })
})
