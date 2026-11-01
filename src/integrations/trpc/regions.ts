
import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { organizationProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

const manageRegions = requireOrgPermission('manageSettings')

const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(
    z.array(z.tuple([z.number(), z.number()])).min(4),
  ).min(1),
})

export const regionsRouter = {
  // Retrieve regions belonging to the selected organization.
  list: organizationProcedure
    .query(({ ctx }) =>
      Sentry.startSpan({ name: 'regions.list' }, async () => {
        const { data, error } = await ctx.supabase
          .from('service_regions')
          .select(
            'id, organization_id, name, crew_id, boundary, created_at, updated_at',
          )
          .eq('organization_id', ctx.organizationId)
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

  // Create a region using its GeoJSON polygon.
  create: manageRegions
    .input(
      z.object({
        organizationId: z.uuid(),
        name: z.string().trim().min(1),
        crewId: z.uuid().nullable(),
        boundary: polygonSchema,
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'regions.create' }, async () => {
        const { data, error } = await ctx.supabase.rpc(
          'create_service_region',
          {
            p_organization_id: ctx.organizationId,
            p_name: input.name,
            p_crew_id: input.crewId,
            p_boundary: input.boundary,
          },
        )

        if (error) {
          throw new TRPCError({
            code: error.code === '42501' ? 'FORBIDDEN' : 'BAD_REQUEST',
            message: error.message,
            cause: error,
          })
        }

        return { id: data }
      }),
    ),
} satisfies TRPCRouterRecord
