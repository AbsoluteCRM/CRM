import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { dbError } from './errors'
import { requireOrgPermission } from './init'
import {
  messagePage,
  quoteMessageBodySchema,
  quoteMessageCursorSchema,
  quoteMessageSchema,
} from '#/integrations/quotes/public.schemas'
import {
  generateQuoteToken,
  quoteEmailConfig,
  quoteRecipient,
  sendQuoteEmail,
} from '#/server/quote-email'
import { recordQuoteDelivery } from '#/server/trusted/quotes'

import type { TRPCRouterRecord } from '@trpc/server'

export const QUOTE_COLUMNS =
  'id, organization_id, number, client_id, property_id, request_id, revision, status, title, message, conditions, valid_until, subtotal_cents, tax_cents, total_cents, sent_at, approved_at, declined_reason, created_at, updated_at'

export const LINE_COLUMNS =
  'id, quote_id, service_id, position, description, quantity, unit_price_cents, amount_cents, is_optional, is_selected, frequency, season_start_month, season_end_month, quote_line_item_taxes(tax_rate_id, percentage, amount_cents)'

// token_hash is never selected: staff only see delivery state.
export const DELIVERY_COLUMNS =
  'id, delivery_status, delivery_attempts, last_delivery_error, expires_at, revoked_at, viewed_at, created_at'

// Quote and line writes are office-staff only, the same set that manages requests.
const manageQuotes = requireOrgPermission('manageRequests')

const date = z.iso.date()

type Ctx = Parameters<Parameters<typeof manageQuotes.query>[0]>[0]['ctx']

// A first revision starts with one line for the requested service at its
// default price. Best effort: the draft is already created, so a failure here
// leaves it empty for the user to fill in.
async function seedFromService(ctx: Ctx, requestId: string, quoteId: string) {
  const request = await ctx.supabase
    .from('requests')
    .select('service_id')
    .eq('organization_id', ctx.organizationId)
    .eq('id', requestId)
    .maybeSingle()
  if (!request.data) return
  const service = await ctx.supabase
    .from('services')
    .select(
      'id, name, default_price_cents, archived_at, frequencies, season_start_month, season_end_month',
    )
    .eq('organization_id', ctx.organizationId)
    .eq('id', request.data.service_id)
    .maybeSingle()
  if (!service.data || service.data.archived_at) return
  await ctx.supabase.from('quote_line_items').insert({
    organization_id: ctx.organizationId,
    quote_id: quoteId,
    service_id: service.data.id,
    position: 1,
    description: service.data.name,
    quantity: 1,
    unit_price_cents: service.data.default_price_cents,
    is_optional: false,
    frequency: service.data.frequencies[0] ?? 'one_time',
    season_start_month: service.data.season_start_month,
    season_end_month: service.data.season_end_month,
  })
}

async function scopedQuote(ctx: Ctx, quoteId: string) {
  const { data, error } = await ctx.supabase
    .from('quotes')
    .select(QUOTE_COLUMNS)
    .eq('organization_id', ctx.organizationId)
    .eq('id', quoteId)
    .maybeSingle()
  if (error) throw dbError(error)
  if (!data)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' })
  return data
}

async function deliver(ctx: Ctx, quoteId: string, retry: boolean) {
  const quote = await scopedQuote(ctx, quoteId)
  const config = quoteEmailConfig()
  const [client, organization] = await Promise.all([
    ctx.supabase
      .from('clients')
      .select('email, archived_at')
      .eq('organization_id', ctx.organizationId)
      .eq('id', quote.client_id)
      .maybeSingle(),
    ctx.supabase
      .from('organizations')
      .select('name, email')
      .eq('id', ctx.organizationId)
      .maybeSingle(),
  ])
  if (
    client.error ||
    organization.error ||
    !client.data ||
    client.data.archived_at ||
    !organization.data
  )
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Client or organization is unavailable.',
    })
  const email = quoteRecipient(client.data.email)
  const { token, tokenHash } = generateQuoteToken()
  const result = retry
    ? await ctx.supabase.rpc('rotate_quote_token', {
        p_quote_id: quoteId,
        p_new_token_hash: tokenHash,
      })
    : await ctx.supabase.rpc('send_quote', {
        p_quote_id: quoteId,
        p_token_hash: tokenHash,
      })
  if (result.error) throw dbError(result.error)
  const outcome = await sendQuoteEmail(config, {
    organization: organization.data.name,
    organizationEmail: organization.data.email,
    number: quote.number,
    title: quote.title,
    validUntil: quote.valid_until ?? '',
    email,
    token,
    tokenId: result.data,
  })
  try {
    await recordQuoteDelivery(result.data, outcome)
    return { id: quoteId, deliveryStatus: outcome.status }
  } catch {
    // Provider acceptance can precede a crash or recording failure. Pending is
    // deliberately recoverable by rotating the token, never automatic retry.
    return { id: quoteId, deliveryStatus: 'pending' as const }
  }
}

