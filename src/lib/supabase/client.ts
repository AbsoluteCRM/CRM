import { createBrowserClient } from '@supabase/ssr'

import { env } from '#/env'
import type { Database } from '#/types/database-client'

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
  )
}
