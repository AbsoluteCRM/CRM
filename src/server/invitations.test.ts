import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateInviteToken,
  invitationConfig,
  invitationMessage,
  sendInvitation,
} from './invitations'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('invitation email', () => {
  const message = {
    organization: '<script>"&\'Team',
    role: 'worker',
    inviteLink:
      'https://terraformaflow.com/accept-invite?token=' + 'a'.repeat(64),
    expiresAt: '2026-10-28T00:00:00Z',
  }
  const config = {
    key: 'secret',
    sender: 'requests@terraformaflow.com',
    origin: 'https://terraformaflow.com',
  }
  it('uses independent 32-byte random tokens', () => {
    const first = generateInviteToken()
    const second = generateInviteToken()
    expect(first.token).toMatch(/^[a-f0-9]{64}$/)
    expect(first.tokenHash).not.toBe(first.token)
    expect(first.token).not.toBe(second.token)
  })
  it('escapes HTML while retaining readable plain text and expiry', () => {
    const result = invitationMessage(message)
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;&quot;&amp;&#39;Team')
    expect(result.text).toContain(message.organization)
    expect(result.text).toContain(message.expiresAt)
  })
  it('sends with fixed provider URL and sender, timeout and hash idempotency key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"email-id"}'))
    vi.stubGlobal('fetch', fetch)
    expect(
      await sendInvitation(config, {
        ...message,
        email: 'recipient@example.com',
        tokenHash: 'hash',
      }),
    ).toBe('sent')
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.headers['Idempotency-Key']).toBe('team-invite-hash')
    expect(JSON.parse(options.body)).toMatchObject({
      from: config.sender,
      to: ['recipient@example.com'],
    })
  })
  it.each([
    new Response('{}'),
    new Response('{"error":"private"}', { status: 429 }),
    new Response('not json'),
  ])('requires an acknowledged email ID', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    expect(
      await sendInvitation(config, {
        ...message,
        email: 'recipient@example.com',
        tokenHash: 'hash',
      }),
    ).toBe('failed')
  })
  it('handles timeout and network failures without throwing provider payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
    )
    expect(
      await sendInvitation(config, {
        ...message,
        email: 'recipient@example.com',
        tokenHash: 'hash',
      }),
    ).toBe('failed')
  })
  it('accepts localhost only outside production', () => {
    vi.stubEnv('SERVER_URL', 'http://localhost:3000')
    vi.stubEnv('RESEND_API_KEY', 'secret')
    vi.stubEnv('RESEND_FROM_EMAIL', config.sender)
    vi.stubEnv('NODE_ENV', 'development')
    expect(invitationConfig().origin).toBe('http://localhost:3000')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => invitationConfig()).toThrow(
      'Invitation email is not configured',
    )
  })
})
