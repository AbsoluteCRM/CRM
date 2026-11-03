import { describe, expect, it, vi } from 'vitest'

import { createOsrmClient } from './osrm'
import {
  buildVroomRequest,
  createVroomOptimizer,
  parseVroomResponse,
} from './vroom'
import { OptimizerError } from './types'
import type { OptimizeRequest } from './types'

const DEPOT = { lon: -114.1, lat: 51 }
const REQUEST: OptimizeRequest = {
  vehicles: [
    { id: 'r1', start: DEPOT, end: DEPOT, timeWindow: [1000, 50_000] },
    { id: 'r2', start: null, end: null, timeWindow: [1000, 50_000] },
  ],
  jobs: [
    {
      id: 'j1',
      vehicleId: 'r1',
      location: { lon: -114.05, lat: 51.05 },
      serviceSeconds: 600,
      timeWindow: [1200, 9000],
    },
    {
      id: 'j2',
      vehicleId: 'r1',
      location: { lon: -114.15, lat: 51.15 },
      serviceSeconds: 600,
      timeWindow: null,
    },
    {
      id: 'j3',
      vehicleId: 'r2',
      location: { lon: -114.2, lat: 51.2 },
      serviceSeconds: 300,
      timeWindow: null,
    },
  ],
}

const GOOD = {
  code: 0,
  summary: { cost: 1 },
  unassigned: [{ id: 3 }],
  routes: [
    {
      vehicle: 1,
      geometry: '_p~iF~ps|U_ulLnnqC',
      distance: 6000,
      duration: 900,
      service: 1200,
      waiting_time: 100,
      steps: [
        { type: 'start', arrival: 1000, duration: 0, distance: 0 },
        {
          type: 'job',
          id: 2,
          arrival: 1300,
          duration: 300,
          distance: 2500,
          waiting_time: 100,
        },
        { type: 'job', id: 1, arrival: 2500, duration: 600, distance: 4000 },
        { type: 'end', arrival: 3300, duration: 900, distance: 6000 },
      ],
    },
  ],
}

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('buildVroomRequest', () => {
  const { body, vehicleIndex } = buildVroomRequest(REQUEST)

  it('numbers vehicles and jobs from 1 and keeps each job on its vehicle', () => {
    expect(vehicleIndex.get('r2')).toBe(2)
    expect(body.vehicles.map((v) => [v.id, v.skills])).toEqual([
      [1, [1]],
      [2, [2]],
    ])
    expect(body.jobs.map((j) => [j.id, j.skills])).toEqual([
      [1, [1]],
      [2, [1]],
      [3, [2]],
    ])
  })

  it('sends [lon, lat], seconds, windows and omits missing depots', () => {
    expect(body.vehicles[0]).toMatchObject({
      start: [-114.1, 51],
      end: [-114.1, 51],
      time_window: [1000, 50_000],
    })
    expect(body.vehicles[1]).not.toHaveProperty('start')
    expect(body.vehicles[1]).not.toHaveProperty('end')
    expect(body.jobs[0]).toMatchObject({
      location: [-114.05, 51.05],
      service: 600,
      time_windows: [[1200, 9000]],
    })
    expect(body.jobs[1]).not.toHaveProperty('time_windows')
  })

  it('asks for route geometry', () => {
    expect(body.options).toEqual({ g: true })
  })
})

