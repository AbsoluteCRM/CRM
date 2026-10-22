import { describe, expect, it } from 'vitest'
import {
  quoteMessageBodySchema,
  quoteMessageCursorSchema,
  quoteMessageSchema,
  quoteTokenSchema,
} from './public.schemas'

describe('public quote boundary schemas', () => {
  it('requires exactly a lowercase 32-byte hex token', () => {
    expect(quoteTokenSchema.safeParse('a'.repeat(64)).success).toBe(true)
    for (const value of ['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])
      expect(quoteTokenSchema.safeParse(value).success).toBe(false)
  })
  it('rejects empty or oversized messages and trims input', () => {
    expect(quoteMessageBodySchema.parse(' Hello\nthere ')).toBe('Hello\nthere')
    expect(quoteMessageBodySchema.safeParse(' \n ').success).toBe(false)
    expect(quoteMessageBodySchema.safeParse('x'.repeat(4001)).success).toBe(
      false,
    )
  })
  it('strips private fields from message responses', () => {
    expect(
      quoteMessageSchema.parse({
        id: '0198f0a0-0000-7000-8000-000000000001',
        sender_kind: 'staff',
        body: 'Hello',
        created_at: '2026-10-21T12:00:00Z',
        organization_id: 'private',
        staff_user_id: 'private',
        client_message_id: 'private',
      }),
    ).toEqual({
      id: '0198f0a0-0000-7000-8000-000000000001',
      sender_kind: 'staff',
      body: 'Hello',
      created_at: '2026-10-21T12:00:00Z',
    })
  })
  it('requires both cursor fields', () => {
    expect(
      quoteMessageCursorSchema.safeParse({
        beforeCreatedAt: '2026-10-21T12:00:00Z',
      }).success,
    ).toBe(false)
  })
})
