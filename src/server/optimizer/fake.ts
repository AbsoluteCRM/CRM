import { encodePolyline } from '#/lib/map/polyline'
import type {
  LonLat,
  OptimizeRequest,
  OptimizeResult,
  OptimizedRoute,
  Optimizer,
  OptimizerCallOptions,
  RoadLegs,
} from './types'

// A deterministic optimizer for tests and stories: nearest neighbour on
// great-circle distance, a constant road speed, and straight-line "roads".
// It honours shifts and arrival windows (late jobs are unassigned) and one
// vehicle per job. It makes no network calls.

const EARTH_M = 6_371_000

export function haversine(a: LonLat, b: LonLat): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export type FakeOptimizerOptions = {
  /** Road speed in metres per second (default 40 km/h). */
  speedMps?: number
  /** Road distance as a multiple of straight-line distance (default 1.3). */
  roadFactor?: number
  /** Throw this from `optimize` and `legs`. */
  fail?: Error
  /** Leave `legs` out, like a VROOM adapter with no OSRM. */
  withoutLegs?: boolean
  name?: string
}

export type FakeOptimizer = Optimizer & {
  requests: Array<OptimizeRequest>
  legCalls: Array<ReadonlyArray<LonLat>>
}

export function createFakeOptimizer(
  options: FakeOptimizerOptions = {},
): FakeOptimizer {
  const speed = options.speedMps ?? 40_000 / 3600
  const factor = options.roadFactor ?? 1.3
  const road = (a: LonLat, b: LonLat) => {
    const meters = Math.round(haversine(a, b) * factor)
    return { meters, seconds: Math.round(meters / speed) }
  }
  const name = options.name ?? 'fake'
  const requests: Array<OptimizeRequest> = []
  const legCalls: Array<ReadonlyArray<LonLat>> = []

  const optimizer: FakeOptimizer = {
    name,
    requests,
    legCalls,

    async optimize(request, call): Promise<OptimizeResult> {
      requests.push(request)
      if (options.fail) throw options.fail
      const routes: Array<OptimizedRoute> = []
      const unassigned: OptimizeResult['unassigned'] = []

      for (const vehicle of request.vehicles) {
        const mine = request.jobs.filter((j) => j.vehicleId === vehicle.id)
        const remaining = [...mine]
        const steps: OptimizedRoute['steps'] = []
        let at: LonLat | null = vehicle.start
        let clock = vehicle.timeWindow[0]
        let meters = 0

        while (remaining.length) {
          let bestIndex = 0
          let bestCost = Infinity
          remaining.forEach((job, i) => {
            const cost = at ? road(at, job.location).meters : 0
            if (cost < bestCost) {
              bestCost = cost
              bestIndex = i
            }
          })
          const [job] = remaining.splice(bestIndex, 1)
          const leg = at ? road(at, job.location) : { meters: 0, seconds: 0 }
          const arrive = clock + leg.seconds
          const start = job.timeWindow
            ? Math.max(arrive, job.timeWindow[0])
            : arrive
          const finish = start + job.serviceSeconds
          if (
            (job.timeWindow && start > job.timeWindow[1]) ||
            finish > vehicle.timeWindow[1]
          ) {
            unassigned.push({ jobId: job.id, reason: 'does not fit' })
            continue
          }
          steps.push({
            jobId: job.id,
            arrival: start,
            travelSeconds: leg.seconds,
            travelMeters: leg.meters,
          })
          meters += leg.meters
          clock = finish
          at = job.location
        }

        if (!steps.length) continue
        if (vehicle.end && at) {
          const back = road(at, vehicle.end)
          meters += back.meters
          clock += back.seconds
        }
        const path = [
          ...(vehicle.start ? [vehicle.start] : []),
          ...steps.map((s) => mine.find((j) => j.id === s.jobId)!.location),
          ...(vehicle.end ? [vehicle.end] : []),
        ]
        routes.push({
          vehicleId: vehicle.id,
          steps,
          polyline: encodePolyline(path),
          distance: meters,
          duration: clock - vehicle.timeWindow[0],
        })
      }
      const result = { routes, unassigned }
      call?.onExchange?.({ service: name, request, response: result })
      return result
    },
  }

  if (!options.withoutLegs) {
    optimizer.legs = async (
      points: ReadonlyArray<LonLat>,
      call?: OptimizerCallOptions,
    ): Promise<RoadLegs> => {
      legCalls.push(points)
      if (options.fail) throw options.fail
      const result = {
        legs: points.slice(1).map((p, i) => {
          const { meters, seconds } = road(points[i], p)
          return { meters, seconds }
        }),
        polyline: encodePolyline(points),
      }
      call?.onExchange?.({
        service: `${name}-legs`,
        request: { points: points.length },
        response: result,
      })
      return result
    }
  }
  return optimizer
}
