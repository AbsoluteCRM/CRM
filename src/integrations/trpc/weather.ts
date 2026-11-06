import { TRPCError } from '@trpc/server'
import type { TRPCRouterRecord } from '@trpc/server'
import { organizationProcedure } from './init'
import { getWeatherForecast } from '#/server/weather'

export const weatherRouter = {
  forecast: organizationProcedure.query(async () => {
    try {
      return await getWeatherForecast()
    } catch {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Weather unavailable',
      })
    }
  }),
} satisfies TRPCRouterRecord
