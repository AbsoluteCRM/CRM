import type { OptimizerInputs } from './inputs'
import type {
  LonLat,
  OptimizeRequest,
  OptimizeResult,
  Optimizer,
  OptimizerCallOptions,
  OptimizerJob,
  OptimizerVehicle,
} from './types'

// Turns a date's open routes into a solver request, and the solver's answer
// into what `apply_optimization_results` stores. Pure apart from the calls to
// the optimizer it is given.
//
// - Each stop stays on its own route's crew (one vehicle per route).
// - Locked stops keep their sequence number. The solver orders the unlocked
//   stops that have a location; they fill the remaining positions in that
//   order. Because the solver did not choose that order, the whole route is
//   then re-timed from road legs (`optimizer.legs`).
// - Stops the solver could not fit, and stops with no location, stay on the
//   route after the placed ones in their old order, with no planned times.

type InputRoute = OptimizerInputs['routes'][number]
type InputStop = InputRoute['stops'][number]

/** Default shift length when the crew sets no `max_work_minutes`. */
export const DEFAULT_SHIFT_MINUTES = 12 * 60

export type PlanSkipReason =
  | 'no_stops'
  | 'no_start_time'
  | 'no_locations'
  | 'locked_stop_has_no_location'
  | 'locked_needs_road_legs'
  | 'locked_position_invalid'

export const SKIP_MESSAGES: Record<PlanSkipReason, string> = {
  no_stops: 'it has no stops',
  no_start_time: 'it has no start time',
  no_locations: 'none of its stops has a map location',
  locked_stop_has_no_location: 'a locked stop has no map location',
  locked_needs_road_legs:
    'it has locked stops and the road network service is not set up',
  locked_position_invalid: 'its locked stops have unusable positions',
}

export type PlannedStop = {
  stopId: string
  visitId: string
  sequence: number
  plannedArrival: string | null
  plannedDeparture: string | null
  travelDistanceM: number | null
  travelDurationS: number | null
}

export type RoutePlan = {
  routeId: string
  plannedStart: string
  plannedEnd: string
  totalDistanceM: number | null
  totalDurationS: number
  polyline: string | null
  stops: Array<PlannedStop>
}

export type PlanOutcome = {
  plans: Array<RoutePlan>
  skipped: Array<{ routeId: string; reason: PlanSkipReason }>
  /** Visits left without planned times (solver could not fit them, or no location). */
  unassignedVisitIds: Array<string>
}

const toEpoch = (iso: string | null): number | null => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
}
const toIso = (seconds: number) => new Date(seconds * 1000).toISOString()

const located = (s: InputStop): s is InputStop & { lon: number; lat: number } =>
  s.lon !== null && s.lat !== null
const point = (s: { lon: number; lat: number }): LonLat => ({
  lon: s.lon,
  lat: s.lat,
})

type Eligible = {
  route: InputRoute
  startAt: number
  free: Array<InputStop & { lon: number; lat: number }>
  pinned: Array<InputStop & { lon: number; lat: number }>
  unplaceable: Array<InputStop>
}

/** The solver request for the eligible routes, and which routes were left out. */
export function prepare(
  routes: OptimizerInputs['routes'],
  hasLegs: boolean,
): {
  eligible: Array<Eligible>
  skipped: PlanOutcome['skipped']
  request: OptimizeRequest
} {
  const eligible: Array<Eligible> = []
  const skipped: PlanOutcome['skipped'] = []

  for (const route of routes) {
    const skip = (reason: PlanSkipReason) =>
      skipped.push({ routeId: route.route_id, reason })
    if (!route.stops.length) {
      skip('no_stops')
      continue
    }
    const startAt = toEpoch(route.planned_start)
    if (startAt === null) {
      skip('no_start_time')
      continue
    }
    const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence)
    const lockedStops = ordered.filter((s) => s.is_locked)
    if (!lockedStops.every(located)) {
      skip('locked_stop_has_no_location')
      continue
    }
    if (lockedStops.length && !hasLegs) {
      skip('locked_needs_road_legs')
      continue
    }
    // Sequence numbers must be 1..n for a locked stop to keep its place.
    if (lockedStops.some((s) => s.sequence > ordered.length)) {
      skip('locked_position_invalid')
      continue
    }
    const free = ordered.filter((s) => !s.is_locked && located(s))
    if (!free.length && !lockedStops.length) {
      skip('no_locations')
      continue
    }
    eligible.push({
      route,
      startAt,
      free: free as Eligible['free'],
      pinned: lockedStops,
      unplaceable: ordered.filter((s) => !s.is_locked && !located(s)),
    })
  }

  const vehicles: Array<OptimizerVehicle> = []
  const jobs: Array<OptimizerJob> = []
  for (const e of eligible) {
    if (!e.free.length) continue
    const { route } = e
    vehicles.push({
      id: route.route_id,
      start: route.start,
      end: route.end,
      timeWindow: [
        e.startAt,
        e.startAt + (route.max_work_minutes ?? DEFAULT_SHIFT_MINUTES) * 60,
      ],
    })
    for (const s of e.free) {
      const from = toEpoch(s.window_start)
      const to = toEpoch(s.window_end)
      jobs.push({
        id: s.stop_id,
        vehicleId: route.route_id,
        location: point(s),
        serviceSeconds: s.duration_minutes * 60,
        timeWindow:
          from !== null && to !== null && to > from ? [from, to] : null,
      })
    }
  }
  return { eligible, skipped, request: { vehicles, jobs } }
}

/**
 * Plans every route. Throws whatever the optimizer throws (the caller turns
 * that into a failed run); routes the planner cannot handle are `skipped`.
 */
