/**
 * Route helpers for the demo map. Positions are 0-100 map units; drive time is
 * estimated from straight-line distance. ADR 0006 plans an external route
 * optimizer; `optimizeOrder` is a nearest-neighbour stand-in until then.
 */
import { fromMinutes, toMinutes } from './format'
import type { Job, Property } from './types'

export const DEPOT = { x: 48, y: 56 }

export function driveMinutes(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const d = Math.hypot(a.x - b.x, a.y - b.y)
  return Math.round(4 + d * 0.42)
}

export interface RouteStop {
  job: Job
  property: Property
  driveFromPrev: number
  eta: string
}

export function buildRoute(
  jobs: Array<Job>,
  propertyOf: (id: string) => Property | undefined,
): Array<RouteStop> {
  const ordered = [...jobs].sort((a, b) => a.start.localeCompare(b.start))
  let prev: { x: number; y: number } = DEPOT
  const stops: Array<RouteStop> = []
  for (const job of ordered) {
    const property = propertyOf(job.property_id)
    if (!property) continue
    const drive = driveMinutes(prev, property)
    stops.push({ job, property, driveFromPrev: drive, eta: job.start })
    prev = property
  }
  return stops
}

/** Nearest-neighbour order from the yard; returns new start times packed back-to-back. */
export function optimizeOrder(
  jobs: Array<Job>,
  propertyOf: (id: string) => Property | undefined,
  dayStart = '08:00',
): Array<{ id: string; start: string }> {
  const remaining = jobs.filter((j) => propertyOf(j.property_id))
  let pos: { x: number; y: number } = DEPOT
  let cursor = toMinutes(dayStart)
  const out: Array<{ id: string; start: string }> = []
  while (remaining.length) {
    let best = 0
    let bestD = Infinity
    remaining.forEach((j, i) => {
      const p = propertyOf(j.property_id)!
      const d = driveMinutes(pos, p)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    const [job] = remaining.splice(best, 1)
    const p = propertyOf(job.property_id)!
    cursor += out.length ? bestD : 0
    cursor = Math.ceil(cursor / 5) * 5
    out.push({ id: job.id, start: fromMinutes(cursor) })
    cursor += job.durationMinutes
    pos = p
  }
  return out
}

export function totalDrive(stops: Array<RouteStop>) {
  if (!stops.length) return 0
  const back = driveMinutes(stops[stops.length - 1].property, DEPOT)
  return stops.reduce((s, x) => s + x.driveFromPrev, 0) + back
}
