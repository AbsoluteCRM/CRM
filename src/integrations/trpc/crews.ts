import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

export const CREW_COLUMNS =
  'id, organization_id, name, color, vehicle, default_start_time, max_work_minutes, archived_at, created_at, updated_at'

const manageCrews = requireOrgPermission('manageCrews')

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

  moveMember: manageCrews
    .input(z.object({ memberId: z.uuid(), crewId: z.uuid().nullable() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'crews.moveMember' }, async () => {
        const { error } = await ctx.supabase.rpc('move_crew_member', {
          p_organization_id: ctx.organizationId,
          p_member_id: input.memberId,
          // SQL deliberately accepts null to unassign; generated RPC args omit
          // nullability (20261014180000_crew_builder_mutations.sql).
          p_crew_id: input.crewId as string,
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
          // The same SQL contract accepts null to clear the lead. Keep the
          // runtime null despite the generated RPC argument's string type.
          p_member_id: input.memberId as string,
        })
        if (error) throw toTRPCError(error)
      }),
    ),
} satisfies TRPCRouterRecord
