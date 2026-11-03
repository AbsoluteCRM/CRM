import * as Sentry from '@sentry/tanstackstart-react'
import { z } from 'zod'

import { decodePolyline } from '#/lib/map/polyline'
import { joinUrl, requestJson } from './http'
import { OptimizerError } from './types'
import type { LonLat, OptimizerCallOptions, RoadLegs } from './types'

// OSRM `route` service: https://project-osrm.org/docs/v5.24.0/api/#route-service
// Gives road distance and time between consecutive points, and the drawn
// geometry as an encoded polyline (precision 5).

/** OSRM's default limit is 100 points per request; stay below it. */
export const OSRM_MAX_POINTS = 100

const leg = z.object({
  distance: z.number().finite().nonnegative(),
  duration: z.number().finite().nonnegative(),
})
const payload = z.object({
  code: z.string(),
  routes: z
    .array(z.object({ geometry: z.string(), legs: z.array(leg) }))
    .min(1),
})

const coordinate = (p: LonLat) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`

export function createOsrmClient(options: {
  baseUrl: string
  timeoutMs: number
  fetch?: typeof fetch
}) {
  return {
    async legs(
      points: ReadonlyArray<LonLat>,
      call: OptimizerCallOptions = {},
    ): Promise<RoadLegs> {
      if (points.length < 2) return { legs: [], polyline: '' }
      if (points.length > OSRM_MAX_POINTS) {
        throw new OptimizerError(
          'bad_response',
          'A route has too many stops to draw on the road network.',
        )
      }
      const url = joinUrl(
        options.baseUrl,
        `route/v1/driving/${points.map(coordinate).join(';')}`,
      )
      url.search = new URLSearchParams({
        overview: 'full',
        geometries: 'polyline',
        steps: 'false',
      }).toString()

      return Sentry.startSpan(
        {
          name: 'optimizer.osrm.route',
          op: 'http.client',
          attributes: { 'optimizer.points': points.length },
        },
        async () => {
          const body = await requestJson(
            url,
            {
              method: 'GET',
              timeoutMs: options.timeoutMs,
              signal: call.signal,
              label: 'road network service',
            },
            options.fetch,
          )
          const parsed = payload.safeParse(body)
          const route = parsed.success ? parsed.data.routes[0] : undefined
          if (
            !parsed.success ||
            parsed.data.code !== 'Ok' ||
            !route ||
            route.legs.length !== points.length - 1 ||
            !decodePolyline(route.geometry)
          ) {
            throw new OptimizerError(
              'bad_response',
              'The road network service returned an unexpected response.',
            )
          }
          call.onExchange?.({
            service: 'osrm',
            request: { points: points.length },
            response: body,
          })
          return {
            legs: route.legs.map((l) => ({
              meters: Math.round(l.distance),
              seconds: Math.round(l.duration),
            })),
            polyline: route.geometry,
          }
        },
      )
    },
  }
}
