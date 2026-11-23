import { TRPCError } from '@trpc/server'

type ErrorCode = TRPCError['code']

// The one mapping from Postgres (supabase-js) error codes to tRPC codes:
//
//   P0002                          → NOT_FOUND    ("x not found" raised by our functions)
//   23505, 55000                   → CONFLICT     (duplicate; wrong status for the action)
//   42501                          → FORBIDDEN    (RLS, grants, or a role check in a function)
//   23514, 23503, 23502, 22023,
//   22P02                          → BAD_REQUEST  (check, foreign key, not null, bad value)
//   anything else                  → INTERNAL_SERVER_ERROR
const CODES: Partial<Record<string, ErrorCode>> = {
  P0002: 'NOT_FOUND',
  '23505': 'CONFLICT',
  '55000': 'CONFLICT',
  '42501': 'FORBIDDEN',
  '23514': 'BAD_REQUEST',
  '23503': 'BAD_REQUEST',
  '23502': 'BAD_REQUEST',
  '22023': 'BAD_REQUEST',
  '22P02': 'BAD_REQUEST',
}

const GENERIC: Partial<Record<ErrorCode, string>> = {
  NOT_FOUND: 'Not found',
  CONFLICT: 'That conflicts with existing data',
  FORBIDDEN: 'You do not have permission to do that',
  BAD_REQUEST: 'Some of the values are not valid',
}

// Messages Postgres writes itself (constraint, RLS and grant failures) name
// tables and constraints. Messages our SQL functions raise never match this.
const SYSTEM_MESSAGE =
  /violates|permission denied|row-level security|query returned|relation "|constraint "|invalid input/i

// Clients see the message only when one of our SQL functions raised it on
// purpose; otherwise a short generic message per code. `messages` overrides
// the message for a code. The original error is always the cause, for Sentry.
export function dbError(
  error: { message: string; code?: string },
  messages: Partial<Record<ErrorCode, string>> = {},
) {
  const code = (error.code && CODES[error.code]) || 'INTERNAL_SERVER_ERROR'
  const message =
    messages[code] ??
    (code === 'INTERNAL_SERVER_ERROR'
      ? 'Database error'
      : SYSTEM_MESSAGE.test(error.message)
        ? GENERIC[code]
        : error.message)
  return new TRPCError({ code, message, cause: error })
}