export async function planRoutes(
  optimizer: Optimizer,
  routes: OptimizerInputs['routes'],
  call: OptimizerCallOptions = {},
): Promise<PlanOutcome> {
  const { eligible, skipped, request } = prepare(routes, !!optimizer.legs)
  const solved: OptimizeResult = request.jobs.length
    ? await optimizer.optimize(request, call)
    : { routes: [], unassigned: [] }

  const plans: Array<RoutePlan> = []
  const unassignedVisitIds: Array<string> = []

  for (const e of eligible) {
    const { route } = e
    const answer = solved.routes.find((r) => r.vehicleId === route.route_id)
    const byStop = new Map(e.free.map((s) => [s.stop_id, s]))
    const placedFree = (answer?.steps ?? []).flatMap((st) => {
      const s = byStop.get(st.jobId)
      return s ? [s] : []
    })
    const placedIds = new Set(placedFree.map((s) => s.stop_id))
    const leftOver = [
      ...e.free.filter((s) => !placedIds.has(s.stop_id)),
      ...e.unplaceable,
    ]

    // Final order: locked stops at their numbers, the rest in order.
    const n = route.stops.length
    const slots: Array<InputStop | undefined> = new Array<
      InputStop | undefined
    >(n).fill(undefined)
    for (const s of e.pinned) slots[s.sequence - 1] = s
    if (slots.filter(Boolean).length !== e.pinned.length) {
      skipped.push({
        routeId: route.route_id,
        reason: 'locked_position_invalid',
      })
      continue
    }
    const queue = [...placedFree, ...leftOver]
    const finalOrder: Array<InputStop> = []
    let next = 0
    for (let i = 0; i < n; i++) finalOrder.push(slots[i] ?? queue[next++])

    const timedIds = new Set([...e.pinned.map((s) => s.stop_id), ...placedIds])
    const timed = finalOrder.filter(
      (s): s is InputStop & { lon: number; lat: number } =>
        timedIds.has(s.stop_id),
    )

    const times = new Map<
      string,
      Omit<PlannedStop, 'stopId' | 'visitId' | 'sequence'>
    >()
    let plannedEnd: number
    let totalDistanceM: number | null
    let polyline: string | null

    if (optimizer.legs) {
      const chain: Array<LonLat> = [
        ...(route.start ? [route.start] : []),
        ...timed.map(point),
        ...(route.end ? [route.end] : []),
      ]
      const road =
        chain.length >= 2
          ? await optimizer.legs(chain, call)
          : { legs: [], polyline: '' }
      const hasStart = !!route.start
      let clock = e.startAt
      let meters = 0
      timed.forEach((s, i) => {
        const leg = hasStart
          ? road.legs[i]
          : i === 0
            ? undefined
            : road.legs[i - 1]
        const arrive = clock + (leg?.seconds ?? 0)
        const from = toEpoch(s.window_start)
        const start = from === null ? arrive : Math.max(arrive, from)
        const depart = start + s.duration_minutes * 60
        times.set(s.stop_id, {
          plannedArrival: toIso(start),
          plannedDeparture: toIso(depart),
          travelDistanceM: leg ? leg.meters : null,
          travelDurationS: leg ? leg.seconds : null,
        })
        meters += leg?.meters ?? 0
        clock = depart
      })
      let end = clock
      if (route.end) {
        const back = road.legs.at(-1)
        end += back?.seconds ?? 0
        meters += back?.meters ?? 0
      }
      plannedEnd = end
      totalDistanceM = chain.length >= 2 ? meters : null
      polyline = road.polyline || null
    } else {
      // No locked stops here (prepare skipped those routes), so the solver's
      // order and times are the route.
      for (const st of answer?.steps ?? []) {
        const s = byStop.get(st.jobId)
        if (!s) continue
        times.set(s.stop_id, {
          plannedArrival: toIso(st.arrival),
          plannedDeparture: toIso(st.arrival + s.duration_minutes * 60),
          travelDistanceM: st.travelMeters,
          travelDurationS: st.travelSeconds,
        })
      }
      plannedEnd = e.startAt + (answer?.duration ?? 0)
      totalDistanceM = answer?.distance ?? null
      polyline = answer?.polyline ?? null
    }

    const stops: Array<PlannedStop> = finalOrder.map((s, i) => ({
      stopId: s.stop_id,
      visitId: s.visit_id,
      sequence: i + 1,
      plannedArrival: times.get(s.stop_id)?.plannedArrival ?? null,
      plannedDeparture: times.get(s.stop_id)?.plannedDeparture ?? null,
      travelDistanceM: times.get(s.stop_id)?.travelDistanceM ?? null,
      travelDurationS: times.get(s.stop_id)?.travelDurationS ?? null,
    }))
    for (const s of leftOver) unassignedVisitIds.push(s.visit_id)

    plans.push({
      routeId: route.route_id,
      plannedStart: toIso(e.startAt),
      plannedEnd: toIso(Math.max(plannedEnd, e.startAt)),
      totalDistanceM,
      totalDurationS: Math.max(0, plannedEnd - e.startAt),
      polyline,
      stops,
    })
  }

  return { plans, skipped, unassignedVisitIds }
}

/** The `p_routes` argument of `apply_optimization_results`. */
export function toApplyPayload(plans: ReadonlyArray<RoutePlan>) {
  return plans.map((p) => ({
    route_id: p.routeId,
    planned_start: p.plannedStart,
    planned_end: p.plannedEnd,
    total_distance_m: p.totalDistanceM,
    total_duration_s: p.totalDurationS,
    polyline: p.polyline,
    stops: p.stops.map((s) => ({
      stop_id: s.stopId,
      sequence: s.sequence,
      planned_arrival: s.plannedArrival,
      planned_departure: s.plannedDeparture,
      travel_distance_m: s.travelDistanceM,
      travel_duration_s: s.travelDurationS,
    })),
  }))
}
