import '@tanstack/react-start/server-only'
import { TRPCError } from '@trpc/server'

import { generateInviteToken, invitationConfig } from './invitations'

export type EmailConfig = ReturnType<typeof invitationConfig>

/** Same Resend settings as team invitations, with a quote-specific error. */
export function quoteEmailConfig(): EmailConfig {
  try {
    return invitationConfig()
  } catch (error) {
    if (error instanceof TRPCError) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message:
          'Quote email is not configured. Ask your administrator to check SERVER_URL, RESEND_FROM_EMAIL and RESEND_API_KEY.',
      })
    }
    throw error
  }
}

/** A 256-bit link token and its SHA-256 hash. Only the hash is stored. */
export const generateQuoteToken = generateInviteToken

export const quoteLink = (origin: string, token: string) =>
  `${origin}/q/${token}`

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  )
}

export type QuoteEmailInput = {
  organization: string
  recipientName: string
  title: string
  number: string
  totalCents: number
  currency: string
  validUntil: string
  message: string | null
  link: string
}

export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(
    cents / 100,
  )
}

function formatDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function quoteMessage(input: QuoteEmailInput) {
  const total = formatMoney(input.totalCents, input.currency)
  const until = formatDate(input.validUntil)
  const greeting = `Hi ${input.recipientName},`
  const intro = `${input.organization} sent you an estimate for ${input.title} (${input.number}): ${total}.`
  const action = `Review it and approve or decline online. No account needed. This estimate is valid until ${until}.`
  const text = [
    greeting,
    '',
    intro,
    ...(input.message ? ['', input.message] : []),
    '',
    action,
    input.link,
    '',
    `If you weren't expecting this, you can ignore this email.`,
  ].join('\n')
  const html = `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p>${
    input.message
      ? `<p style="white-space:pre-line">${escapeHtml(input.message)}</p>`
      : ''
  }<p>${escapeHtml(action)}</p><p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#11301f;color:#ffffff;font-weight:600;text-decoration:none">Review your estimate</a></p><p style="color:#6b7280;font-size:13px">If you weren't expecting this, you can ignore this email.</p>`
  return {
    subject: `Your estimate from ${input.organization}`,
    text,
    html,
  }
}

export type DeliveryResult =
  | { status: 'sent'; messageId: string; error: null }
  | { status: 'failed'; messageId: null; error: string }

export async function sendQuoteEmail(
  config: EmailConfig,
  input: QuoteEmailInput & { email: string; idempotencyKey: string },
): Promise<DeliveryResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `quote-${input.idempotencyKey}`,
      },
      body: JSON.stringify({
        from: config.sender,
        to: [input.email],
        ...quoteMessage(input),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      return {
        status: 'failed',
        messageId: null,
        error: `The email provider rejected the message (HTTP ${response.status}).`,
      }
    }
    const result: unknown = await response.json()
    if (
      typeof result === 'object' &&
      result !== null &&
      'id' in result &&
      typeof result.id === 'string' &&
      result.id.length > 0
    ) {
      return { status: 'sent', messageId: result.id, error: null }
    }
    return {
      status: 'failed',
      messageId: null,
      error: 'The email provider gave no message id.',
    }
  } catch {
    // Never log the body: it holds the link token.
    return {
      status: 'failed',
      messageId: null,
      error: 'Couldn’t reach the email provider.',
    }
  }
}
