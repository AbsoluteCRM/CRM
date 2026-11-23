import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  quoteMessageBodySchema,
  quoteMessageCursorSchema,
} from './public.schemas'
import { bearer, publicQuoteRequest } from '#/server/quote-public'
import {
  decidePublicQuote,
  getPublicQuote,
  listPublicMessages,
  postPublicMessage,
} from '#/server/trusted/quotes'

const identity = (data: unknown) => data

export const getQuote = createServerFn({ method: 'POST' })
  .validator(identity)
  .handler(({ data }) =>
    publicQuoteRequest('quote.public.get', data, bearer, (input) =>
      getPublicQuote(input.token),
    ),
  )
export const listMessages = createServerFn({ method: 'POST' })
  .validator(identity)
  .handler(({ data }) =>
    publicQuoteRequest(
      'quote.public.messages',
      data,
      bearer.extend({ cursor: quoteMessageCursorSchema.optional() }),
      (input) => listPublicMessages(input.token, input.cursor),
    ),
  )
export const postMessage = createServerFn({ method: 'POST' })
  .validator(identity)
  .handler(({ data }) =>
    publicQuoteRequest(
      'quote.public.post',
      data,
      bearer.extend({
        body: quoteMessageBodySchema,
        clientMessageId: z.uuid(),
      }),
      (input) =>
        postPublicMessage(input.token, input.body, input.clientMessageId),
    ),
  )
export const approve = createServerFn({ method: 'POST' })
  .validator(identity)
  .handler(({ data }) =>
    publicQuoteRequest('quote.public.approve', data, bearer, (input) =>
      decidePublicQuote(input.token, 'approve'),
    ),
  )
export const decline = createServerFn({ method: 'POST' })
  .validator(identity)
  .handler(({ data }) =>
    publicQuoteRequest(
      'quote.public.decline',
      data,
      bearer.extend({ reason: z.string().trim().max(1000).nullish() }),
      (input) => decidePublicQuote(input.token, 'decline', input.reason),
    ),
  )
