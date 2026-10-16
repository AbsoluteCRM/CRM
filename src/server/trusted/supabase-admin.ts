import { createClient } from '@supabase/supabase-js'

import { env } from '#/env'
import type { Database } from '#/types/database'

// Service-role client: bypasses RLS. Trusted server code only (ADR 0009).
export function createSupabaseAdminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient<Database>(
    env.VITE_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
