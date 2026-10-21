import '@tanstack/react-start/server-only'
import { createHash, randomBytes } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function invitationConfig() {
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
        'Invitation email is not configured. Ask your administrator to check SERVER_URL, RESEND_FROM_EMAIL and RESEND_API_KEY.',
    })
  }
  if (!key || !sender.success) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Invitation email is not configured. Ask your administrator to check SERVER_URL, RESEND_FROM_EMAIL and RESEND_API_KEY.',
    })
  }
  return { key, sender: sender.data, origin: origin.origin }
}

export function generateInviteToken() {
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

export function invitationMessage(input: {
  organization: string
  role: string
  inviteLink: string
  expiresAt: string
}) {
  const text = `You have been invited to join ${input.organization} as ${input.role}.\n\nSign in or create an account with the invited email, then choose Accept invitation.\n${input.inviteLink}\n\nThis invitation expires ${input.expiresAt} (seven days). Only the latest invitation link works. If you were not expecting this invitation, ignore it.`
  return {
    subject: 'Your team invitation',
    text,
    html: `<p>You have been invited to join <strong>${escapeHtml(input.organization)}</strong> as ${escapeHtml(input.role)}.</p><p>Sign in or create an account with the invited email, then choose Accept invitation.</p><p><a href="${escapeHtml(input.inviteLink)}">Review invitation</a></p><p>This invitation expires ${escapeHtml(input.expiresAt)} (seven days). Only the latest invitation link works. If you were not expecting this invitation, ignore it.</p>`,
  }
}

export async function sendInvitation(
  config: ReturnType<typeof invitationConfig>,
  input: Parameters<typeof invitationMessage>[0] & {
    email: string
    tokenHash: string
  },
): Promise<'sent' | 'failed'> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `team-invite-${input.tokenHash}`,
      },
      body: JSON.stringify({
        from: config.sender,
        to: [input.email],
        ...invitationMessage(input),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return 'failed'
    const result: unknown = await response.json()
    return typeof result === 'object' &&
      result !== null &&
      'id' in result &&
      typeof result.id === 'string' &&
      result.id.length > 0
      ? 'sent'
      : 'failed'
  } catch {
    // A timeout may have occurred after acceptance by the provider. Never log its body or token.
    return 'failed'
  }
}
