import { TRPCError } from '@trpc/server'

import { clientsRouter } from './clients'
import { crewsRouter } from './crews'
import {
  createTRPCRouter,
  organizationProcedure,
  protectedProcedure,
} from './init'
import { portalRouter, requestsRouter } from './requests'
import { quotesRouter } from './quotes'
import { serviceAreasRouter } from './serviceAreas'
import { servicesRouter } from './services'
import { settingsRouter } from './settings'
import { teamsRouter } from './teams'
import { weatherRouter } from './weather'

import type { TRPCRouterRecord } from '@trpc/server'

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
} satisfies TRPCRouterRecord

export const trpcRouter = createTRPCRouter({
  weather: weatherRouter,
  teams: teamsRouter,
  auth: authRouter,
  organization: organizationRouter,
  clients: clientsRouter,
  crews: crewsRouter,
  services: servicesRouter,
  serviceAreas: serviceAreasRouter,
  settings: settingsRouter,
  portal: portalRouter,
  requests: requestsRouter,
  quotes: quotesRouter,
})

export type TRPCRouter = typeof trpcRouter
