import '@tanstack/react-start/server-only'
import * as Sentry from '@sentry/tanstackstart-react'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { quoteTokenSchema } from '#/integrations/quotes/public.schemas'

export const bearer = z.object({ token: quoteTokenSchema })

export async function publicQuoteRequest<T, TResult>(
  name: string,
  input: unknown,
  schema: z.ZodType<T>,
  run: (data: T) => Promise<TResult>,
) {
  setResponseHeader('cache-control', 'no-store')
  setResponseHeader('referrer-policy', 'no-referrer')
  setResponseHeader('x-robots-tag', 'noindex, nofollow')
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false as const,
      unavailable: !bearer.safeParse(input).success,
      message: 'Check the link and request, then try again.',
    }
  return Sentry.startSpan({ name }, async () => {
    try {
      return { ok: true as const, data: await run(parsed.data) }
    } catch (error) {
      const unavailable =
        error instanceof Error && error.message === 'Quote unavailable'
      const rateLimited =
        error instanceof Error &&
        error.message === 'Too many messages. Try again later.'
      return {
        ok: false as const,
        unavailable,
        message: unavailable
          ? 'Quote unavailable'
          : rateLimited
            ? 'Too many messages. Try again later.'
            : 'Could not complete this request. Please try again.',
      }
    }
  })
}
