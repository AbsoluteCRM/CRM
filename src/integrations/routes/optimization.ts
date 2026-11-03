// Pure helpers about an optimized route, shared by the routes procedures
// (which compute `stale`) and the Route Builder UI. See ADR 0015.

export type OptimizedStopFacts = {
  visitId: string
  sequence: number
  plannedArrival: string | null
  updatedAt: string | null
}

export type OptimizedRouteFacts = {
  status: string
  /** `routes.optimized_stop_count`, written by the last optimization. */
  optimizedStopCount: number | null
  /** `routes.updated_at`. */
  updatedAt: string | null
  /** The run that produced the result. Null when it is gone. */
  run: {
    finishedAt: string | null
    unassignedVisitIds: ReadonlyArray<string>
  } | null
  stops: ReadonlyArray<OptimizedStopFacts>
}

const ms = (value: string | null) => {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

/**
 * Whether an `optimized` route no longer matches the result it was given.
 * True when:
 * - the run is gone, or never finished;
 * - the stop count is not the count the run optimized;
 * - a stop has no planned arrival and the run did not leave it unassigned
 *   (it was added or moved in after the run);
 * - planned arrivals do not increase along the stop sequence (reordered);
 * - the route or a stop changed after the run finished.
 */
export function isOptimizationStale(route: OptimizedRouteFacts): boolean {
  if (route.status !== 'optimized') return false
  const finished = ms(route.run?.finishedAt ?? null)
  if (!route.run || finished === null) return true
  if (
    route.optimizedStopCount === null ||
    route.optimizedStopCount !== route.stops.length
  ) {
    return true
  }
  const unassigned = new Set(route.run.unassignedVisitIds)
  const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence)
  let last = -Infinity
  for (const stop of ordered) {
    const arrival = ms(stop.plannedArrival)
    if (arrival === null) {
      if (!unassigned.has(stop.visitId)) return true
      continue
    }
    if (arrival < last) return true
    last = arrival
  }
  const touched = [route.updatedAt, ...route.stops.map((s) => s.updatedAt)]
  return touched.some((t) => {
    const at = ms(t)
    return at !== null && at > finished
  })
}
