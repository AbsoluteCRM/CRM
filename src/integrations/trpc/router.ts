import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { clientsRouter } from './clients'
import { crewsRouter } from './crews'
import {
  createTRPCRouter,
  organizationProcedure,
  protectedProcedure,
  publicProcedure,
  requireOrgPermission,
} from './init'
import { portalRouter, requestsRouter } from './requests'
import { quotesRouter } from './quotes'
import { servicesRouter } from './services'
import { teamsRouter } from './teams'

import type { TRPCRouterRecord } from '@trpc/server'

const todos = [
  { id: 1, name: 'Get groceries' },
  { id: 2, name: 'Buy a new phone' },
  { id: 3, name: 'Finish the project' },
]

const todosRouter = {
  list: publicProcedure.query(() => todos),

  add: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => {
      const newTodo = { id: todos.length + 1, name: input.name }
      todos.push(newTodo)
      return newTodo
    }),
} satisfies TRPCRouterRecord

const authRouter = {
  me: protectedProcedure.query(({ ctx }) => ({
    id: ctx.user.id,
    email: ctx.user.email,
  })),

  memberships: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase.rpc('my_memberships')

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve organization memberships',
        cause: error,
      })
    }

    return data
  }),
} satisfies TRPCRouterRecord

const organizationRouter = {
  checkAccess: organizationProcedure.query(({ ctx }) => ({
    organizationId: ctx.organizationId,
    memberId: ctx.memberId,
    role: ctx.role,
    authorized: true,
  })),

  testManageJobs: requireOrgPermission('manageJobs').query(({ ctx }) => ({
    authorized: true,
    role: ctx.role,
    permission: 'manageJobs',
  })),

  testManageBilling: requireOrgPermission('manageBilling').query(({ ctx }) => ({
    authorized: true,
    role: ctx.role,
    permission: 'manageBilling',
  })),
} satisfies TRPCRouterRecord

export const trpcRouter = createTRPCRouter({
  todos: todosRouter,
  teams: teamsRouter,
  auth: authRouter,
  organization: organizationRouter,
  clients: clientsRouter,
  crews: crewsRouter,
  services: servicesRouter,
  portal: portalRouter,
  requests: requestsRouter,
  quotes: quotesRouter,
})

export type TRPCRouter = typeof trpcRouter
