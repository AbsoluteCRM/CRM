import { describe, expect, it } from 'vitest'

import { decodePolyline } from '#/lib/map/polyline'
import { createFakeOptimizer } from './fake'
import { planRoutes, prepare, toApplyPayload } from './plan'
import { OptimizerError } from './types'
import type { OptimizerInputs } from './inputs'

type Route = OptimizerInputs['routes'][number]
type Stop = Route['stops'][number]

const START = '2026-11-03T15:00:00Z' // 08:00 Mountain
const DEPOT = { lon: -114.1, lat: 51.0 }

const stop = (n: number, extra: Partial<Stop> = {}): Stop => ({
  stop_id: `s${n}`,
  visit_id: `v${n}`,
  sequence: n,
  is_locked: false,
  duration_minutes: 30,
  window_start: null,
  window_end: null,
  // Stops run north from the depot, so the nearest order is 1, 2, 3.
  lon: -114.1,
  lat: 51 + n * 0.02,
  ...extra,
})

const route = (
  id: string,
  stops: Array<Stop>,
  extra: Partial<Route> = {},
): Route => ({
  route_id: id,
  crew_id: `crew-${id}`,
  status: 'draft',
  planned_start: START,
  start: DEPOT,
  end: DEPOT,
  max_work_minutes: 480,
  stops,
  ...extra,
})

const ids = (plan: { stops: Array<{ stopId: string }> }) =>
  plan.stops.map((s) => s.stopId)

describe('prepare', () => {
  it('makes one vehicle per route and keeps each job on its own vehicle', () => {
    const { request } = prepare(
      [
        route('r1', [stop(1), stop(2)]),
        route('r2', [stop(3)], { max_work_minutes: null }),
      ],
      true,
    )
    expect(request.vehicles.map((v) => v.id)).toEqual(['r1', 'r2'])
    expect(request.jobs.map((j) => [j.id, j.vehicleId])).toEqual([
      ['s1', 'r1'],
      ['s2', 'r1'],
      ['s3', 'r2'],
    ])
    const start = Date.parse(START) / 1000
    expect(request.vehicles[0].timeWindow).toEqual([start, start + 480 * 60])
    // No max_work_minutes: a 12 hour shift.
    expect(request.vehicles[1].timeWindow).toEqual([start, start + 720 * 60])
  })

  it('sends service time and valid arrival windows only', () => {
    const { request } = prepare(
      [
        route('r1', [
          stop(1, {
            window_start: '2026-11-03T16:00:00Z',
            window_end: '2026-11-03T18:00:00Z',
            duration_minutes: 45,
          }),
          stop(2, {
            window_start: '2026-11-03T18:00:00Z',
            window_end: '2026-11-03T16:00:00Z',
          }),
        ]),
      ],
      true,
    )
    expect(request.jobs[0]).toMatchObject({
      serviceSeconds: 2700,
      timeWindow: [
        Date.parse('2026-11-03T16:00:00Z') / 1000,
        Date.parse('2026-11-03T18:00:00Z') / 1000,
      ],
    })
    expect(request.jobs[1].timeWindow).toBeNull()
  })

  it('does not send locked stops or stops with no location to the solver', () => {
    const { request, eligible } = prepare(
      [
        route('r1', [
          stop(1),
          stop(2, { is_locked: true }),
          stop(3, { lon: null, lat: null }),
        ]),
      ],
      true,
    )
    expect(request.jobs.map((j) => j.id)).toEqual(['s1'])
    expect(eligible[0].pinned.map((s) => s.stop_id)).toEqual(['s2'])
    expect(eligible[0].unplaceable.map((s) => s.stop_id)).toEqual(['s3'])
  })

  it('skips routes it cannot plan, with a reason', () => {
    const { eligible, skipped } = prepare(
      [
        route('empty', []),
        route('nostart', [stop(1)], { planned_start: null }),
        route('badstart', [stop(1)], { planned_start: 'tomorrow-ish' }),
        route('nowhere', [stop(1, { lon: null, lat: null })]),
        route('pinned-nowhere', [
          stop(1, { is_locked: true, lon: null, lat: null }),
        ]),
        route('pinned-out-of-range', [stop(1), stop(5, { is_locked: true })]),
        route('ok', [stop(1)]),
      ],
      true,
    )
    expect(eligible.map((e) => e.route.route_id)).toEqual(['ok'])
    expect(skipped).toEqual([
      { routeId: 'empty', reason: 'no_stops' },
      { routeId: 'nostart', reason: 'no_start_time' },
      { routeId: 'badstart', reason: 'no_start_time' },
      { routeId: 'nowhere', reason: 'no_locations' },
      { routeId: 'pinned-nowhere', reason: 'locked_stop_has_no_location' },
      { routeId: 'pinned-out-of-range', reason: 'locked_position_invalid' },
    ])
  })

  it('skips a route with locked stops when there are no road legs', () => {
    const { skipped, eligible } = prepare(
      [route('r1', [stop(1), stop(2, { is_locked: true })])],
      false,
    )
    expect(eligible).toEqual([])
    expect(skipped).toEqual([
      { routeId: 'r1', reason: 'locked_needs_road_legs' },
    ])
  })
})

