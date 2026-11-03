import { z } from 'zod'

import { dbError } from './errors'
import { requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

// Office staff only. RLS on routes, route_stops and visits says the same.
const manageRoutes = requireOrgPermission('manageJobs')

const date = z.iso.date()

// Never the raw `location` (geography); the generated latitude/longitude
// stand in for it.
const VISIT_FIELDS =
  'id, duration_minutes, window_start, window_end, jobs(id, number, title, clients(id, display_name)), properties(id, address_line1, city, latitude, longitude)'

const ROUTE_FIELDS = `id, route_date, status, crew_id, planned_start, crews(id, name, color, vehicle), route_stops(id, sequence, is_locked, visit_id, visits(${VISIT_FIELDS}))`

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
    clients: { id: string; display_name: string } | null
  } | null
  properties: {
    id: string
    address_line1: string
    city: string
    latitude: number | null
    longitude: number | null
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
    jobNumber: v.jobs?.number ?? null,
    jobTitle: v.jobs?.title ?? null,
    clientName: v.jobs?.clients?.display_name ?? null,
    propertyId: v.properties?.id ?? null,
    address: v.properties?.address_line1 ?? null,
    city: v.properties?.city ?? null,
    latitude: v.properties?.latitude ?? null,
    longitude: v.properties?.longitude ?? null,
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
              ...summarizeVisit(visit),
            },
          ])
        })
      return {
        id: route.id,
        date: route.route_date,
        status: route.status,
        editable: EDITABLE.has(route.status),
        plannedStart: route.planned_start,
        crew: summarizeCrew(route.crews),
        stops,
        totals: {
          stops: stops.length,
          onSiteMinutes: stops.reduce((n, s) => n + s.durationMinutes, 0),
        },
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
