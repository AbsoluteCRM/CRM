import { describe, expect, it } from 'vitest'

import { isOptimizationStale } from './optimization'
import type { OptimizedRouteFacts } from './optimization'

const FINISHED = '2026-11-03T12:00:05Z'
const fresh = (): OptimizedRouteFacts => ({
  status: 'optimized',
  optimizedStopCount: 2,
  updatedAt: FINISHED,
  run: { finishedAt: FINISHED, unassignedVisitIds: [] },
  stops: [
    {
      visitId: 'v1',
      sequence: 1,
      plannedArrival: '2026-11-03T15:10:00Z',
      updatedAt: FINISHED,
    },
    {
      visitId: 'v2',
      sequence: 2,
      plannedArrival: '2026-11-03T15:50:00Z',
      updatedAt: FINISHED,
    },
  ],
})

describe('isOptimizationStale', () => {
  it('is false for a result nobody has touched', () => {
    expect(isOptimizationStale(fresh())).toBe(false)
  })

  it('is false for a route that is not optimized', () => {
    expect(isOptimizationStale({ ...fresh(), status: 'draft' })).toBe(false)
    expect(
      isOptimizationStale({ ...fresh(), status: 'published', run: null }),
    ).toBe(false)
  })

  it('is true when the run is gone or never finished', () => {
    expect(isOptimizationStale({ ...fresh(), run: null })).toBe(true)
    expect(
      isOptimizationStale({
        ...fresh(),
        run: { finishedAt: null, unassignedVisitIds: [] },
      }),
    ).toBe(true)
  })

  it('is true when a stop was added', () => {
    const route = fresh()
    route.stops = [
      ...route.stops,
      { visitId: 'v3', sequence: 3, plannedArrival: null, updatedAt: FINISHED },
    ]
    expect(isOptimizationStale(route)).toBe(true)
  })

  it('is true when the last stop was removed (the count no longer matches)', () => {
    const route = fresh()
    route.stops = route.stops.slice(0, 1)
    expect(isOptimizationStale(route)).toBe(true)
  })

  it('is true when stops were reordered', () => {
    const route = fresh()
    route.stops = [
      { ...route.stops[0], sequence: 2 },
      { ...route.stops[1], sequence: 1 },
    ]
    expect(isOptimizationStale(route)).toBe(true)
  })

  it('is true when something changed after the run', () => {
    expect(
      isOptimizationStale({ ...fresh(), updatedAt: '2026-11-03T12:30:00Z' }),
    ).toBe(true)
    const route = fresh()
    route.stops = [
      route.stops[0],
      { ...route.stops[1], updatedAt: '2026-11-03T12:30:00Z' },
    ]
    expect(isOptimizationStale(route)).toBe(true)
  })

  it('is true when the stop count was never recorded', () => {
    expect(isOptimizationStale({ ...fresh(), optimizedStopCount: null })).toBe(
      true,
    )
  })

  it('accepts stops the run left unassigned, with no planned time', () => {
    const route = fresh()
    route.optimizedStopCount = 3
    route.run = { finishedAt: FINISHED, unassignedVisitIds: ['v3'] }
    route.stops = [
      ...route.stops,
      { visitId: 'v3', sequence: 3, plannedArrival: null, updatedAt: FINISHED },
    ]
    expect(isOptimizationStale(route)).toBe(false)
  })
})
