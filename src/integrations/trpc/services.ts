import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { organizationProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

export const SERVICE_COLUMNS =
  'id, organization_id, name, description, unit, default_price_cents, default_duration_minutes, color, equipment, frequencies, season_start_month, season_end_month, precipitation_type, precipitation_action, archived_at, created_at, updated_at'

const manageServices = requireOrgPermission('manageServices')

function toTRPCError(error: { message: string; code?: string }) {
  const code =
    error.code === '23505'
      ? 'CONFLICT'
      : error.code === '42501'
        ? 'FORBIDDEN'
        : error.code === '23514' || error.code === '23503'
          ? 'BAD_REQUEST'
          : 'INTERNAL_SERVER_ERROR'
  return new TRPCError({ code, message: error.message, cause: error })
}

const month = z.number().int().min(1).max(12)

const fields = {
  name: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  unit: z.enum([
    'monthly',
    'hour',
    'visit',
    'sqft',
    'linear_ft',
    'yard',
    'bag',
  ]),
  default_price_cents: z.number().int().min(0),
  default_duration_minutes: z.number().int().min(1).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  equipment: z.array(z.string().trim().min(1)),
  frequencies: z
    .array(z.enum(['one_time', 'weekly', 'biweekly', 'monthly']))
    .min(1),
  // Both months or neither; start after end wraps over new year.
  season_start_month: month.nullable(),
  season_end_month: month.nullable(),
  precipitation_type: z.enum(['none', 'rain', 'snow', 'any']).optional(),
  precipitation_action: z.enum(['none', 'schedule', 'reschedule']).optional(),
}

const seasonIsPaired = (v: {
  season_start_month?: number | null
  season_end_month?: number | null
}) =>
  (v.season_start_month === undefined) === (v.season_end_month === undefined) &&
  (v.season_start_month === null) === (v.season_end_month === null)

const seasonMessage = {
  message: 'Set both season months or neither',
  path: ['season_start_month'],
}

const precipitationIsPaired = (v: {
  precipitation_type?: string
  precipitation_action?: string
}) =>
  (v.precipitation_type === undefined) ===
    (v.precipitation_action === undefined) &&
  (v.precipitation_type === 'none') === (v.precipitation_action === 'none')

const precipitationMessage = {
  message: 'Set both precipitation and suggested action, or disable both',
  path: ['precipitation_type'],
}

export const servicesRouter = {
  list: organizationProcedure.query(({ ctx }) =>
    Sentry.startSpan({ name: 'services.list' }, async () => {
      const { data, error } = await ctx.supabase
        .from('services')
        .select(SERVICE_COLUMNS)
        .eq('organization_id', ctx.organizationId)
        .order('name', { ascending: true })
      if (error) throw toTRPCError(error)
      return data
    }),
  ),

  create: manageServices
    .input(
      z
        .object(fields)
        .refine(seasonIsPaired, seasonMessage)
        .refine(precipitationIsPaired, precipitationMessage),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'services.create' }, async () => {
        const { organizationId: _org, ...values } = input
        const { data, error } = await ctx.supabase
          .from('services')
          .insert({
            ...values,
            precipitation_type: values.precipitation_type ?? 'none',
            precipitation_action: values.precipitation_action ?? 'none',
            organization_id: ctx.organizationId,
          })
          .select(SERVICE_COLUMNS)
          .single()
        if (error) throw toTRPCError(error)
        return data
      }),
    ),

  update: manageServices
    .input(
      z
        .object({ id: z.uuid(), ...partial(fields) })
        .refine(seasonIsPaired, seasonMessage)
        .refine(precipitationIsPaired, precipitationMessage),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'services.update' }, async () => {
        const { id, organizationId: _org, ...patch } = input
        if (Object.keys(patch).length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nothing to update',
          })
        }
        const { data, error } = await ctx.supabase
          .from('services')
          .update(patch)
          .eq('organization_id', ctx.organizationId)
          .eq('id', id)
          .select(SERVICE_COLUMNS)
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Service not found',
          })
        }
        return data[0]
      }),
    ),

  setArchived: manageServices
    .input(z.object({ id: z.uuid(), archived: z.boolean() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'services.setArchived' }, async () => {
        const { data, error } = await ctx.supabase
          .from('services')
          .update({
            archived_at: input.archived ? new Date().toISOString() : null,
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.id)
          .select(SERVICE_COLUMNS)
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Service not found',
          })
        }
        return data[0]
      }),
    ),
} satisfies TRPCRouterRecord

function partial<T extends Record<string, z.ZodType>>(shape: T) {
  return Object.fromEntries(
    Object.entries(shape).map(([k, v]) => [k, v.optional()]),
  ) as { [K in keyof T]: z.ZodOptional<T[K]> }
}
