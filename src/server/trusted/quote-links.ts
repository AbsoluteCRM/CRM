import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'

import { TRPCError } from '@trpc/server'

import { createSupabaseAdminClient } from './supabase-admin'
import type { Database } from '#/types/database'

type Frequency = Database['public']['Enums']['service_frequency']

/** What a customer sees on /q/$token. Never includes internal notes. */
export type LinkedQuote = {
  number: string
  status: 'sent' | 'approved' | 'declined'
  title: string
  message: string | null
  conditions: string | null
  valid_until: string | null
  subtotal_cents: number
  tax_cents: number
  total_cents: number
  currency: string
  organization_name: string
  client_name: string | null
  lines: Array<{
    id: string
    position: number
    description: string
    quantity: number
    unit_price_cents: number
    amount_cents: number
    tax_cents: number
    is_optional: boolean
    is_selected: boolean
    frequency: Frequency
    season_start_month: number | null
    season_end_month: number | null
  }>
}

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

// Every token failure (unknown, revoked, superseded, expired) looks the same.
const LINK_GONE = {
  code: 'NOT_FOUND' as const,
  message:
    'This link is no longer valid. It may have expired or been replaced by a newer estimate.',
}

function rpcError(error: { message: string; code?: string }): TRPCError {
  if (error.code === 'P0002') return new TRPCError({ ...LINK_GONE })
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong. Please try again.',
    cause: error,
  })
}

export async function getQuoteByToken(token: string): Promise<LinkedQuote> {
  const { data, error } = await createSupabaseAdminClient().rpc(
    'portal_token_get_quote',
    { p_token_hash: hashToken(token) },
  )
  if (error) throw rpcError(error)
  if (!data) throw new TRPCError({ ...LINK_GONE })
  return data as unknown as LinkedQuote
}

/** Approves the quote. The database links or creates the client (see 20261029170000). */
export async function approveByToken(
  token: string,
  selectedOptionalLineIds: Array<string>,
) {
  const { error } = await createSupabaseAdminClient().rpc(
    'portal_token_approve',
    {
      p_token_hash: hashToken(token),
      p_selected_optional_line_ids: selectedOptionalLineIds,
    },
  )
  if (error) throw rpcError(error)
  return { ok: true as const }
}

export async function declineByToken(token: string, reason: string | null) {
  const { error } = await createSupabaseAdminClient().rpc(
    'portal_token_decline',
    { p_token_hash: hashToken(token), p_reason: reason as string },
  )
  if (error) throw rpcError(error)
  return { ok: true as const }
}

/** Records an email attempt for a live token. Service role only. */
export async function recordQuoteDelivery(
  tokenId: string,
  result: {
    status: 'sent' | 'failed'
    messageId: string | null
    error: string | null
  },
) {
  const { error } = await createSupabaseAdminClient().rpc(
    'record_quote_delivery',
    {
      p_token_id: tokenId,
      p_status: result.status,
      p_message_id: result.messageId as string,
      p_error: result.error as string,
    },
  )
  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to record the email delivery',
      cause: error,
    })
  }
}
