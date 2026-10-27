import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/tanstackstart-react', () => ({ init: vi.fn() }))
// Import the real telemetry hook without loading any local environment files.
const loadEnv = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {})
const { redactInvitationData } = await import('../../instrument.server.mjs')
afterAll(() => loadEnv.mockRestore())

describe('quote credential telemetry redaction', () => {
  it.each(['a'.repeat(64), '%61'.repeat(64)])(
    'redacts raw or encoded quote path credentials throughout events',
    (token) => {
      const event = {
        request: { url: `https://example.com/q/${token}?page=2#details` },
        exception: { values: [{ value: `Failed request /q/${token}` }] },
        spans: [
          {
            description: `POST /q/${token}?foo=bar`,
            data: { nested: [`/q/${token}/child`] },
          },
        ],
      }
      expect(redactInvitationData(event)).toEqual({
        request: { url: 'https://example.com/q/[redacted]?page=2#details' },
        exception: { values: [{ value: 'Failed request /q/[redacted]' }] },
        spans: [
          {
            description: 'POST /q/[redacted]?foo=bar',
            data: { nested: ['/q/[redacted]/child'] },
          },
        ],
      })
      expect(JSON.stringify(redactInvitationData(event))).not.toContain(token)
    },
  )
  it('retains invitation and nested key redaction', () => {
    expect(
      redactInvitationData({
        token: 'secret',
        data: [
          {
            code: 'secret',
            url: '?token=secret&code=secret&safe=yes',
            note: 'f'.repeat(64),
          },
        ],
      }),
    ).toEqual({
      token: '[redacted]',
      data: [
        {
          code: '[redacted]',
          url: '?token=[redacted]&code=[redacted]&safe=yes',
          note: '[redacted]',
        },
      ],
    })
  })
})