export const quotesRouter = {
  send: manageQuotes
    .input(z.object({ quoteId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.send' }, () =>
        deliver(ctx, input.quoteId, false),
      ),
    ),
  retryDelivery: manageQuotes
    .input(z.object({ quoteId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.retryDelivery' }, () =>
        deliver(ctx, input.quoteId, true),
      ),
    ),
  listMessages: manageQuotes
    .input(
      z.object({
        quoteId: z.uuid(),
        cursor: quoteMessageCursorSchema.optional(),
      }),
    )
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.listMessages' }, async () => {
        await scopedQuote(ctx, input.quoteId)
        let query = ctx.supabase
          .from('quote_messages')
          .select('id, body, sender_kind, created_at')
          .eq('organization_id', ctx.organizationId)
          .eq('quote_id', input.quoteId)
        if (input.cursor)
          query = query.or(
            `created_at.lt.${input.cursor.beforeCreatedAt},and(created_at.eq.${input.cursor.beforeCreatedAt},id.lt.${input.cursor.beforeId})`,
          )
        const { data, error } = await query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(50)
        if (error) throw dbError(error)
        return messagePage(data)
      }),
    ),
  postMessage: manageQuotes
    .input(
      z.object({
        quoteId: z.uuid(),
        body: quoteMessageBodySchema,
        clientMessageId: z.uuid(),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.postMessage' }, async () => {
        const { data, error } = await ctx.supabase.rpc('post_quote_message', {
          p_organization_id: ctx.organizationId,
          p_quote_id: input.quoteId,
          p_body: input.body,
          p_client_message_id: input.clientMessageId,
        })
        if (error) throw dbError(error)
        return quoteMessageSchema.parse(data[0])
      }),
    ),
  taxRates: manageQuotes.query(({ ctx }) =>
    Sentry.startSpan({ name: 'quotes.taxRates' }, async () => {
      const { data, error } = await ctx.supabase
        .from('tax_rates')
        .select('id, name, percentage')
        .eq('organization_id', ctx.organizationId)
        .is('archived_at', null)
        .order('name', { ascending: true })
      if (error) throw dbError(error)
      return data
    }),
  ),

  listForRequest: manageQuotes
    .input(z.object({ requestId: z.uuid() }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.listForRequest' }, async () => {
        const { data, error } = await ctx.supabase
          .from('quotes')
          .select(QUOTE_COLUMNS)
          .eq('organization_id', ctx.organizationId)
          .eq('request_id', input.requestId)
          .order('revision', { ascending: false })
        if (error) throw dbError(error)
        return data
      }),
    ),

  get: manageQuotes
    .input(z.object({ quoteId: z.uuid() }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.get' }, async () => {
        const [quote, lines, delivery] = await Promise.all([
          ctx.supabase
            .from('quotes')
            .select(QUOTE_COLUMNS)
            .eq('organization_id', ctx.organizationId)
            .eq('id', input.quoteId)
            .maybeSingle(),
          ctx.supabase
            .from('quote_line_items')
            .select(LINE_COLUMNS)
            .eq('organization_id', ctx.organizationId)
            .eq('quote_id', input.quoteId)
            .order('position', { ascending: true }),
          ctx.supabase
            .from('quote_share_tokens')
            .select(DELIVERY_COLUMNS)
            .eq('organization_id', ctx.organizationId)
            .eq('quote_id', input.quoteId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (quote.error) throw dbError(quote.error)
        if (lines.error) throw dbError(lines.error)
        if (delivery.error) throw dbError(delivery.error)
        if (!quote.data) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' })
        }
        return {
          quote: quote.data,
          lines: lines.data,
          delivery: delivery.data,
        }
      }),
    ),

  createDraft: manageQuotes
    .input(
      z.object({
        requestId: z.uuid(),
        copyFromQuoteId: z.uuid().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.createDraft' }, async () => {
        const { data, error } = await ctx.supabase.rpc('create_quote_draft', {
          p_request_id: input.requestId,
          p_copy_from_quote_id: input.copyFromQuoteId ?? undefined,
        })
        if (error) throw dbError(error)
        if (!input.copyFromQuoteId)
          await seedFromService(ctx, input.requestId, data)
        return { id: data }
      }),
    ),

  update: manageQuotes
    .input(
      z.object({
        quoteId: z.uuid(),
        title: z.string().trim().min(1).max(200),
        message: z.string().trim().max(4000).nullable(),
        conditions: z.string().trim().max(4000).nullable(),
        validUntil: date.nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.update' }, async () => {
        const { data, error } = await ctx.supabase
          .from('quotes')
          .update({
            title: input.title,
            message: input.message || null,
            conditions: input.conditions || null,
            valid_until: input.validUntil,
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.quoteId)
          .select(QUOTE_COLUMNS)
        if (error) throw dbError(error)
        if (data.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' })
        }
        return data[0]
      }),
    ),

  upsertLine: manageQuotes
    .input(
      z
        .object({
          quoteId: z.uuid(),
          lineId: z.uuid().nullable().optional(),
          serviceId: z.uuid().nullable(),
          description: z.string().trim().min(1).max(500),
          quantity: z.number().positive().max(99999999),
          unitPriceCents: z.number().int().min(0),
          isOptional: z.boolean(),
          frequency: z.enum(['one_time', 'weekly', 'biweekly', 'monthly']),
          seasonStartMonth: z.number().int().min(1).max(12).nullable(),
          seasonEndMonth: z.number().int().min(1).max(12).nullable(),
          taxRateIds: z.array(z.uuid()).max(10),
        })
        .refine(
          (v) => (v.seasonStartMonth === null) === (v.seasonEndMonth === null),
          {
            message: 'Set both active months or neither',
            path: ['seasonEndMonth'],
          },
        ),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.upsertLine' }, async () => {
        const fields = {
          service_id: input.serviceId,
          description: input.description,
          quantity: input.quantity,
          unit_price_cents: input.unitPriceCents,
          is_optional: input.isOptional,
          frequency: input.frequency,
          season_start_month: input.seasonStartMonth,
          season_end_month: input.seasonEndMonth,
        }

        let lineId = input.lineId ?? null
        if (lineId) {
          const { data, error } = await ctx.supabase
            .from('quote_line_items')
            .update(fields)
            .eq('organization_id', ctx.organizationId)
            .eq('quote_id', input.quoteId)
            .eq('id', lineId)
            .select('id')
          if (error) throw dbError(error)
          if (data.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Line not found',
            })
          }
        } else {
          const last = await ctx.supabase
            .from('quote_line_items')
            .select('position')
            .eq('organization_id', ctx.organizationId)
            .eq('quote_id', input.quoteId)
            .order('position', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (last.error) throw dbError(last.error)
          const { data, error } = await ctx.supabase
            .from('quote_line_items')
            .insert({
              ...fields,
              organization_id: ctx.organizationId,
              quote_id: input.quoteId,
              position: (last.data?.position ?? 0) + 1,
            })
            .select('id')
            .single()
          if (error) throw dbError(error)
          lineId = data.id
        }

        const removed = await ctx.supabase
          .from('quote_line_item_taxes')
          .delete()
          .eq('organization_id', ctx.organizationId)
          .eq('line_item_id', lineId)
        if (removed.error) throw dbError(removed.error)

        if (input.taxRateIds.length > 0) {
          const { error } = await ctx.supabase
            .from('quote_line_item_taxes')
            .insert(
              // The database fills percentage and amount_cents; only these three columns are granted.
              [...new Set(input.taxRateIds)].map(
                (taxRateId) =>
                  ({
                    organization_id: ctx.organizationId,
                    line_item_id: lineId,
                    tax_rate_id: taxRateId,
                  }) as never,
              ),
            )
          if (error) throw dbError(error)
        }

        const { data, error } = await ctx.supabase
          .from('quote_line_items')
          .select(LINE_COLUMNS)
          .eq('organization_id', ctx.organizationId)
          .eq('id', lineId)
          .single()
        if (error) throw dbError(error)
        return data
      }),
    ),

  deleteLine: manageQuotes
    .input(z.object({ quoteId: z.uuid(), lineId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.deleteLine' }, async () => {
        const { data, error } = await ctx.supabase
          .from('quote_line_items')
          .delete()
          .eq('organization_id', ctx.organizationId)
          .eq('quote_id', input.quoteId)
          .eq('id', input.lineId)
          .select('id')
        if (error) throw dbError(error)
        if (data.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Line not found' })
        }
        return { id: input.lineId }
      }),
    ),

  pullBack: manageQuotes
    .input(z.object({ quoteId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.pullBack' }, async () => {
        const { error } = await ctx.supabase.rpc('pull_back_quote', {
          p_quote_id: input.quoteId,
        })
        if (error) throw dbError(error)
        return { id: input.quoteId }
      }),
    ),
} satisfies TRPCRouterRecord