describe('parseVroomResponse', () => {
  it('maps ids back and turns running totals into legs', () => {
    const result = parseVroomResponse(REQUEST, GOOD)
    expect(result.routes).toHaveLength(1)
    const [route] = result.routes
    expect(route.vehicleId).toBe('r1')
    expect(route.steps).toEqual([
      // Service starts after the 100 s wait.
      { jobId: 'j2', arrival: 1400, travelSeconds: 300, travelMeters: 2500 },
      { jobId: 'j1', arrival: 2500, travelSeconds: 300, travelMeters: 1500 },
    ])
    expect(route.distance).toBe(6000)
    // Driving + service + waiting.
    expect(route.duration).toBe(2200)
    expect(route.polyline).toBe('_p~iF~ps|U_ulLnnqC')
    expect(result.unassigned).toEqual([
      expect.objectContaining({ jobId: 'j3' }),
    ])
  })

  it('reports jobs the answer never mentions as unassigned', () => {
    const result = parseVroomResponse(REQUEST, {
      ...GOOD,
      unassigned: [],
    })
    expect(result.unassigned.map((u) => u.jobId)).toEqual(['j3'])
  })

  it('drops a geometry that is not a polyline', () => {
    const bad = { ...GOOD, routes: [{ ...GOOD.routes[0], geometry: '!!!' }] }
    expect(parseVroomResponse(REQUEST, bad).routes[0].polyline).toBeUndefined()
  })

  it('reports no distance when the solver gives none', () => {
    const noDistance = {
      ...GOOD,
      routes: [
        {
          ...GOOD.routes[0],
          distance: undefined,
          steps: GOOD.routes[0].steps.map(({ distance: _d, ...s }) => s),
        },
      ],
    }
    const [route] = parseVroomResponse(REQUEST, noDistance).routes
    expect(route.distance).toBeNull()
    expect(route.steps.map((s) => s.travelMeters)).toEqual([null, null])
  })

  const malformed: Array<[string, unknown]> = [
    ['not an object', 'nope'],
    ['a non-zero code', { ...GOOD, code: 1 }],
    ['no routes array', { code: 0 }],
    ['an unknown job id', mutateStep({ id: 99 })],
    ['a job id of zero', mutateStep({ id: 0 })],
    ['a job step with no id', mutateStep({ id: undefined })],
    ['a negative arrival', mutateStep({ arrival: -5 })],
    ['a string duration', mutateStep({ duration: '300' })],
    [
      'the same job twice',
      {
        ...GOOD,
        routes: [
          {
            ...GOOD.routes[0],
            steps: [GOOD.routes[0].steps[1], GOOD.routes[0].steps[1]],
          },
        ],
      },
    ],
    [
      'a job on a vehicle that may not serve it',
      { ...GOOD, routes: [{ ...GOOD.routes[0], vehicle: 2 }] },
    ],
    [
      'an unknown vehicle',
      { ...GOOD, routes: [{ ...GOOD.routes[0], vehicle: 7 }] },
    ],
    ['a vehicle twice', { ...GOOD, routes: [GOOD.routes[0], GOOD.routes[0]] }],
    [
      'an unassigned job that is also routed',
      { ...GOOD, unassigned: [{ id: 1 }] },
    ],
  ]

  it.each(malformed)('rejects %s', (_name, body) => {
    expect(() => parseVroomResponse(REQUEST, body)).toThrow(OptimizerError)
    try {
      parseVroomResponse(REQUEST, body)
    } catch (e) {
      expect((e as OptimizerError).code).toBe('bad_response')
    }
  })
})

function mutateStep(patch: Record<string, unknown>) {
  return {
    ...GOOD,
    routes: [
      {
        ...GOOD.routes[0],
        steps: GOOD.routes[0].steps.map((s, i) =>
          i === 1 ? { ...s, ...patch } : s,
        ),
      },
    ],
  }
}

