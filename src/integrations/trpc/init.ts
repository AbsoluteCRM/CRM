
import { TRPCError, initTRPC } from '@trpc/server'
import superjson from 'superjson'
import { z } from 'zod'

import { can, isOrgRole } from '#/integrations/organization/permissions'

import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '#/types/database'

export interface TRPCContext {
  user: User | null
  supabase: SupabaseClient<Database>
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

// Require a signed-in Supabase user
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
    })
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})

// Require active membership in the requested organization
export const organizationProcedure = protectedProcedure
  .input(
    z.object({
      organizationId: z.string().uuid(),
    }),
  )
  .use(async ({ ctx, input, next }) => {
    const { data, error } = await ctx.supabase
      .from('organization_members')
      .select('id, organization_id, role, status')
      .eq('organization_id', input.organizationId)
      .eq('user_id', ctx.user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to verify organization membership',
        cause: error,
      })
    }

    if (!data || !isOrgRole(data.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have access to this organization',
      })
    }

    return next({
      ctx: {
        ...ctx,
        organizationId: data.organization_id,
        memberId: data.id,
        role: data.role,
      },
    })
  })

// Require a specific permission within the verified organization
export function requireOrgPermission(permission: keyof typeof can) {
  return organizationProcedure.use(({ ctx, next }) => {
    if (!can[permission](ctx.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You do not have permission to ${permission}`,
      })
    }

    return next({ ctx })
  })
}
