import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { isOptimizationStale } from '#/integrations/routes/optimization'
import {
  getOptimizer,
  optimizerInfo as describeOptimizer,
} from '#/server/optimizer'
import {
  RUN_COLUMNS,
  RUN_TIMEOUT_MS,
  RunnerError,
  startOptimization,
} from '#/server/trusted/optimization-runner'
import { dbError } from './errors'
import { requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

// Office staff only. RLS on routes, route_stops and visits says the same.
const manageRoutes = requireOrgPermission('manageJobs')

const date = z.iso.date()

// Never the raw `location` (geography); the generated latitude/longitude
// stand in for it.
// The job's preferred crew and the property's service area (with the area's
// crew) say who is likely to own the visit; the server decides when it builds.
const VISIT_FIELDS =
  'id, duration_minutes, window_start, window_end, jobs(id, number, title, preferred_crew:crews(id, name), clients(id, display_name)), properties(id, address_line1, city, latitude, longitude, service_areas(id, name, color, crews(id, name)))'

// `optimization_runs` is the run that produced the result (or null), used to
// tell whether the result is stale. See src/integrations/routes/optimization.ts.
const ROUTE_FIELDS = `id, route_date, status, crew_id, planned_start, planned_end, total_distance_m, total_duration_s, polyline, optimized_stop_count, updated_at, optimization_run_id, optimization_runs(id, provider, finished_at, unassigned_visit_ids), crews(id, name, color, vehicle), route_stops(id, sequence, is_locked, visit_id, planned_arrival, planned_departure, travel_distance_m, travel_duration_s, updated_at, visits(${VISIT_FIELDS}))`

// Only these routes accept edits; the database enforces the same rule.
const EDITABLE = new Set(['draft', 'optimized'])

type VisitRow = {
  id: string
  duration_minutes: number
  window_start: string | null
  window_end: string | null
  jobs: {
    id: string
    number: string
    title: string
    preferred_crew?: { id: string; name: string } | null
    clients: { id: string; display_name: string } | null
  } | null
  properties: {
    id: string
    address_line1: string
    city: string
    latitude: number | null
    longitude: number | null
    service_areas?: {
      id: string
      name: string
      color: string | null
      crews: { id: string; name: string } | null
    } | null
  } | null
}

/** The display fields of a visit, flat. Null where RLS or a join hid a row. */
export function summarizeVisit(v: VisitRow) {
  return {
    visitId: v.id,
    durationMinutes: v.duration_minutes,
    windowStart: v.window_start,
    windowEnd: v.window_end,
    jobId: v.jobs?.id ?? null,
    clientId: v.jobs?.clients?.id ?? null,
    jobNumber: v.jobs?.number ?? null,
    jobTitle: v.jobs?.title ?? null,
    clientName: v.jobs?.clients?.display_name ?? null,
    propertyId: v.properties?.id ?? null,
    address: v.properties?.address_line1 ?? null,
    city: v.properties?.city ?? null,
    latitude: v.properties?.latitude ?? null,
    longitude: v.properties?.longitude ?? null,
    preferredCrewName: v.jobs?.preferred_crew?.name ?? null,
    areaId: v.properties?.service_areas?.id ?? null,
    areaName: v.properties?.service_areas?.name ?? null,
    areaColor: v.properties?.service_areas?.color ?? null,
    areaCrewName: v.properties?.service_areas?.crews?.name ?? null,
  }
}

type CrewRow = {
  id: string
  name: string
  color: string | null
  vehicle: string | null
}

// The types say these joins always exist; RLS could still hide a row, so the
// parameters are widened to allow null.
function withVisit<T>(visit: VisitRow | null, use: (v: VisitRow) => Array<T>) {
  return visit ? use(visit) : []
}

function summarizeCrew(crew: CrewRow | null) {
  return crew
    ? {
        id: crew.id,
        name: crew.name,
        color: crew.color,
        vehicle: crew.vehicle,
      }
    : null
}

export type VisitSummary = ReturnType<typeof summarizeVisit>

// What generate_draft_routes returns (jsonb). Parsed, so a change in the
// function shows up as an error here instead of a blank summary in the UI.
const draftResult = z.object({
  assigned: z.number().int(),
  routes_created: z.number().int(),
  remaining: z.number().int(),
  unassigned: z.array(z.object({ visit_id: z.string(), reason: z.string() })),
})

/**
 * A run for the client. A run that is still queued or running long after it
 * should have finished (the server restarted mid-run) is shown as failed.
 */
export function summarizeRun(
  row: {
    id: string
    route_date: string
    status: 'queued' | 'running' | 'succeeded' | 'failed'
    provider: string
    error: string | null
    crew_ids: Array<string>
    unassigned_visit_ids: Array<string>
    started_at: string | null
    finished_at: string | null
    created_at: string
  },
  now: number = Date.now(),
) {
  const active = row.status === 'queued' || row.status === 'running'
  const dead = active && now - Date.parse(row.created_at) > RUN_TIMEOUT_MS
  return {
    id: row.id,
    date: row.route_date,
    status: dead ? ('failed' as const) : row.status,
    provider: row.provider,
    error: dead ? 'The optimization did not finish.' : row.error,
    crewCount: row.crew_ids.length,
    unassignedVisitIds: row.unassigned_visit_ids,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  }
}
export type RunSummary = ReturnType<typeof summarizeRun>

const RUNNER_CODES = {
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  UNAVAILABLE: 'PRECONDITION_FAILED',
  INTERNAL: 'INTERNAL_SERVER_ERROR',
} as const

export const routesRouter = {
  // The date's routes: crew, ordered stops with their visit summaries, totals.
  list: manageRoutes.input(z.object({ date })).query(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from('routes')
      .select(ROUTE_FIELDS)
      .eq('organization_id', ctx.organizationId)
      .eq('route_date', input.date)
      .order('created_at', { ascending: true })
    if (error) throw dbError(error)

    return data.map((route) => {
      const stops = [...route.route_stops]
        .sort((a, b) => a.sequence - b.sequence)
        .flatMap((stop) => {
          // The types say a stop always has its visit; RLS could still hide it.
          return withVisit(stop.visits, (visit) => [
            {
              id: stop.id,
              sequence: stop.sequence,
              isLocked: stop.is_locked,
              plannedArrival: stop.planned_arrival ?? null,
              plannedDeparture: stop.planned_departure ?? null,
              travelDistanceM: stop.travel_distance_m ?? null,
              travelDurationS: stop.travel_duration_s ?? null,
              ...summarizeVisit(visit),
            },
          ])
        })
      const run = route.optimization_runs ?? null
      return {
        id: route.id,
        date: route.route_date,
        status: route.status,
        editable: EDITABLE.has(route.status),
        plannedStart: route.planned_start,
        plannedEnd: route.planned_end ?? null,
        crew: summarizeCrew(route.crews),
        stops,
        totals: {
          stops: stops.length,
          onSiteMinutes: stops.reduce((n, s) => n + s.durationMinutes, 0),
        },
        // Road figures from the last optimization; null until one has run.
        road:
          route.status === 'optimized' && route.total_duration_s != null
            ? {
                distanceM: route.total_distance_m ?? null,
                durationS: route.total_duration_s,
                polyline: route.polyline ?? null,
                provider: run?.provider ?? null,
                optimizedAt: run?.finished_at ?? null,
                stale: isOptimizationStale({
                  status: route.status,
                  optimizedStopCount: route.optimized_stop_count ?? null,
                  updatedAt: route.updated_at,
                  run: run
                    ? {
                        finishedAt: run.finished_at,
                        unassignedVisitIds: run.unassigned_visit_ids,
                      }
                    : null,
                  stops: route.route_stops.map((s) => ({
                    visitId: s.visit_id,
                    sequence: s.sequence,
                    plannedArrival: s.planned_arrival ?? null,
                    updatedAt: s.updated_at,
                  })),
                }),
              }
            : null,
      }
    })
  }),

  // Scheduled visits on the date that are not on any route.
  availableVisits: manageRoutes
    .input(z.object({ date }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('visits')
        .select(`${VISIT_FIELDS}, route_stops(id)`)
        .eq('organization_id', ctx.organizationId)
        .eq('scheduled_date', input.date)
        .eq('status', 'scheduled')
        .is('route_stops', null)
        .order('window_start', { ascending: true, nullsFirst: false })
      if (error) throw dbError(error)
      return data.map(summarizeVisit)
    }),

  create: manageRoutes
    .input(z.object({ date, crewId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc('create_route', {
        p_organization_id: ctx.organizationId,
        p_route_date: input.date,
        p_crew_id: input.crewId,
      })
      if (error) throw dbError(error)
      return { id: data }
    }),

  // routes.crew_id is fixed, so this builds a route for the new crew and
  // retires the old one: the returned id is the route to use from now on.
  assignCrew: manageRoutes
    .input(z.object({ routeId: z.uuid(), crewId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc('change_route_crew', {
        p_organization_id: ctx.organizationId,
        p_route_id: input.routeId,
        p_crew_id: input.crewId,
      })
      if (error) throw dbError(error)
      return { id: data }
    }),

  addStop: manageRoutes
    .input(
      z.object({
        routeId: z.uuid(),
        visitId: z.uuid(),
        position: z.number().int().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc('add_route_stop', {
        p_organization_id: ctx.organizationId,
        p_route_id: input.routeId,
        p_visit_id: input.visitId,
        p_position: input.position,
      })
      if (error) throw dbError(error)
      return { id: data }
    }),

  // To another route or within its own route; position is 1-based.
  moveStop: manageRoutes
    .input(
      z.object({
        stopId: z.uuid(),
        toRouteId: z.uuid(),
        position: z.number().int().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc('move_route_stop', {
        p_organization_id: ctx.organizationId,
        p_stop_id: input.stopId,
        p_to_route_id: input.toRouteId,
        p_position: input.position,
      })
      if (error) throw dbError(error)
    }),

  // stopIds is the route's complete new order.
  reorderStops: manageRoutes
    .input(
      z.object({
        routeId: z.uuid(),
        stopIds: z
          .array(z.uuid())
          .min(1)
          .refine((ids) => new Set(ids).size === ids.length, {
            message: 'Each stop can appear once',
          }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc('reorder_route_stops', {
        p_organization_id: ctx.organizationId,
        p_route_id: input.routeId,
        p_stop_ids: input.stopIds,
      })
      if (error) throw dbError(error)
    }),

  removeStop: manageRoutes
    .input(z.object({ stopId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc('remove_route_stop', {
        p_organization_id: ctx.organizationId,
        p_stop_id: input.stopId,
      })
      if (error) throw dbError(error)
    }),

  // Puts the date's scheduled, unrouted visits on draft routes by service
  // area (see generate_draft_routes). Safe to repeat: a second press places
  // nothing new. `unassigned` lists the visits that need a human, with a
  // reason code; `remaining` is how many eligible visits were beyond the
  // per-call cap.
  generateDrafts: manageRoutes
    .input(z.object({ date }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'routes.generateDrafts' }, async () => {
        const { data, error } = await ctx.supabase.rpc(
          'generate_draft_routes',
          { p_organization_id: ctx.organizationId, p_date: input.date },
        )
        if (error) throw dbError(error)
        const parsed = draftResult.safeParse(data)
        if (!parsed.success) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Database error',
            cause: parsed.error,
          })
        }
        return {
          assigned: parsed.data.assigned,
          routesCreated: parsed.data.routes_created,
          remaining: parsed.data.remaining,
          unassigned: parsed.data.unassigned.map((u) => ({
            visitId: u.visit_id,
            reason: u.reason,
          })),
        }
      }),
    ),

  // Whether an optimizer is set up, and if not why. No URLs or secrets.
  optimizerInfo: manageRoutes.query(() => describeOptimizer()),

  // Asks the solver for the best stop order on real roads for the date's
  // draft and optimized routes (or just routeIds). Reads the inputs as the
  // caller (RLS), then the trusted runner records the run, calls the solver
  // in the background and writes the result. Returns at once with the run:
  // poll lastRun / optimizationStatus. With no optimizer, or an unreachable
  // one, the run is recorded as failed with a plain reason and no route
  // changes. Published, in-progress and completed routes are never touched.
  optimize: manageRoutes
    .input(
      z.object({
        date,
        routeIds: z.array(z.uuid()).min(1).max(200).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'routes.optimize' }, async () => {
        const { data, error } = await ctx.supabase.rpc('optimizer_inputs', {
          p_organization_id: ctx.organizationId,
          p_date: input.date,
          p_route_ids: input.routeIds,
        })
        if (error) throw dbError(error)
        try {
          const started = await startOptimization({
            organizationId: ctx.organizationId,
            userId: ctx.user.id,
            date: input.date,
            inputs: data,
            info: describeOptimizer(),
            optimizer: getOptimizer(),
          })
          return {
            run: summarizeRun(started.run),
            skipped: started.skipped.map((s) => ({
              routeId: s.route_id,
              reason: s.reason,
            })),
          }
        } catch (e) {
          if (e instanceof RunnerError) {
            throw new TRPCError({
              code: RUNNER_CODES[e.code],
              message: e.message,
              cause: e,
            })
          }
          throw e
        }
      }),
    ),

  // The date's most recent optimization run, or null.
  lastRun: manageRoutes
    .input(z.object({ date }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('optimization_runs')
        .select(RUN_COLUMNS)
        .eq('organization_id', ctx.organizationId)
        .eq('route_date', input.date)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw dbError(error)
      return data ? summarizeRun(data) : null
    }),

  // One run's state, for polling a run the page already knows about.
  optimizationStatus: manageRoutes
    .input(z.object({ runId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('optimization_runs')
        .select(RUN_COLUMNS)
        .eq('organization_id', ctx.organizationId)
        .eq('id', input.runId)
        .maybeSingle()
      if (error) throw dbError(error)
      if (!data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Optimization run not found',
        })
      }
      return summarizeRun(data)
    }),

  // Only an empty draft route.
  delete: manageRoutes
    .input(z.object({ routeId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc('delete_route', {
        p_organization_id: ctx.organizationId,
        p_route_id: input.routeId,
      })
      if (error) throw dbError(error)
    }),
} satisfies TRPCRouterRecord
