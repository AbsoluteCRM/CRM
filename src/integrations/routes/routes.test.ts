import { describe, expect, it } from 'vitest'

import {
  applyAdd,
  applyMove,
  applyRemove,
  applyReorder,
  isPendingStop,
} from './routes'
import type { AvailableVisit, Board, DayRoute, RouteStop } from './routes'

const visit = (n: number, minutes = 30, windowStart: string | null = null) =>
  ({
    visitId: `v${n}`,
    durationMinutes: minutes,
    windowStart,
    windowEnd: null,
    jobId: `j${n}`,
    clientId: `c${n}`,
    jobNumber: `J-${n}`,
    jobTitle: 'Mow',
    clientName: `Client ${n}`,
    propertyId: `p${n}`,
    address: `${n} Main St`,
    city: 'Calgary',
    latitude: null,
    longitude: null,
    preferredCrewName: null,
    areaId: null,
    areaName: null,
    areaColor: null,
    areaCrewName: null,
  }) satisfies AvailableVisit

const stop = (n: number, sequence: number, minutes = 30): RouteStop => ({
  id: `s${n}`,
  sequence,
  isLocked: false,
  plannedArrival: null,
  plannedDeparture: null,
  travelDistanceM: null,
  travelDurationS: null,
  ...visit(n, minutes),
})

const route = (id: string, stops: Array<RouteStop>): DayRoute => ({
  id,
  date: '2026-11-03',
  status: 'draft',
  editable: true,
  plannedStart: null,
  plannedEnd: null,
  crew: { id: `crew-${id}`, name: id, color: null, vehicle: null },
  stops,
  totals: {
    stops: stops.length,
    onSiteMinutes: stops.reduce((n, s) => n + s.durationMinutes, 0),
  },
  road: null,
})

const board = (): Board => ({
  routes: [
    route('a', [stop(1, 1, 10), stop(2, 2, 20), stop(3, 3, 30)]),
    route('b', [stop(4, 1, 40)]),
  ],
  available: [visit(5, 50), visit(6, 60)],
})

const order = (b: Board, id: string) =>
  b.routes.find((r) => r.id === id)!.stops.map((s) => `${s.id}:${s.sequence}`)

describe('applyAdd', () => {
  it('appends by default, renumbers and removes the visit from the pool', () => {
    const next = applyAdd(board(), 'v5', 'b')
    expect(order(next, 'b')).toEqual(['s4:1', 'pending:v5:2'])
    expect(next.available.map((v) => v.visitId)).toEqual(['v6'])
    expect(next.routes[1].totals).toEqual({ stops: 2, onSiteMinutes: 90 })
  })

  it('inserts at a position, clamped to the ends', () => {
    expect(order(applyAdd(board(), 'v5', 'a', 1), 'a')).toEqual([
      'pending:v5:1',
      's1:2',
      's2:3',
      's3:4',
    ])
    expect(order(applyAdd(board(), 'v5', 'a', 99), 'a').at(-1)).toBe(
      'pending:v5:4',
    )
    expect(order(applyAdd(board(), 'v5', 'a', -3), 'a')[0]).toBe('pending:v5:1')
  })

  it('marks the new stop pending', () => {
    const next = applyAdd(board(), 'v5', 'b')
    expect(isPendingStop(next.routes[1].stops[1].id)).toBe(true)
    expect(isPendingStop('s4')).toBe(false)
  })

  it('ignores an unknown visit or route', () => {
    const start = board()
    expect(applyAdd(start, 'nope', 'a')).toBe(start)
    expect(applyAdd(start, 'v5', 'nope')).toBe(start)
  })
})

describe('applyMove', () => {
  it('moves a stop to another route at a position and renumbers both', () => {
    const next = applyMove(board(), 's2', 'b', 1)
    expect(order(next, 'a')).toEqual(['s1:1', 's3:2'])
    expect(order(next, 'b')).toEqual(['s2:1', 's4:2'])
    expect(next.routes[0].totals).toEqual({ stops: 2, onSiteMinutes: 40 })
    expect(next.routes[1].totals).toEqual({ stops: 2, onSiteMinutes: 60 })
  })

  it('clamps a position past the end', () => {
    expect(order(applyMove(board(), 's1', 'b', 99), 'b')).toEqual([
      's4:1',
      's1:2',
    ])
  })

  it('reorders within a route', () => {
    expect(order(applyMove(board(), 's1', 'a', 3), 'a')).toEqual([
      's2:1',
      's3:2',
      's1:3',
    ])
    expect(order(applyMove(board(), 's3', 'a', 1), 'a')).toEqual([
      's3:1',
      's1:2',
      's2:3',
    ])
  })

  it('leaves the pool alone and ignores unknown ids', () => {
    const start = board()
    expect(applyMove(start, 's1', 'b', 1).available).toBe(start.available)
    expect(applyMove(start, 'nope', 'b', 1)).toBe(start)
    expect(applyMove(start, 's1', 'nope', 1)).toBe(start)
  })

  it('does not mutate its input', () => {
    const start = board()
    applyMove(start, 's1', 'b', 1)
    expect(order(start, 'a')).toEqual(['s1:1', 's2:2', 's3:3'])
  })
})

describe('applyRemove', () => {
  it('returns the visit to the pool without the stop fields and closes the gap', () => {
    const next = applyRemove(board(), 's1')
    expect(order(next, 'a')).toEqual(['s2:1', 's3:2'])
    const back = next.available.find((v) => v.visitId === 'v1')
    expect(back).toBeDefined()
    expect(back).not.toHaveProperty('sequence')
    expect(back).not.toHaveProperty('isLocked')
    expect(back).not.toHaveProperty('id')
  })

  it('keeps the pool ordered by arrival window, unwindowed last', () => {
    const start: Board = {
      routes: [
        route('a', [
          {
            ...stop(1, 1),
            windowStart: '2026-11-03T15:00:00Z',
          },
        ]),
      ],
      available: [visit(2, 30, '2026-11-03T16:00:00Z'), visit(3, 30, null)],
    }
    expect(applyRemove(start, 's1').available.map((v) => v.visitId)).toEqual([
      'v1',
      'v2',
      'v3',
    ])
  })

  it('ignores an unknown stop', () => {
    const start = board()
    expect(applyRemove(start, 'nope')).toBe(start)
  })
})

describe('applyReorder', () => {
  it('applies the given order and renumbers', () => {
    expect(order(applyReorder(board(), 'a', ['s3', 's1', 's2']), 'a')).toEqual([
      's3:1',
      's1:2',
      's2:3',
    ])
  })

  it('ignores an order that does not name every stop', () => {
    const start = board()
    expect(order(applyReorder(start, 'a', ['s3', 's1']), 'a')).toEqual([
      's1:1',
      's2:2',
      's3:3',
    ])
    expect(order(applyReorder(start, 'a', ['s3', 's1', 'x']), 'a')).toEqual([
      's1:1',
      's2:2',
      's3:3',
    ])
  })

  it('leaves other routes alone', () => {
    const start = board()
    expect(applyReorder(start, 'a', ['s3', 's1', 's2']).routes[1]).toBe(
      start.routes[1],
    )
  })
})
