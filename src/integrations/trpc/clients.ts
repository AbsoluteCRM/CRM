import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

export const CLIENT_COLUMNS =
  'id, organization_id, kind, status, display_name, first_name, last_name, company_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_region, billing_postal_code, billing_country, lead_source, tags, notes, tax_exempt, created_at, updated_at'

export const clientsRouter = {
  // RLS limits rows to orgs the caller is office staff in; the org filter picks the active one.
  list: protectedProcedure
    .input(z.object({ organizationId: z.uuid() }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'clients.list' }, async () => {
        const { data, error } = await ctx.supabase
          .from('clients')
          .select(CLIENT_COLUMNS)
          .eq('organization_id', input.organizationId)
          .is('archived_at', null)
          .order('display_name', { ascending: true })
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
} satisfies TRPCRouterRecord
