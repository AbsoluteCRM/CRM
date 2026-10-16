import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { getPortal, hashClientIp, submitRequest } from '#/server/trusted/portal'
import { publicProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

export const portalRouter = {
  get: publicProcedure
    .input(z.object({ orgSlug: slug }))
    .query(({ input }) =>
      Sentry.startSpan({ name: 'portal.get' }, () => getPortal(input.orgSlug)),
    ),

  submit: publicProcedure
    .input(
      z.object({
        orgSlug: slug,
        serviceId: z.uuid(),
        name: z.string().trim().min(1).max(200),
        email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
        phone: z.string().trim().max(40).nullable(),
        address: z.string().trim().min(1).max(500),
        notes: z.string().trim().max(4000).nullable(),
        // Honeypot: real visitors never see or fill this field.
        website: z.string().max(200),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'portal.submit' }, async () => {
        if (input.website !== '') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid submission',
          })
        }
        return submitRequest({
          slug: input.orgSlug,
          serviceId: input.serviceId,
          name: input.name,
          email: input.email,
          phone: input.phone || null,
          address: input.address,
          notes: input.notes || null,
          ipHash: hashClientIp(ctx.headers),
        })
      }),
    ),
} satisfies TRPCRouterRecord

const manageRequests = requireOrgPermission('manageRequests')

export const REQUEST_COLUMNS =
  'id, organization_id, client_id, service_id, contact_name, contact_email, contact_phone, address, notes, status, source, submitted_at, created_at, updated_at'

export const requestsRouter = {
  list: manageRequests.query(({ ctx }) =>
    Sentry.startSpan({ name: 'requests.list' }, async () => {
      const { data, error } = await ctx.supabase
        .from('requests')
        .select(REQUEST_COLUMNS)
        .eq('organization_id', ctx.organizationId)
        .order('submitted_at', { ascending: false })
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to load requests',
          cause: error,
        })
      }
      return data
    }),
  ),

  setStatus: manageRequests
    .input(
      z.object({
        id: z.uuid(),
        status: z.enum([
          'submitted',
          'reviewing',
          'estimated',
          'approved',
          'rejected',
          'scheduled',
          'converted',
        ]),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'requests.setStatus' }, async () => {
        const { data, error } = await ctx.supabase
          .from('requests')
          .update({ status: input.status })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.id)
          .select(REQUEST_COLUMNS)
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update the request',
            cause: error,
          })
        }
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Request not found',
          })
        }
        return data[0]
      }),
    ),
} satisfies TRPCRouterRecord
