import '@tanstack/react-start/server-only'

import { parseCompanySettings } from '#/integrations/settings/schema'
import { createSupabaseAdminClient } from './supabase-admin'

const EMBED_PATH = /^\/portal\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/

/** No other site may frame the app. */
export const SAME_ORIGIN_ONLY = "frame-ancestors 'self'"

/**
 * The CSP frame-ancestors value for a request. Only a company's embed view
 * (`/portal/<slug>?embed=true`) can be framed by other sites, and only when the
 * company allows embedding; its allow-list narrows which sites, and an empty
 * list allows any. Everything else is same-origin only.
 */
export async function frameAncestorsFor(url: URL): Promise<string> {
  const match = EMBED_PATH.exec(url.pathname)
  const embed = url.searchParams.get('embed')
  if (!match || (embed !== 'true' && embed !== '1')) return SAME_ORIGIN_ONLY
  try {
    const { data } = await createSupabaseAdminClient()
      .from('organizations')
      .select('settings')
      .eq('slug', match[1])
      .maybeSingle()
    if (!data) return SAME_ORIGIN_ONLY
    const online = parseCompanySettings(data.settings).online_requests
    if (!online.enabled || !online.embed.enabled) return SAME_ORIGIN_ONLY
    const origins = online.embed.allowed_origins
    return origins.length === 0
      ? 'frame-ancestors *'
      : `frame-ancestors 'self' ${origins.join(' ')}`
  } catch {
    // Fail closed: if settings can't be read, the page can't be framed.
    return SAME_ORIGIN_ONLY
  }
}
