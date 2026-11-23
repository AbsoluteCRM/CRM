import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { dbError } from './errors'
import { organizationProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

const CREW_COLUMNS =
  'id, organization_id, name, color, vehicle, default_start_time, max_work_minutes, archived_at, created_at, updated_at'

const manageCrews = requireOrgPermission('manageCrews')

export const crewsRouter = {
  // Membership is verified; RLS also limits rows to the caller's orgs.
  list: organizationProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('crews')
      .select(`${CREW_COLUMNS}, crew_members(member_id, is_lead)`)
      .eq('organization_id', ctx.organizationId)
      .is('archived_at', null)
      .order('name', { ascending: true })
    if (error) throw dbError(error)
    return data
  }),

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
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('crews')
        .insert({
          organization_id: ctx.organizationId,
          name: input.name,
          color: input.color ?? null,
        })
        .select(`${CREW_COLUMNS}, crew_members(member_id, is_lead)`)
        .single()
      if (error) throw dbError(error)
      return data
    }),

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
    .mutation(async ({ ctx, input }) => {
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
      if (error) throw dbError(error)
      if (data.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Crew not found' })
      }
      return { id: input.crewId }
    }),

  moveMember: manageCrews
    .input(z.object({ memberId: z.uuid(), crewId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc('move_crew_member', {
        p_organization_id: ctx.organizationId,
        p_member_id: input.memberId,
        p_crew_id: input.crewId,
      })
      if (error) throw dbError(error)
    }),

  setLead: manageCrews
    .input(z.object({ crewId: z.uuid(), memberId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc('set_crew_lead', {
        p_organization_id: ctx.organizationId,
        p_crew_id: input.crewId,
        p_member_id: input.memberId,
      })
      if (error) throw dbError(error)
    }),
} satisfies TRPCRouterRecord
