import '@tanstack/react-start/server-only'
import { createHash, randomBytes } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export function quoteEmailConfig() {
  const key = process.env.RESEND_API_KEY?.trim()
  const sender = z.email().safeParse(process.env.RESEND_FROM_EMAIL?.trim())
  let origin: URL
  try {
    origin = new URL(process.env.SERVER_URL ?? '')
    if (
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/' ||
      !(
        origin.protocol === 'https:' ||
        (process.env.NODE_ENV !== 'production' &&
          origin.protocol === 'http:' &&
          origin.hostname === 'localhost')
      )
    )
      throw new Error('Invalid origin')
  } catch {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Quote email is not configured. Ask your administrator to check SERVER_URL, RESEND_FROM_EMAIL and RESEND_API_KEY.',
    })
  }
  if (!key || !sender.success) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Quote email is not configured. Ask your administrator to check SERVER_URL, RESEND_FROM_EMAIL and RESEND_API_KEY.',
    })
  }
  return { key, sender: sender.data, origin: origin.origin }
}

export function generateQuoteToken() {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  )
}

export function quoteEmailMessage(input: {
  organization: string
  number: string
  title: string
  quoteLink: string
  validUntil: string
}) {
  return {
    subject: 'Your quote is ready to review',
    text: `${input.organization} has sent quote ${input.number}: ${input.title}.\n\nReview quote: ${input.quoteLink}\n\nValid until ${input.validUntil}. Only the latest quote link works.`,
    html: `<p>${escapeHtml(input.organization)} has sent quote ${escapeHtml(input.number)}: ${escapeHtml(input.title)}.</p><p><a href="${escapeHtml(input.quoteLink)}">Review quote</a></p><p>Valid until ${escapeHtml(input.validUntil)}. Only the latest quote link works.</p>`,
  }
}

export function quoteRecipient(email: string | null | undefined) {
  const result = z.email().safeParse(email?.trim())
  if (!result.success)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Add a valid email address to this client before sending the quote.',
    })
  return result.data
}

export async function sendQuoteEmail(
  config: ReturnType<typeof quoteEmailConfig>,
  input: Omit<Parameters<typeof quoteEmailMessage>[0], 'quoteLink'> & {
    email: string
    organizationEmail: string | null
    token: string
    tokenId: string
  },
): Promise<
  { status: 'sent'; messageId: string } | { status: 'failed'; messageId: null }
> {
  try {
    const email = quoteRecipient(input.email)
    if (
      !/^[a-f0-9]{64}$/.test(input.token) ||
      !z.uuid().safeParse(input.tokenId).success
    )
      return { status: 'failed', messageId: null }
    const replyTo = z.email().safeParse(input.organizationEmail?.trim())
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `quote-delivery-${input.tokenId}`,
      },
      body: JSON.stringify({
        from: config.sender,
        to: [email],
        ...(replyTo.success ? { reply_to: replyTo.data } : {}),
        ...quoteEmailMessage({
          ...input,
          quoteLink: new URL(`/q/${input.token}`, config.origin).href,
        }),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return { status: 'failed', messageId: null }
    const result: unknown = await response.json()
    return typeof result === 'object' &&
      result !== null &&
      'id' in result &&
      typeof result.id === 'string' &&
      result.id.length > 0
      ? { status: 'sent', messageId: result.id }
      : { status: 'failed', messageId: null }
  } catch {
    // Acceptance may precede a timeout; never expose provider payloads or tokens.
    return { status: 'failed', messageId: null }
  }
}
