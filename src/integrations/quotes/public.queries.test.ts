import { describe, expect, it, vi } from 'vitest'
import { readPublicMessages, readPublicQuote } from './public.queries'

const id = '0198f0a0-0000-7000-8000-000000000001'
const created_at = '2026-10-27T15:00:00.000Z'
describe('public quote browser reads', () => {
  it('does not cache a malformed success response as a quote', async () => {
    await expect(
      readPublicQuote(async () => ({
        ok: true,
        data: { title: 'Incomplete' },
      })),
    ).rejects.toThrow()
  })
  it('preserves generic unavailable and transient failures', async () => {
    for (const unavailable of [true, false]) {
      const result = {
        ok: false as const,
        unavailable,
        message: 'Please try again.',
      }
      await expect(readPublicQuote(async () => result)).resolves.toEqual(result)
      await expect(readPublicMessages(async () => result)).resolves.toEqual(
        result,
      )
    }
  })
  it('passes both cursor values and validates chronological fields', async () => {
    const cursor = { beforeCreatedAt: created_at, beforeId: id }
    const page = {
      messages: [{ id, created_at, sender_kind: 'customer', body: 'Hello' }],
      olderCursor: cursor,
    }
    const read = vi.fn(async () => ({ ok: true as const, data: page }))
    await expect(readPublicMessages(read, cursor)).resolves.toEqual({
      ok: true,
      data: page,
    })
    expect(read).toHaveBeenCalledWith(cursor)
    await expect(
      readPublicMessages(async () => ({
        ok: true,
        data: { ...page, olderCursor: { beforeId: id } },
      })),
    ).rejects.toThrow()
    await expect(
      readPublicMessages(async () => ({
        ok: true,
        data: {
          ...page,
          messages: [{ ...page.messages[0], sender_kind: 'admin' }],
        },
      })),
    ).rejects.toThrow()
  })
})