describe('planRoutes with road legs', () => {
  it('orders the stops, times them in order and draws the road', async () => {
    const optimizer = createFakeOptimizer()
    // Stored out of order; the solver puts them back in driving order.
    const outcome = await planRoutes(optimizer, [
      route('r1', [
        stop(3, { sequence: 1 }),
        stop(1, { sequence: 2 }),
        stop(2, { sequence: 3 }),
      ]),
    ])
    expect(outcome.skipped).toEqual([])
    const [plan] = outcome.plans
    expect(ids(plan)).toEqual(['s1', 's2', 's3'])
    expect(plan.stops.map((s) => s.sequence)).toEqual([1, 2, 3])

    const arrivals = plan.stops.map((s) => Date.parse(s.plannedArrival!))
    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b))
    // The first stop is reached after driving from the depot.
    expect(plan.stops[0].travelDurationS).toBeGreaterThan(0)
    expect(arrivals[0]).toBe(
      Date.parse(START) + plan.stops[0].travelDurationS! * 1000,
    )
    // Service time passes between arrival and departure.
    for (const s of plan.stops) {
      expect(
        Date.parse(s.plannedDeparture!) - Date.parse(s.plannedArrival!),
      ).toBe(30 * 60_000)
    }
    expect(plan.plannedStart).toBe('2026-11-03T15:00:00.000Z')
    // Back at the depot after the last stop.
    expect(Date.parse(plan.plannedEnd)).toBeGreaterThan(
      Date.parse(plan.stops[2].plannedDeparture!),
    )
    expect(plan.totalDurationS).toBe(
      (Date.parse(plan.plannedEnd) - Date.parse(START)) / 1000,
    )
    const legSum = plan.stops.reduce((n, s) => n + s.travelDistanceM!, 0)
    expect(plan.totalDistanceM).toBeGreaterThan(legSum)
    expect(decodePolyline(plan.polyline!)).toHaveLength(5)
    expect(outcome.unassignedVisitIds).toEqual([])
  })

  it('waits for a window to open', async () => {
    const outcome = await planRoutes(createFakeOptimizer(), [
      route('r1', [
        stop(1, {
          window_start: '2026-11-03T17:00:00Z',
          window_end: '2026-11-03T20:00:00Z',
        }),
      ]),
    ])
    const [first] = outcome.plans[0].stops
    expect(first.plannedArrival).toBe('2026-11-03T17:00:00.000Z')
    expect(first.plannedDeparture).toBe('2026-11-03T17:30:00.000Z')
  })

  it('keeps locked stops at their numbers and orders the rest around them', async () => {
    const optimizer = createFakeOptimizer()
    const outcome = await planRoutes(optimizer, [
      route('r1', [
        stop(4),
        stop(3, { sequence: 2, is_locked: true }),
        stop(1, { sequence: 3 }),
        stop(2, { sequence: 4 }),
      ]),
    ])
    const [plan] = outcome.plans
    // s3 stays second; s1, s2 and s4 fill 1, 3, 4 in the solver's order.
    expect(ids(plan)).toEqual(['s1', 's3', 's2', 's4'])
    expect(plan.stops[1]).toMatchObject({ stopId: 's3', sequence: 2 })
    // The solver never saw the locked stop; the whole route was re-timed.
    expect(optimizer.requests[0].jobs.map((j) => j.id).sort()).toEqual([
      's1',
      's2',
      's4',
    ])
    expect(optimizer.legCalls).toHaveLength(1)
    expect(optimizer.legCalls[0]).toHaveLength(6) // depot, 4 stops, depot
    const arrivals = plan.stops.map((s) => Date.parse(s.plannedArrival!))
    expect(arrivals).toEqual([...arrivals].sort((a, b) => a - b))
  })

  it('works when every stop is locked, without calling the solver', async () => {
    const optimizer = createFakeOptimizer()
    const outcome = await planRoutes(optimizer, [
      route('r1', [
        stop(2, { sequence: 1, is_locked: true }),
        stop(1, { sequence: 2, is_locked: true }),
      ]),
    ])
    expect(optimizer.requests).toEqual([])
    expect(ids(outcome.plans[0])).toEqual(['s2', 's1'])
    expect(outcome.plans[0].stops[0].plannedArrival).not.toBeNull()
  })

  it('leaves unplaced stops after the placed ones, with no times', async () => {
    const outcome = await planRoutes(createFakeOptimizer(), [
      route('r1', [
        stop(1),
        stop(2, { lon: null, lat: null }),
        // Its window closes before the crew can get there.
        stop(3, {
          window_start: '2026-11-03T15:00:00Z',
          window_end: '2026-11-03T15:01:00Z',
        }),
        stop(4),
      ]),
    ])
    const [plan] = outcome.plans
    expect(ids(plan)).toEqual(['s1', 's4', 's3', 's2'])
    expect(plan.stops.map((s) => s.sequence)).toEqual([1, 2, 3, 4])
    expect(
      plan.stops.slice(2).map((s) => [s.plannedArrival, s.travelDurationS]),
    ).toEqual([
      [null, null],
      [null, null],
    ])
    expect(outcome.unassignedVisitIds.sort()).toEqual(['v2', 'v3'])
  })

  it('plans each route on its own and keeps stops on their crew', async () => {
    const optimizer = createFakeOptimizer()
    const outcome = await planRoutes(optimizer, [
      route('r1', [stop(1), stop(2)]),
      route('r2', [stop(3)], { start: { lon: -113.9, lat: 51.0 }, end: null }),
    ])
    expect(outcome.plans.map((p) => [p.routeId, ids(p)])).toEqual([
      ['r1', ['s1', 's2']],
      ['r2', ['s3']],
    ])
    expect(optimizer.requests).toHaveLength(1)
    // r2 has no end depot: its figures stop at the last stop.
    const r2 = outcome.plans[1]
    expect(Date.parse(r2.plannedEnd)).toBe(
      Date.parse(r2.stops[0].plannedDeparture!),
    )
  })

  it('handles a route with no depot', async () => {
    const outcome = await planRoutes(createFakeOptimizer(), [
      route('r1', [stop(1), stop(2)], { start: null, end: null }),
    ])
    const [plan] = outcome.plans
    expect(plan.stops[0]).toMatchObject({
      travelDurationS: null,
      travelDistanceM: null,
    })
    expect(plan.stops[0].plannedArrival).toBe('2026-11-03T15:00:00.000Z')
    expect(plan.stops[1].travelDurationS).toBeGreaterThan(0)
  })

  it('handles one stop and no depot (nothing to drive)', async () => {
    const outcome = await planRoutes(createFakeOptimizer(), [
      route('r1', [stop(1)], { start: null, end: null }),
    ])
    expect(outcome.plans[0].polyline).toBeNull()
    expect(outcome.plans[0].totalDistanceM).toBeNull()
    expect(outcome.plans[0].stops[0].plannedArrival).toBe(
      '2026-11-03T15:00:00.000Z',
    )
  })

  it('surfaces a solver failure', async () => {
    const failure = new OptimizerError(
      'unreachable',
      'The route optimizer could not be reached.',
    )
    await expect(
      planRoutes(createFakeOptimizer({ fail: failure }), [
        route('r1', [stop(1)]),
      ]),
    ).rejects.toBe(failure)
  })
})

