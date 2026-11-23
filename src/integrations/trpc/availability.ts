import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { dbError } from './errors'
import { organizationProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

export const TIME_OFF_COLUMNS =
  'id, member_id, kind, start_date, end_date, note, status, requested_by_member_id, reviewed_by_member_id, reviewed_at, review_note, created_at'

const manageTeam = requireOrgPermission('manageTeam')
const date = z.iso.date()
const kind = z.enum(['sick', 'vacation', 'personal'])
const note = z.string().trim().max(500).nullable()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/)

const range = z
  .object({ start: date, end: date })
  .refine((r) => r.end >= r.start, {
    message: 'The end date is before the start date',
    path: ['end'],
  })

export const availabilityRouter = {
  /**
   * Pending and approved time off overlapping [from, to]. RLS decides whose:
   * office staff see everyone, contractors only themselves.
   */
  timeOff: organizationProcedure
    .input(z.object({ from: date, to: date }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'availability.timeOff' }, async () => {
        const { data, error } = await ctx.supabase
          .from('time_off')
          .select(TIME_OFF_COLUMNS)
          .eq('organization_id', ctx.organizationId)
          .in('status', ['pending', 'approved'])
          .lte('start_date', input.to)
          .gte('end_date', input.from)
          .order('start_date', { ascending: true })
        if (error) throw dbError(error)
        return data
      }),
    ),

  /** Any member asks for time off for themselves; it starts pending. */
  request: organizationProcedure
    .input(range.and(z.object({ kind, note })))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'availability.request' }, async () => {
        const { data, error } = await ctx.supabase.rpc('request_time_off', {
          p_org: ctx.organizationId,
          p_kind: input.kind,
          p_start: input.start,
          p_end: input.end,
          p_note: input.note as string,
        })
        if (error) throw dbError(error)
        return { id: data }
      }),
    ),

  /** Owners and admins record approved time off for a member of this company. */
  record: manageTeam
    .input(range.and(z.object({ memberId: z.uuid(), kind, note })))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'availability.record' }, async () => {
        const member = await ctx.supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.memberId)
          .maybeSingle()
        if (member.error) throw dbError(member.error)
        if (!member.data) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Team member not found',
          })
        }
        const { data, error } = await ctx.supabase.rpc('record_time_off', {
          p_member_id: input.memberId,
          p_kind: input.kind,
          p_start: input.start,
          p_end: input.end,
          p_note: input.note as string,
        })
        if (error) throw dbError(error)
        return { id: data }
      }),
    ),

  /** Owners and admins approve or decline a pending request. */
  review: manageTeam
    .input(z.object({ id: z.uuid(), approve: z.boolean(), note }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'availability.review' }, async () => {
        const { error } = await ctx.supabase.rpc('review_time_off', {
          p_id: input.id,
          p_approve: input.approve,
          p_note: input.note as string,
        })
        if (error) throw dbError(error)
        return { id: input.id }
      }),
    ),

  /** Cancels a request (own pending) or, for managers, any time off. */
  cancel: organizationProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'availability.cancel' }, async () => {
        const { error } = await ctx.supabase.rpc('cancel_time_off', {
          p_id: input.id,
        })
        if (error) throw dbError(error)
        return { id: input.id }
      }),
    ),

  /** Sets a member's weekly work days (ISO 1–7) and daily hours. */
  setSchedule: manageTeam
    .input(
      z
        .object({
          memberId: z.uuid(),
          workDays: z.array(z.number().int().min(1).max(7)).max(7),
          workStart: time,
          workEnd: time,
        })
        .refine((v) => v.workStart.slice(0, 5) < v.workEnd.slice(0, 5), {
          message: 'The day has to end after it starts',
          path: ['workEnd'],
        }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'availability.setSchedule' }, async () => {
        const { data, error } = await ctx.supabase
          .from('organization_members')
          .update({
            work_days: [...new Set(input.workDays)].sort(),
            work_start: input.workStart,
            work_end: input.workEnd,
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.memberId)
          .select('id')
        if (error) throw dbError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Team member not found',
          })
        }
        return { id: input.memberId }
      }),
    ),
} satisfies TRPCRouterRecord
