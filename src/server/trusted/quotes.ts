import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  messagePage,
  publicQuoteSchema,
  quoteMessageBodySchema,
  quoteMessageCursorSchema,
  quoteMessageSchema,
  quoteTokenSchema,
} from '#/integrations/quotes/public.schemas'
import { createSupabaseAdminClient } from './supabase-admin'

// These privileged calls accept only an independently validated bearer token.
function tokenHash(token: string) {
  return createHash('sha256')
    .update(quoteTokenSchema.parse(token))
    .digest('hex')
}

function check(error: { code?: string } | null) {
  if (!error) return
  if (error.code === 'P0002') throw new Error('Quote unavailable')
  if (error.code === 'P0001')
    throw new Error('Too many messages. Try again later.')
  throw new Error('Could not complete this request. Please try again.')
}

export async function getPublicQuote(token: string) {
  const { data, error } = await createSupabaseAdminClient().rpc(
    'portal_token_get_quote',
    {
      p_token_hash: tokenHash(token),
    },
  )
  check(error)
  return publicQuoteSchema.parse(data)
}

export async function listPublicMessages(
  token: string,
  cursor?: z.infer<typeof quoteMessageCursorSchema>,
) {
  const parsed = cursor && quoteMessageCursorSchema.parse(cursor)
  const { data, error } = await createSupabaseAdminClient().rpc(
    'portal_token_list_messages',
    {
      p_token_hash: tokenHash(token),
      ...(parsed && {
        p_before_created_at: parsed.beforeCreatedAt,
        p_before_id: parsed.beforeId,
      }),
    },
  )
  check(error)
  return messagePage(data)
}

export async function postPublicMessage(
  token: string,
  body: string,
  clientMessageId: string,
) {
  const { data, error } = await createSupabaseAdminClient().rpc(
    'portal_token_post_message',
    {
      p_token_hash: tokenHash(token),
      p_body: quoteMessageBodySchema.parse(body),
      p_client_message_id: z.uuid().parse(clientMessageId),
    },
  )
  check(error)
  return quoteMessageSchema.parse(data?.[0])
}

export async function decidePublicQuote(
  token: string,
  decision: 'approve' | 'decline',
  reason?: string | null,
) {
  const hash = tokenHash(token)
  const client = createSupabaseAdminClient()
  const result =
    decision === 'approve'
      ? await client.rpc('portal_token_approve', {
          p_token_hash: hash,
          p_selected_optional_line_ids: [],
        })
      : await client.rpc('portal_token_decline', {
          p_token_hash: hash,
          p_reason:
            z.string().trim().max(1000).nullish().parse(reason) ?? undefined,
        })
  check(result.error)
  return getPublicQuote(token)
}

export async function recordQuoteDelivery(
  tokenId: string,
  outcome: { status: 'sent' | 'failed'; messageId: string | null },
) {
  const { error } = await createSupabaseAdminClient().rpc(
    'record_quote_delivery',
    {
      p_token_id: z.uuid().parse(tokenId),
      p_status: outcome.status,
      // SQL accepts null for these optional result fields; generated args omit it.
      p_message_id: outcome.messageId as string,
      p_error: (outcome.status === 'failed'
        ? 'Delivery was not confirmed. Retry with a new link.'
        : null) as string,
    },
  )
  if (error) throw new Error('Delivery recording failed')
}
