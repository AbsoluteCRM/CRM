// Server-only route optimizer types. See ADR 0015 and docs/plans/route-optimizer.md.
// Times are Unix seconds, distances metres, durations seconds.
import type { LonLat } from '#/lib/map/geo'

export type { LonLat }

/** A crew's truck for one route. */
export type OptimizerVehicle = {
  id: string
  /** Null = the route starts at its first stop. */
  start: LonLat | null
  /** Null = the route ends at its last stop. */
  end: LonLat | null
  /** The shift: [earliest start, latest finish]. */
  timeWindow: [number, number]
}

/** A visit to place. */
export type OptimizerJob = {
  id: string
  /** The only vehicle allowed to serve this job (stops stay on their crew). */
  vehicleId: string
  location: LonLat
  serviceSeconds: number
  /** The customer's arrival window, if any: [earliest, latest]. */
  timeWindow: [number, number] | null
}

export type OptimizeRequest = {
  vehicles: Array<OptimizerVehicle>
  jobs: Array<OptimizerJob>
}

export type OptimizedStep = {
  jobId: string
  /** When service starts (after waiting for a window to open). */
  arrival: number
  /** Driving from the previous point (or the depot). */
  travelSeconds: number
  /** Null when the solver did not report distances. */
  travelMeters: number | null
}

export type OptimizedRoute = {
  vehicleId: string
  steps: Array<OptimizedStep>
  /** Encoded polyline (precision 5) when the solver supplied geometry. */
  polyline?: string
  /** Metres, or null when not reported. */
  distance: number | null
  /** Seconds from the shift start to the end: driving, waiting and service. */
  duration: number
}

export type OptimizeResult = {
  routes: Array<OptimizedRoute>
  unassigned: Array<{ jobId: string; reason: string }>
}

/** Road legs between consecutive points and the drawn geometry. */
export type RoadLegs = {
  /** One per consecutive pair, so `points.length - 1`. */
  legs: Array<{ meters: number; seconds: number }>
  /** Encoded polyline (precision 5). */
  polyline: string
}

/** A request/response pair, recorded for `optimization_run_payloads`. */
export type Exchange = { service: string; request: unknown; response: unknown }

export type OptimizerCallOptions = {
  signal?: AbortSignal
  /** Called once per solver call with what was sent and received. */
  onExchange?: (exchange: Exchange) => void
}

export interface Optimizer {
  /** Stored in `optimization_runs.provider`. */
  readonly name: string
  /** Orders each vehicle's jobs. Throws `OptimizerError` on any failure. */
  optimize: (
    request: OptimizeRequest,
    options?: OptimizerCallOptions,
  ) => Promise<OptimizeResult>
  /**
   * Road legs and geometry for points visited in this order. Needed to
   * re-time a route whose order the solver did not choose (locked stops).
   */
  legs?: (
    points: ReadonlyArray<LonLat>,
    options?: OptimizerCallOptions,
  ) => Promise<RoadLegs>
}

export type OptimizerErrorCode =
  'not_configured' | 'timeout' | 'unreachable' | 'bad_status' | 'bad_response'

/**
 * A failure of the optimizer. The message is plain and safe to show staff and
 * to store on the run: it never holds a URL, a coordinate or a response body.
 */
export class OptimizerError extends Error {
  readonly code: OptimizerErrorCode
  constructor(code: OptimizerErrorCode, message: string) {
    super(message)
    this.name = 'OptimizerError'
    this.code = code
  }
}

/** What the app tells staff about the optimizer. No URLs, no secrets. */
export type OptimizerInfo =
  | { available: true; provider: string; reason: null }
  | { available: false; provider: string; reason: string }
