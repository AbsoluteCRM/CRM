import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeOptimizer } from '#/server/optimizer/fake'
import { OptimizerError } from '#/server/optimizer/types'
import { NOW, ORG, OTHER_ORG, USER, fakeAdmin } from './test/fake-admin'
import type { Row } from './test/fake-admin'
import type { OptimizerInfo } from '#/server/optimizer/types'

vi.mock('./supabase-admin', () => ({
  createSupabaseAdminClient: () => {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  },
}))

const { RUN_TIMEOUT_MS, RunnerError, settled, startOptimization } =
  await import('./optimization-runner')

const DATE = '2026-11-03'

const AVAILABLE: OptimizerInfo = {
  available: true,
  provider: 'vroom',
  reason: null,
}
const stop = (n: number, extra: Row = {}) => ({
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
const inputs = (routes: Array<Row> = [routeRow('r1', [stop(1), stop(2)])]) => ({
  routes,
  skipped: [],
})
function routeRow(id: string, stops: Array<Row>, extra: Row = {}) {
  return {
    route_id: id,
    crew_id: `crew-${id}`,
    status: 'draft',
    planned_start: '2026-11-03T15:00:00Z',
    start: { lon: -114.1, lat: 51 },
    end: { lon: -114.1, lat: 51 },
    max_work_minutes: 480,
    stops,
    ...extra,
  }
}

const start = (
  admin: ReturnType<typeof fakeAdmin>,
  overrides: Partial<Parameters<typeof startOptimization>[0]> = {},
) =>
  startOptimization({
    organizationId: ORG,
    userId: USER,
    date: DATE,
    inputs: inputs(),
    info: AVAILABLE,
    optimizer: createFakeOptimizer(),
    client: admin.client,
    now: () => NOW,
    ...overrides,
  })

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('startOptimization access', () => {
  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    const admin = fakeAdmin({ members: { [`${ORG}:${USER}`]: role } })
    const started = await start(admin)
    await started.done
    expect(admin.runs).toHaveLength(1)
  })

  it('refuses a worker before recording anything', async () => {
    const admin = fakeAdmin({ members: { [`${ORG}:${USER}`]: 'worker' } })
    await expect(start(admin)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(admin.runs).toEqual([])
    expect(admin.rpcCalls).toEqual([])
  })

  it('refuses someone who is not a member', async () => {
    const admin = fakeAdmin({ members: {} })
    await expect(start(admin)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(admin.runs).toEqual([])
  })

  it('refuses a member of a different organization', async () => {
    const admin = fakeAdmin({ members: { [`${OTHER_ORG}:${USER}`]: 'owner' } })
    await expect(start(admin)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(admin.runs).toEqual([])
  })

  it('refuses an unknown role', async () => {
    const admin = fakeAdmin({ members: { [`${ORG}:${USER}`]: 'superuser' } })
    await expect(start(admin)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('says so when the server has no service-role access', async () => {
    await expect(
      startOptimization({
        organizationId: ORG,
        userId: USER,
        date: DATE,
        inputs: inputs(),
        info: AVAILABLE,
        optimizer: createFakeOptimizer(),
      }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })

  it('reports an unreadable input as an internal error', async () => {
    const admin = fakeAdmin()
    await expect(
      start(admin, { inputs: { routes: 'x' } }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
    expect(admin.runs).toEqual([])
  })

  it('throws RunnerError so the procedure can map it', async () => {
    const admin = fakeAdmin({ members: {} })
    await expect(start(admin)).rejects.toBeInstanceOf(RunnerError)
  })
})

describe('startOptimization without a usable optimizer', () => {
  it('records a failed run with the reason and changes nothing', async () => {
    const admin = fakeAdmin()
    const info: OptimizerInfo = {
      available: false,
      provider: 'none',
      reason: 'No route optimizer is set up on this server.',
    }
    const { run, done } = await start(admin, { info, optimizer: null })
    await done
    expect(run).toMatchObject({
      status: 'failed',
      provider: 'none',
      error: 'No route optimizer is set up on this server.',
    })
    expect(admin.rpcCalls).toEqual([])
    expect(admin.payloads).toEqual([])
  })

  it('records a failed run when there are no routes to optimize', async () => {
    const admin = fakeAdmin()
    const { run } = await start(admin, { inputs: inputs([]) })
    expect(run.status).toBe('failed')
    expect(run.error).toMatch(/no draft or optimized routes/)
    expect(admin.rpcCalls).toEqual([])
  })
})

describe('startOptimization run', () => {
  it('records who asked, the provider and the crews, then returns the queued run', async () => {
    const admin = fakeAdmin()
    const { run, done } = await start(admin, {
      inputs: inputs([
        routeRow('r1', [stop(1)]),
        routeRow('r2', [stop(2)], { crew_id: 'crew-r1' }),
      ]),
    })
    expect(run).toMatchObject({
      status: 'queued',
      provider: 'fake',
      organization_id: ORG,
      route_date: DATE,
      requested_by: USER,
      crew_ids: ['crew-r1'],
    })
    await done
  })

  it('applies the planned routes through apply_optimization_results', async () => {
    const admin = fakeAdmin()
    const { run, done } = await start(admin)
    await done
    expect(admin.rpcCalls).toHaveLength(1)
    const { name, args } = admin.rpcCalls[0]
    expect(name).toBe('apply_optimization_results')
    expect(args).toMatchObject({ p_organization_id: ORG, p_run_id: run.id })
    const [route] = args.p_routes as Array<{
      route_id: string
      stops: Array<{ stop_id: string; sequence: number }>
    }>
    expect(route.route_id).toBe('r1')
    expect(route.stops.map((s) => [s.stop_id, s.sequence])).toEqual([
      ['s1', 1],
      ['s2', 2],
    ])
    expect(args.p_unassigned).toEqual([])
    expect(admin.runs[0].status).toBe('succeeded')
  })

  it('moves the run through running before it finishes', async () => {
    const admin = fakeAdmin()
    const seen: Array<unknown> = []
    const optimizer = createFakeOptimizer()
    const optimize = optimizer.optimize.bind(optimizer)
    optimizer.optimize = (req, call) => {
      seen.push(admin.runs[0].status)
      return optimize(req, call)
    }
    const { done } = await start(admin, { optimizer })
    await done
    expect(seen).toEqual(['running'])
  })

  it('stores the solver exchanges in the payloads table', async () => {
    const admin = fakeAdmin()
    const { done } = await start(admin)
    await done
    expect(admin.payloads).toHaveLength(1)
    const [payload] = admin.payloads as Array<{
      organization_id: string
      run_id: string
      request: Array<{ service: string }>
      response: Array<{ service: string }>
    }>
    expect(payload.organization_id).toBe(ORG)
    expect(payload.run_id).toBe('run-1')
    expect(payload.request.map((e) => e.service)).toEqual(['fake', 'fake-legs'])
    expect(payload.response).toHaveLength(2)
  })

  it('lists visits the solver could not place on the run', async () => {
    const admin = fakeAdmin()
    const { done } = await start(admin, {
      inputs: inputs([
        routeRow('r1', [stop(1), stop(2, { lon: null, lat: null })]),
      ]),
    })
    await done
    expect(admin.rpcCalls[0].args.p_unassigned).toEqual(['v2'])
  })

  it('keeps locked stops where they are', async () => {
    const admin = fakeAdmin()
    const { done } = await start(admin, {
      inputs: inputs([
        routeRow('r1', [
          stop(2, { sequence: 1, is_locked: true }),
          stop(1, { sequence: 2 }),
          stop(3, { sequence: 3 }),
        ]),
      ]),
    })
    await done
    const [route] = admin.rpcCalls[0].args.p_routes as Array<{
      stops: Array<{ stop_id: string; sequence: number }>
    }>
    expect(route.stops[0]).toMatchObject({ stop_id: 's2', sequence: 1 })
  })

  it('notes routes it left alone and still applies the rest', async () => {
    const admin = fakeAdmin()
    const { done } = await start(admin, {
      optimizer: createFakeOptimizer({ withoutLegs: true }),
      inputs: inputs([
        routeRow('locked', [stop(1), stop(2, { is_locked: true })]),
        routeRow('free', [stop(3)]),
      ]),
    })
    await done
    const sent = admin.rpcCalls[0].args.p_routes as Array<{ route_id: string }>
    expect(sent.map((r) => r.route_id)).toEqual(['free'])
    expect(admin.runs[0].status).toBe('succeeded')
    expect(String(admin.runs[0].error)).toMatch(/1 route was left as they were/)
    expect(String(admin.runs[0].error)).toMatch(/road network service/)
  })

  it('fails when no route can be planned', async () => {
    const admin = fakeAdmin()
    const { done } = await start(admin, {
      optimizer: createFakeOptimizer({ withoutLegs: true }),
      inputs: inputs([routeRow('locked', [stop(1, { is_locked: true })])]),
    })
    await done
    expect(admin.rpcCalls).toEqual([])
    expect(admin.runs[0]).toMatchObject({ status: 'failed' })
    expect(String(admin.runs[0].error)).toMatch(/No route could be optimized/)
  })
})

describe('startOptimization failures', () => {
  it('fails the run with the solver’s plain message and applies nothing', async () => {
    const admin = fakeAdmin()
    const failure = new OptimizerError(
      'unreachable',
      'The route optimizer could not be reached.',
    )
    const { done } = await start(admin, {
      optimizer: createFakeOptimizer({ fail: failure }),
    })
    await done
    expect(admin.rpcCalls).toEqual([])
    expect(admin.runs[0]).toMatchObject({
      status: 'failed',
      error: 'The route optimizer could not be reached.',
    })
    expect(admin.runs[0].finished_at).toBe(NOW.toISOString())
  })

  it('fails the run on a malformed solver response', async () => {
    const admin = fakeAdmin()
    const failure = new OptimizerError(
      'bad_response',
      'The route optimizer returned an unexpected response.',
    )
    const { done } = await start(admin, {
      optimizer: createFakeOptimizer({ fail: failure }),
    })
    await done
    expect(admin.runs[0]).toMatchObject({
      status: 'failed',
      error: 'The route optimizer returned an unexpected response.',
    })
  })

  it('hides database details when the write-back fails', async () => {
    const admin = fakeAdmin({
      rpc: () => ({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "x"',
        },
      }),
    })
    const { done } = await start(admin)
    await done
    expect(admin.runs[0]).toMatchObject({
      status: 'failed',
      error: 'The routes could not be optimized. Nothing was changed.',
    })
  })

  it('fails the run when the write-back returns something unexpected', async () => {
    const admin = fakeAdmin({
      rpc: () => ({ data: { nope: true }, error: null }),
    })
    const { done } = await start(admin)
    await done
    expect(admin.runs[0].status).toBe('failed')
  })

  it('never leaves a run active, whatever throws', async () => {
    const admin = fakeAdmin()
    const optimizer = createFakeOptimizer()
    optimizer.optimize = () => {
      throw new TypeError('boom')
    }
    const { done } = await start(admin, { optimizer })
    await done
    expect(admin.runs[0].status).toBe('failed')
  })

  it('keeps coordinates out of the stored error', async () => {
    const admin = fakeAdmin()
    const optimizer = createFakeOptimizer()
    optimizer.optimize = () =>
      Promise.reject(new Error('bad point -114.1,51.02'))
    const { done } = await start(admin, { optimizer })
    await done
    expect(String(admin.runs[0].error)).not.toMatch(/114|51\./)
  })

  it('does not log coordinates', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    )
    const admin = fakeAdmin()
    const { done } = await start(admin)
    await done
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })

  it('maps a second active run for the date to CONFLICT', async () => {
    const admin = fakeAdmin({
      insertError: { code: '23505', message: 'duplicate key value' },
    })
    await expect(start(admin)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'An optimization is already running for this date.',
    })
  })

  it('maps any other insert failure to INTERNAL without its message', async () => {
    const admin = fakeAdmin({
      insertError: { code: '42P01', message: 'relation "x" does not exist' },
    })
    const error = await start(admin).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'INTERNAL' })
    expect((error as Error).message).not.toMatch(/relation/)
  })
})

describe('stuck runs', () => {
  it('fails a run older than the timeout before creating a new one', async () => {
    const old = new Date(NOW.getTime() - RUN_TIMEOUT_MS - 1000).toISOString()
    const fresh = new Date(NOW.getTime() - 60_000).toISOString()
    const admin = fakeAdmin({
      runs: [
        {
          id: 'old',
          organization_id: ORG,
          route_date: DATE,
          status: 'running',
          created_at: old,
        },
        {
          id: 'fresh',
          organization_id: ORG,
          route_date: DATE,
          status: 'queued',
          created_at: fresh,
        },
        {
          id: 'elsewhere',
          organization_id: OTHER_ORG,
          route_date: DATE,
          status: 'running',
          created_at: old,
        },
      ],
    })
    const { done } = await start(admin)
    await done
    const byId = (id: string) => admin.runs.find((r) => r.id === id)
    expect(byId('old')).toMatchObject({ status: 'failed' })
    expect(byId('fresh')).toMatchObject({ status: 'queued' })
    expect(byId('elsewhere')).toMatchObject({ status: 'running' })
  })
})

describe('settled', () => {
  it('waits for runs in flight', async () => {
    const admin = fakeAdmin()
    const { run } = await start(admin)
    expect(run.status).toBe('queued')
    await settled()
    expect(admin.runs[0].status).toBe('succeeded')
  })
})
