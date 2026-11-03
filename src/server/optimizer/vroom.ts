import * as Sentry from '@sentry/tanstackstart-react'
import { z } from 'zod'

import { decodePolyline } from '#/lib/map/polyline'
import { joinUrl, requestJson } from './http'
import { createOsrmClient } from './osrm'
import { OptimizerError } from './types'
import type {
  OptimizeRequest,
  OptimizeResult,
  OptimizedRoute,
  Optimizer,
  OptimizerCallOptions,
} from './types'

// VROOM HTTP API: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
// `POST /` with vehicles and jobs; times are integer seconds, locations are
// [lon, lat]. VROOM needs numeric ids, so ours are replaced by 1-based
// indexes and mapped back. Every job carries the skill of the one vehicle
// that may serve it, which keeps each stop on its own crew's route.

const step = z.object({
  type: z.string(),
  id: z.number().int().optional(),
  arrival: z.number().finite().nonnegative(),
  duration: z.number().finite().nonnegative(),
  distance: z.number().finite().nonnegative().optional(),
  waiting_time: z.number().finite().nonnegative().optional(),
})
const route = z.object({
  vehicle: z.number().int(),
  steps: z.array(step),
  geometry: z.string().optional(),
  distance: z.number().finite().nonnegative().optional(),
  duration: z.number().finite().nonnegative(),
  service: z.number().finite().nonnegative().optional(),
  waiting_time: z.number().finite().nonnegative().optional(),
})
const payload = z.object({
  code: z.number().int(),
  routes: z.array(route),
  unassigned: z.array(z.object({ id: z.number().int() })).default([]),
})

const UNPLACED_REASON =
  'The optimizer could not fit this visit into the crew’s day.'

const bad = () =>
  new OptimizerError(
    'bad_response',
    'The route optimizer returned an unexpected response.',
  )

/** What VROOM is sent. Exported for tests and the payload record. */
export function buildVroomRequest(request: OptimizeRequest) {
  const vehicleIndex = new Map(request.vehicles.map((v, i) => [v.id, i + 1]))
  return {
    body: {
      vehicles: request.vehicles.map((v, i) => ({
        id: i + 1,
        ...(v.start ? { start: [v.start.lon, v.start.lat] } : {}),
        ...(v.end ? { end: [v.end.lon, v.end.lat] } : {}),
        time_window: v.timeWindow,
        skills: [i + 1],
      })),
      jobs: request.jobs.map((j, i) => ({
        id: i + 1,
        location: [j.location.lon, j.location.lat],
        service: j.serviceSeconds,
        ...(j.timeWindow ? { time_windows: [j.timeWindow] } : {}),
        skills: [vehicleIndex.get(j.vehicleId) ?? 0],
      })),
      options: { g: true },
    },
    vehicleIndex,
  }
}

/** Validates VROOM's answer against what was asked and maps ids back. */
export function parseVroomResponse(
  request: OptimizeRequest,
  body: unknown,
): OptimizeResult {
  const parsed = payload.safeParse(body)
  if (!parsed.success || parsed.data.code !== 0) throw bad()

  const jobs = request.jobs
  const seen = new Set<number>()
  const claim = (id: number) => {
    if (!Number.isInteger(id) || id < 1 || id > jobs.length || seen.has(id)) {
      throw bad()
    }
    seen.add(id)
    return jobs[id - 1]
  }

  const routes: Array<OptimizedRoute> = []
  const usedVehicles = new Set<number>()
  for (const r of parsed.data.routes) {
    const vehicle = request.vehicles.at(r.vehicle - 1)
    if (!vehicle || r.vehicle < 1 || usedVehicles.has(r.vehicle)) throw bad()
    usedVehicles.add(r.vehicle)

    const steps: OptimizedRoute['steps'] = []
    let prevDuration = 0
    let prevDistance: number | null = 0
    for (const s of r.steps) {
      if (s.type !== 'job') {
        if (s.type === 'start') {
          prevDuration = s.duration
          prevDistance = s.distance ?? prevDistance
        }
        continue
      }
      if (s.id === undefined) throw bad()
      const job = claim(s.id)
      if (job.vehicleId !== vehicle.id) throw bad()
      const distance: number | null =
        s.distance !== undefined && prevDistance !== null
          ? s.distance - prevDistance
          : null
      steps.push({
        jobId: job.id,
        arrival: Math.round(s.arrival + (s.waiting_time ?? 0)),
        travelSeconds: Math.max(0, Math.round(s.duration - prevDuration)),
        travelMeters:
          distance === null ? null : Math.max(0, Math.round(distance)),
      })
      prevDuration = s.duration
      prevDistance = s.distance ?? null
    }

    const polyline =
      r.geometry && decodePolyline(r.geometry) ? r.geometry : undefined
    routes.push({
      vehicleId: vehicle.id,
      steps,
      polyline,
      distance: r.distance === undefined ? null : Math.round(r.distance),
      duration: Math.round(
        r.duration + (r.service ?? 0) + (r.waiting_time ?? 0),
      ),
    })
  }

  const unassigned = parsed.data.unassigned.map((u) => ({
    jobId: claim(u.id).id,
    reason: UNPLACED_REASON,
  }))
  // A job VROOM mentioned nowhere is not silently dropped.
  jobs.forEach((job, i) => {
    if (!seen.has(i + 1))
      unassigned.push({ jobId: job.id, reason: UNPLACED_REASON })
  })
  return { routes, unassigned }
}

export function createVroomOptimizer(options: {
  vroomUrl: string
  osrmUrl?: string
  timeoutMs: number
  fetch?: typeof fetch
}): Optimizer {
  const osrm = options.osrmUrl
    ? createOsrmClient({
        baseUrl: options.osrmUrl,
        timeoutMs: options.timeoutMs,
        fetch: options.fetch,
      })
    : null

  return {
    name: 'vroom',
    async optimize(request, call: OptimizerCallOptions = {}) {
      if (!request.jobs.length) return { routes: [], unassigned: [] }
      const { body } = buildVroomRequest(request)
      return Sentry.startSpan(
        {
          name: 'optimizer.vroom.solve',
          op: 'http.client',
          attributes: {
            'optimizer.vehicles': request.vehicles.length,
            'optimizer.jobs': request.jobs.length,
          },
        },
        async () => {
          const response = await requestJson(
            joinUrl(options.vroomUrl, '/'),
            {
              method: 'POST',
              body,
              timeoutMs: options.timeoutMs,
              signal: call.signal,
              label: 'route optimizer',
            },
            options.fetch,
          )
          const result = parseVroomResponse(request, response)
          call.onExchange?.({ service: 'vroom', request: body, response })
          return result
        },
      )
    },
    ...(osrm ? { legs: osrm.legs } : {}),
  }
}
