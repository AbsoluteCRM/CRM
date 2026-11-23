import { publicQuoteSchema, quoteMessagePageSchema } from './public.schemas'
import type {
  PublicQuoteData,
  QuoteMessageCursor,
  QuoteMessagePage,
} from './public.schemas'

type Result<T> =
  { ok: true; data: T } | { ok: false; unavailable: boolean; message: string }

// Validate again at the browser boundary before a response reaches the cache.
export async function readPublicQuote(
  read: () => Promise<Result<unknown>>,
): Promise<Result<PublicQuoteData>> {
  const result = await read()
  return result.ok
    ? { ...result, data: publicQuoteSchema.parse(result.data) }
    : result
}
export async function readPublicMessages(
  read: (cursor?: QuoteMessageCursor) => Promise<Result<unknown>>,
  cursor?: QuoteMessageCursor,
): Promise<Result<QuoteMessagePage>> {
  const result = await read(cursor)
  return result.ok
    ? { ...result, data: quoteMessagePageSchema.parse(result.data) }
    : result
}