describe('createVroomOptimizer', () => {
  it('posts to the VROOM root and returns the parsed result', async () => {
    const fetchImpl = vi.fn(() => response(GOOD))
    const exchanges: Array<{ service: string }> = []
    const optimizer = createVroomOptimizer({
      vroomUrl: 'http://vroom.internal:3000/solver/',
      timeoutMs: 1000,
      fetch: fetchImpl,
    })
    const result = await optimizer.optimize(REQUEST, {
      onExchange: (e) => exchanges.push(e),
    })
    expect(result.routes[0].steps.map((s) => s.jobId)).toEqual(['j2', 'j1'])
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(url)).toBe('http://vroom.internal:3000/solver/')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({
      options: { g: true },
    })
    expect(exchanges.map((e) => e.service)).toEqual(['vroom'])
  })

  it('makes no call when there is nothing to place', async () => {
    const fetchImpl = vi.fn()
    const optimizer = createVroomOptimizer({
      vroomUrl: 'http://vroom',
      timeoutMs: 1000,
      fetch: fetchImpl,
    })
    await expect(
      optimizer.optimize({ vehicles: REQUEST.vehicles, jobs: [] }),
    ).resolves.toEqual({ routes: [], unassigned: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('only offers road legs when OSRM is configured', () => {
    const without = createVroomOptimizer({ vroomUrl: 'http://v', timeoutMs: 1 })
    const withOsrm = createVroomOptimizer({
      vroomUrl: 'http://v',
      osrmUrl: 'http://o',
      timeoutMs: 1000,
    })
    expect(without.legs).toBeUndefined()
    expect(withOsrm.legs).toBeTypeOf('function')
  })

  describe('failure', () => {
    const run = (fetchImpl: typeof fetch, timeoutMs = 1000) =>
      createVroomOptimizer({
        vroomUrl: 'http://secret-host:3000',
        timeoutMs,
        fetch: fetchImpl,
      }).optimize(REQUEST)

    it('reports an unreachable solver without its address', async () => {
      const error = await run(() =>
        Promise.reject(new TypeError('connect ECONNREFUSED secret-host:3000')),
      ).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(OptimizerError)
      expect(error).toMatchObject({ code: 'unreachable' })
      expect(String((error as Error).message)).not.toMatch(/secret-host|3000/)
    })

    it('reports an error status', async () => {
      await expect(
        run(() => response({ error: 'boom -114.1,51' }, 500)),
      ).rejects.toMatchObject({
        code: 'bad_status',
        message: expect.not.stringContaining('boom'),
      })
    })

    it('reports a body that is not JSON', async () => {
      await expect(
        run(() => Promise.resolve(new Response('<html>', { status: 200 }))),
      ).rejects.toMatchObject({ code: 'bad_response' })
    })

    it('reports a response that fails validation', async () => {
      await expect(
        run(() => response({ code: 0, routes: 'x' })),
      ).rejects.toMatchObject({ code: 'bad_response' })
    })

    it('times out a solver that never answers', async () => {
      const hang: typeof fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      await expect(run(hang, 20)).rejects.toMatchObject({ code: 'timeout' })
    })

    it('stops when the caller aborts', async () => {
      const controller = new AbortController()
      const hang: typeof fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      const pending = createVroomOptimizer({
        vroomUrl: 'http://v',
        timeoutMs: 5000,
        fetch: hang,
      }).optimize(REQUEST, { signal: controller.signal })
      controller.abort()
      await expect(pending).rejects.toMatchObject({ code: 'unreachable' })
    })
  })
})

describe('OSRM legs', () => {
  const POINTS = [DEPOT, { lon: -114.05, lat: 51.05 }, DEPOT]
  const OK = {
    code: 'Ok',
    routes: [
      {
        geometry: '_p~iF~ps|U_ulLnnqC',
        distance: 9000,
        duration: 1100,
        legs: [
          { distance: 4500.4, duration: 540.2 },
          { distance: 4500, duration: 560 },
        ],
      },
    ],
  }
  const client = (fetchImpl: typeof fetch) =>
    createOsrmClient({
      baseUrl: 'http://osrm:5000',
      timeoutMs: 1000,
      fetch: fetchImpl,
    })

  it('asks for the driving route through the points in order', async () => {
    const fetchImpl = vi.fn(() => response(OK))
    const road = await client(fetchImpl).legs(POINTS)
    const [url] = fetchImpl.mock.calls[0] as unknown as [URL]
    expect(url.pathname).toBe(
      '/route/v1/driving/-114.100000,51.000000;-114.050000,51.050000;-114.100000,51.000000',
    )
    expect(url.searchParams.get('overview')).toBe('full')
    expect(url.searchParams.get('geometries')).toBe('polyline')
    expect(road.legs).toEqual([
      { meters: 4500, seconds: 540 },
      { meters: 4500, seconds: 560 },
    ])
    expect(road.polyline).toBe('_p~iF~ps|U_ulLnnqC')
  })

  it('needs no call for fewer than two points', async () => {
    const fetchImpl = vi.fn()
    await expect(
      client(fetchImpl as unknown as typeof fetch).legs([DEPOT]),
    ).resolves.toEqual({ legs: [], polyline: '' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses more points than OSRM accepts', async () => {
    const many = Array.from({ length: 101 }, () => DEPOT)
    await expect(
      client(vi.fn() as unknown as typeof fetch).legs(many),
    ).rejects.toMatchObject({
      code: 'bad_response',
    })
  })

  const bad: Array<[string, unknown]> = [
    ['NoRoute code', { ...OK, code: 'NoRoute' }],
    ['no routes', { code: 'Ok', routes: [] }],
    [
      'the wrong number of legs',
      { ...OK, routes: [{ ...OK.routes[0], legs: [OK.routes[0].legs[0]] }] },
    ],
    [
      'an invalid geometry',
      { ...OK, routes: [{ ...OK.routes[0], geometry: '~~~' }] },
    ],
    [
      'a negative leg',
      {
        ...OK,
        routes: [
          {
            ...OK.routes[0],
            legs: [{ distance: -1, duration: 1 }, OK.routes[0].legs[1]],
          },
        ],
      },
    ],
  ]
  it.each(bad)('rejects %s', async (_name, body) => {
    await expect(
      client(() => response(body)).legs(POINTS),
    ).rejects.toMatchObject({
      code: 'bad_response',
    })
  })

  it('does not put the coordinates in an error', async () => {
    const error = await client(() => response({}, 500))
      .legs(POINTS)
      .catch((e: unknown) => e)
    expect(String((error as Error).message)).not.toMatch(/114|51\./)
  })
})