describe('planRoutes without road legs', () => {
  it('uses the solver’s own times and geometry', async () => {
    const optimizer = createFakeOptimizer({ withoutLegs: true })
    const outcome = await planRoutes(optimizer, [
      route('r1', [stop(2), stop(1)]),
    ])
    const [plan] = outcome.plans
    expect(ids(plan)).toEqual(['s1', 's2'])
    expect(plan.stops[0].plannedArrival).not.toBeNull()
    expect(plan.stops[0].travelDistanceM).toBeGreaterThan(0)
    expect(decodePolyline(plan.polyline!)).toHaveLength(4)
    expect(plan.totalDistanceM).toBeGreaterThan(0)
  })

  it('skips a route with locked stops and reports it', async () => {
    const optimizer = createFakeOptimizer({ withoutLegs: true })
    const outcome = await planRoutes(optimizer, [
      route('locked', [stop(1), stop(2, { is_locked: true })]),
      route('free', [stop(3)]),
    ])
    expect(outcome.skipped).toEqual([
      { routeId: 'locked', reason: 'locked_needs_road_legs' },
    ])
    expect(outcome.plans.map((p) => p.routeId)).toEqual(['free'])
  })
})

describe('toApplyPayload', () => {
  it('uses the snake_case shape apply_optimization_results reads', async () => {
    const { plans } = await planRoutes(createFakeOptimizer(), [
      route('r1', [stop(1), stop(2, { lon: null, lat: null })]),
    ])
    const [payload] = toApplyPayload(plans)
    expect(Object.keys(payload).sort()).toEqual(
      [
        'planned_end',
        'planned_start',
        'polyline',
        'route_id',
        'stops',
        'total_distance_m',
        'total_duration_s',
      ].sort(),
    )
    expect(payload.stops[0]).toEqual({
      stop_id: 's1',
      sequence: 1,
      planned_arrival: expect.any(String),
      planned_departure: expect.any(String),
      travel_distance_m: expect.any(Number),
      travel_duration_s: expect.any(Number),
    })
    expect(payload.stops[1]).toMatchObject({
      stop_id: 's2',
      sequence: 2,
      planned_arrival: null,
      travel_duration_s: null,
    })
  })
})
