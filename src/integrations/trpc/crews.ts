import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

export const CREW_COLUMNS =
  'id, organization_id, name, color, vehicle, default_start_time, max_work_minutes, archived_at, created_at, updated_at'

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
} satisfies TRPCRouterRecord
