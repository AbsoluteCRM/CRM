import * as Sentry from '@sentry/tanstackstart-react'
import { z } from 'zod'

import {
  approveByToken,
  declineByToken,
  getQuoteByToken,
} from '#/server/trusted/quote-links'
import { publicProcedure } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

// The emailed link is the credential: 32 random bytes as hex. The token, not a
// session, authorizes these calls (same exception as the public portal).
const token = z.string().regex(/^[0-9a-f]{64}$/)

export const quoteLinkRouter = {
  get: publicProcedure
    .input(z.object({ token }))
    .query(({ input }) =>
      Sentry.startSpan({ name: 'quoteLink.get' }, () =>
        getQuoteByToken(input.token),
      ),
    ),

  approve: publicProcedure
    .input(
      z.object({
        token,
        selectedOptionalLineIds: z.array(z.uuid()).max(100),
      }),
    )
    .mutation(({ input }) =>
      Sentry.startSpan({ name: 'quoteLink.approve' }, () =>
        approveByToken(input.token, input.selectedOptionalLineIds),
      ),
    ),

  decline: publicProcedure
    .input(
      z.object({
        token,
        reason: z.string().trim().max(1000).nullable(),
      }),
    )
    .mutation(({ input }) =>
      Sentry.startSpan({ name: 'quoteLink.decline' }, () =>
        declineByToken(input.token, input.reason || null),
      ),
    ),
} satisfies TRPCRouterRecord
