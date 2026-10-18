import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { dbError } from './errors'
import { requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

export const QUOTE_COLUMNS =
  'id, organization_id, number, client_id, property_id, request_id, revision, status, title, message, conditions, valid_until, subtotal_cents, tax_cents, total_cents, sent_at, approved_at, declined_reason, created_at, updated_at'

export const LINE_COLUMNS =
  'id, quote_id, service_id, position, description, quantity, unit_price_cents, amount_cents, is_optional, is_selected, quote_line_item_taxes(tax_rate_id, percentage, amount_cents)'

// token_hash is never selected: staff only see delivery state.
export const DELIVERY_COLUMNS =
  'id, delivery_status, delivery_attempts, last_delivery_error, expires_at, revoked_at, viewed_at, created_at'

// Quote and line writes are office-staff only, the same set that manages requests.
const manageQuotes = requireOrgPermission('manageRequests')

const date = z.iso.date()

export const quotesRouter = {
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
      z.object({
        quoteId: z.uuid(),
        lineId: z.uuid().nullable().optional(),
        serviceId: z.uuid().nullable(),
        description: z.string().trim().min(1).max(500),
        quantity: z.number().positive().max(99999999),
        unitPriceCents: z.number().int().min(0),
        isOptional: z.boolean(),
        taxRateIds: z.array(z.uuid()).max(10),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'quotes.upsertLine' }, async () => {
        const fields = {
          service_id: input.serviceId,
          description: input.description,
          quantity: input.quantity,
          unit_price_cents: input.unitPriceCents,
          is_optional: input.isOptional,
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
