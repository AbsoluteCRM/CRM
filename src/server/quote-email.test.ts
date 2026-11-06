import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  generateQuoteToken,
  quoteEmailConfig,
  quoteEmailMessage,
  quoteRecipient,
  sendQuoteEmail,
} from './quote-email'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('quote email', () => {
  const message = {
    organization: '<script>"&\'Team',
    number: 'Q-001',
    title: 'Maintenance',
    quoteLink:
      'https://terraformaflow.com/accept-invite?token=' + 'a'.repeat(64),
    validUntil: '2026-10-28T00:00:00Z',
  }
  const config = {
    key: 'secret',
    sender: 'requests@terraformaflow.com',
    origin: 'https://terraformaflow.com',
  }
  it('uses independent 32-byte random tokens', () => {
    const first = generateQuoteToken()
    const second = generateQuoteToken()
    expect(first.token).toMatch(/^[a-f0-9]{64}$/)
    expect(first.tokenHash).not.toBe(first.token)
    expect(first.token).not.toBe(second.token)
  })
  it('escapes HTML while retaining readable plain text and expiry', () => {
    const result = quoteEmailMessage(message)
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;&quot;&amp;&#39;Team')
    expect(result.text).toContain(message.organization)
    expect(result.text).toContain(message.validUntil)
  })
  it('sends with fixed provider URL and sender, timeout and hash idempotency key', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"email-id"}'))
    vi.stubGlobal('fetch', fetch)
    expect(
      await sendQuoteEmail(config, {
        ...message,
        email: 'recipient@example.com',
        token: 'a'.repeat(64),
        tokenId: '0198f0a0-0000-7000-8000-000000000001',
        organizationEmail: 'office@example.com',
      }),
    ).toEqual({ status: 'sent', messageId: 'email-id' })
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(options.headers['Idempotency-Key']).toBe(
      'quote-delivery-0198f0a0-0000-7000-8000-000000000001',
    )
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
      await sendQuoteEmail(config, {
        ...message,
        email: 'recipient@example.com',
        token: 'a'.repeat(64),
        tokenId: '0198f0a0-0000-7000-8000-000000000001',
        organizationEmail: 'office@example.com',
      }),
    ).toEqual({ status: 'failed', messageId: null })
  })
  it('handles timeout and network failures without throwing provider payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
    )
    expect(
      await sendQuoteEmail(config, {
        ...message,
        email: 'recipient@example.com',
        token: 'a'.repeat(64),
        tokenId: '0198f0a0-0000-7000-8000-000000000001',
        organizationEmail: 'office@example.com',
      }),
    ).toEqual({ status: 'failed', messageId: null })
  })
  it('accepts localhost only outside production', () => {
    vi.stubEnv('SERVER_URL', 'http://localhost:3000')
    vi.stubEnv('RESEND_API_KEY', 'secret')
    vi.stubEnv('RESEND_FROM_EMAIL', config.sender)
    vi.stubEnv('NODE_ENV', 'development')
    expect(quoteEmailConfig().origin).toBe('http://localhost:3000')
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => quoteEmailConfig()).toThrow('Quote email is not configured')
  })
  it('rejects invalid client email before sending and trims valid email', () => {
    expect(() => quoteRecipient('not email')).toThrow('Add a valid email')
    expect(quoteRecipient(' client@example.com ')).toBe('client@example.com')
  })
  it.each([
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com?token=secret',
    'https://example.com#fragment',
    'http://example.com',
  ])('rejects unsafe fixed origins', (origin) => {
    vi.stubEnv('SERVER_URL', origin)
    vi.stubEnv('RESEND_API_KEY', 'secret')
    vi.stubEnv('RESEND_FROM_EMAIL', config.sender)
    expect(() => quoteEmailConfig()).toThrow('Quote email is not configured')
  })
})
