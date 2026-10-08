import { TRPCError, initTRPC } from '@trpc/server'
import superjson from 'superjson'

import { createSupabaseServerClient } from '#/lib/supabase/server'

// Per request, so cookie writes from token refreshes reach the right response.
export function createTRPCContext() {
  return { supabase: createSupabaseServerClient() }
}

const t = initTRPC.context<ReturnType<typeof createTRPCContext>>().create({
  transformer: superjson,
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { data, error } = await ctx.supabase.auth.getUser()
  if (error) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, user: data.user } })
})
