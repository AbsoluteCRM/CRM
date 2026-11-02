import { describe, expect, it } from 'vitest'

import { dbError } from './errors'

describe('dbError', () => {
  it.each([
    ['P0002', 'NOT_FOUND'],
    ['23505', 'CONFLICT'],
    ['55000', 'CONFLICT'],
    ['42501', 'FORBIDDEN'],
    ['23514', 'BAD_REQUEST'],
    ['23503', 'BAD_REQUEST'],
    ['23502', 'BAD_REQUEST'],
    ['22023', 'BAD_REQUEST'],
    ['22P02', 'BAD_REQUEST'],
    ['PGRST116', 'INTERNAL_SERVER_ERROR'],
    [undefined, 'INTERNAL_SERVER_ERROR'],
  ])('maps %s to %s and keeps the cause', (code, trpcCode) => {
    const cause = { message: 'quote not found', code }
    expect(dbError(cause)).toMatchObject({ code: trpcCode, cause })
  })

  it('hides the message of internal errors', () => {
    expect(
      dbError({ message: 'connection to 10.0.0.1 refused', code: 'XX000' }),
    ).toMatchObject({ message: 'Database error' })
  })

  it('passes through messages our SQL functions raise', () => {
    expect(
      dbError({
        message: 'only a sent quote can be pulled back',
        code: '55000',
      }),
    ).toMatchObject({
      code: 'CONFLICT',
      message: 'only a sent quote can be pulled back',
    })
  })

  it.each([
    [
      '23505',
      'duplicate key value violates unique constraint "services_org_name_key"',
    ],
    ['42501', 'new row violates row-level security policy for table "crews"'],
    ['42501', 'permission denied for table clients'],
    ['22P02', 'invalid input syntax for type uuid: "x"'],
  ])('replaces Postgres-generated %s messages', (code, message) => {
    const error = dbError({ message, code })
    expect(error.message).not.toBe(message)
    expect(error.message).not.toMatch(/"|table/)
  })

  it('lets a caller override the message per code', () => {
    expect(
      dbError(
        { message: 'secret', code: 'XX000' },
        { INTERNAL_SERVER_ERROR: 'Try again' },
      ),
    ).toMatchObject({ code: 'INTERNAL_SERVER_ERROR', message: 'Try again' })
  })
})
