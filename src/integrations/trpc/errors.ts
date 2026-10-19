import { TRPCError } from '@trpc/server'

// Maps Postgres error codes from supabase-js to tRPC codes. P0002 and 55000
// are raised by the quote functions for "not found" and "wrong status".
export function dbError(error: { message: string; code?: string }) {
  const code =
    error.code === 'P0002'
      ? 'NOT_FOUND'
      : error.code === '23505' || error.code === '55000'
        ? 'CONFLICT'
        : error.code === '42501'
          ? 'FORBIDDEN'
          : error.code === '23514' ||
              error.code === '23503' ||
              error.code === '22023'
            ? 'BAD_REQUEST'
            : 'INTERNAL_SERVER_ERROR'
  return new TRPCError({ code, message: error.message, cause: error })
}
