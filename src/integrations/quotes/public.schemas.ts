import { z } from 'zod'

const cents = z.number().int().nonnegative()
const month = z.number().int().min(1).max(12).nullable()
export const quoteTokenSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const quoteMessageBodySchema = z.string().trim().min(1).max(4000)
export const quoteMessageSchema = z.object({
  id: z.uuid(),
  sender_kind: z.enum(['staff', 'customer']),
  body: quoteMessageBodySchema,
  created_at: z.iso.datetime({ offset: true }),
})
export const quoteMessageCursorSchema = z.object({
  beforeCreatedAt: z.iso.datetime({ offset: true }),
  beforeId: z.uuid(),
})
export const quoteMessagePageSchema = z.object({
  messages: z.array(quoteMessageSchema),
  olderCursor: quoteMessageCursorSchema.nullable(),
})
export const publicQuoteSchema = z.object({
  number: z.string(),
  status: z.enum(['sent', 'approved', 'declined']),
  title: z.string().nullable(),
  message: z.string().nullable(),
  conditions: z.string().nullable(),
  valid_until: z.string().nullable(),
  subtotal_cents: cents,
  tax_cents: cents,
  total_cents: cents,
  currency: z.string().length(3),
  organization_name: z.string(),
  client_name: z.string(),
  lines: z.array(
    z.object({
      id: z.uuid(),
      position: z.number().int(),
      description: z.string(),
      quantity: z.number().positive(),
      unit_price_cents: cents,
      amount_cents: cents,
      tax_cents: cents,
      is_optional: z.boolean(),
      is_selected: z.boolean(),
      frequency: z.enum(['one_time', 'weekly', 'biweekly', 'monthly']),
      season_start_month: month,
      season_end_month: month,
    }),
  ),
})
export type PublicQuoteData = z.infer<typeof publicQuoteSchema>
export type QuoteMessage = z.infer<typeof quoteMessageSchema>
export type QuoteMessageCursor = z.infer<typeof quoteMessageCursorSchema>
export type QuoteMessagePage = z.infer<typeof quoteMessagePageSchema>
