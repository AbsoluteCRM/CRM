import { createBrowserClient } from '@supabase/ssr'

import { env } from '#/env'

export function createSupabaseBrowserClient() {
  return createBrowserClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
}
