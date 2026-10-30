import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

export const CREW_COLUMNS =
  'id, organization_id, name, color, vehicle, default_start_time, max_work_minutes, disabled_at, archived_at, created_at, updated_at'

const manageCrews = requireOrgPermission('manageCrews')
// Permanent deletes are for owners and managers; delete_crew checks the same.
const deleteCrews = requireOrgPermission('manageTeam')

function toTRPCError(error: { message: string; code?: string }) {
  const code =
    error.code === '23505'
      ? 'CONFLICT'
      : error.code === '42501'
        ? 'FORBIDDEN'
        : error.code === 'P0002' || error.code === '23503'
          ? 'BAD_REQUEST'
          : 'INTERNAL_SERVER_ERROR'
  return new TRPCError({ code, message: error.message, cause: error })
}

export const crewsRouter = {
  // RLS limits rows to orgs the caller belongs to; the org filter picks the active one.
  list: protectedProcedure
    .input(z.object({ organizationId: z.uuid() }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.list' }, async () => {
        const { data, error } = await ctx.supabase
          .from('crews')
          .select(`${CREW_COLUMNS}, crew_members(member_id, is_lead)`)
          .eq('organization_id', input.organizationId)
          .is('archived_at', null)
          .order('name', { ascending: true })
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
            cause: error,
          })
        }
        return data
      }),
    ),

  create: manageCrews
    .input(
      z.object({
        name: z.string().trim().min(1),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .nullish(),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.create' }, async () => {
        const { data, error } = await ctx.supabase
          .from('crews')
          .insert({
            organization_id: ctx.organizationId,
            name: input.name,
            color: input.color ?? null,
          })
          .select(`${CREW_COLUMNS}, crew_members(member_id, is_lead)`)
          .single()
        if (error) throw toTRPCError(error)
        return data
      }),
    ),

  update: manageCrews
    .input(
      z
        .object({
          crewId: z.uuid(),
          name: z.string().trim().min(1).optional(),
          vehicle: z.string().trim().nullable().optional(),
        })
        .refine((v) => v.name !== undefined || v.vehicle !== undefined, {
          message: 'Nothing to update',
        }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.update' }, async () => {
        const { data, error } = await ctx.supabase
          .from('crews')
          .update({
            ...(input.name !== undefined && { name: input.name }),
            ...(input.vehicle !== undefined && {
              vehicle: input.vehicle || null,
            }),
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.crewId)
          .select('id')
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Crew not found' })
        }
        return { id: input.crewId }
      }),
    ),

  // Hidden from the board but kept, with its routes. Its members go back to
  // Unassigned, and the name can be reused while it's archived.
  archive: manageCrews
    .input(z.object({ crewId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.archive' }, async () => {
        const members = await ctx.supabase
          .from('crew_members')
          .delete()
          .eq('organization_id', ctx.organizationId)
          .eq('crew_id', input.crewId)
        if (members.error) throw toTRPCError(members.error)
        const { data, error } = await ctx.supabase
          .from('crews')
          .update({ archived_at: new Date().toISOString() })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.crewId)
          .is('archived_at', null)
          .select('id')
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Crew not found' })
        }
        return { id: input.crewId }
      }),
    ),

  archived: manageCrews.query(({ ctx }) =>
    Sentry.startSpan({ name: 'crews.archived' }, async () => {
      const { data, error } = await ctx.supabase
        .from('crews')
        .select(CREW_COLUMNS)
        .eq('organization_id', ctx.organizationId)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
      if (error) throw toTRPCError(error)
      return data
    }),
  ),

  // Inactive crews stay on the board with their roster but take no new routes.
  setActive: manageCrews
    .input(z.object({ crewId: z.uuid(), active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.setActive' }, async () => {
        const { data, error } = await ctx.supabase
          .from('crews')
          .update({
            disabled_at: input.active ? null : new Date().toISOString(),
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.crewId)
          .is('archived_at', null)
          .select('id')
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Crew not found' })
        }
        return { id: input.crewId }
      }),
    ),

  // Brings an archived crew back, active and empty.
  restore: manageCrews
    .input(z.object({ crewId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.restore' }, async () => {
        const { data, error } = await ctx.supabase
          .from('crews')
          .update({ archived_at: null, disabled_at: null })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.crewId)
          .not('archived_at', 'is', null)
          .select('id')
        if (error?.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Another crew already has this name. Rename it first.',
            cause: error,
          })
        }
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Crew not found' })
        }
        return { id: input.crewId }
      }),
    ),

  history: manageCrews
    .input(z.object({ crewId: z.uuid() }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.history' }, async () => {
        const { data, error } = await ctx.supabase.rpc('crew_history', {
          p_crew_id: input.crewId,
        })
        if (error) throw toTRPCError(error)
        const h = data[0] ?? {
          past_routes: 0,
          upcoming_routes: 0,
          completed_visits: 0,
          last_route_date: null,
        }
        return {
          pastRoutes: h.past_routes,
          upcomingRoutes: h.upcoming_routes,
          completedVisits: h.completed_visits,
          lastRouteDate: h.last_route_date,
        }
      }),
    ),

  // Removes the crew and its routes for good. Each worker's time entries,
  // shifts and completed visits are kept.
  delete: deleteCrews
    .input(z.object({ crewId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.delete' }, async () => {
        const crew = await ctx.supabase
          .from('crews')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.crewId)
          .maybeSingle()
        if (crew.error) throw toTRPCError(crew.error)
        if (!crew.data) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Crew not found' })
        }
        const { data, error } = await ctx.supabase.rpc('delete_crew', {
          p_crew_id: input.crewId,
        })
        if (error?.code === 'P0002') {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Crew not found' })
        }
        if (error) throw toTRPCError(error)
        return { routesRemoved: data }
      }),
    ),

  moveMember: manageCrews
    .input(z.object({ memberId: z.uuid(), crewId: z.uuid().nullable() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.moveMember' }, async () => {
        const { error } = await ctx.supabase.rpc('move_crew_member', {
          p_organization_id: ctx.organizationId,
          p_member_id: input.memberId,
          p_crew_id: input.crewId,
        })
        if (error) throw toTRPCError(error)
      }),
    ),

  setLead: manageCrews
    .input(z.object({ crewId: z.uuid(), memberId: z.uuid().nullable() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.setLead' }, async () => {
        const { error } = await ctx.supabase.rpc('set_crew_lead', {
          p_organization_id: ctx.organizationId,
          p_crew_id: input.crewId,
          p_member_id: input.memberId,
        })
        if (error) throw toTRPCError(error)
      }),
    ),
} satisfies TRPCRouterRecord
