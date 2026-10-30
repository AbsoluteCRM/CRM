import { createHmac } from 'node:crypto'

import { TRPCError } from '@trpc/server'

import { env } from '#/env'
import { parseCompanySettings } from '#/integrations/settings/schema'
import { createSupabaseAdminClient } from './supabase-admin'
import type {
  BusinessHours,
  EmbedSettings,
  PortalPalette,
} from '#/integrations/settings/schema'
import type { Database } from '#/types/database'

type Frequency = Database['public']['Enums']['service_frequency']

export type PortalService = {
  id: string
  name: string
  description: string | null
  unit: string
  /** Null when the company hides prices on its public page. */
  default_price_cents: number | null
  default_duration_minutes: number | null
  color: string
  frequencies: Array<Frequency>
  season_start_month: number | null
  season_end_month: number | null
}

/**
 * Everything the public request page may show. Built from an allow-list: the
 * service-role client can read any column, so nothing else leaves this file.
 */
export type Portal = {
  organization_name: string
  /** False when the company switched online requests off in Settings. */
  accepting: boolean
  brand_color: string
  palette: PortalPalette
  logo_url: string | null
  tagline: string | null
  mission: string | null
  about: string | null
  timezone: string
  /** Null when the company hides it. */
  contact: {
    email: string | null
    phone: string | null
    address: string | null
  } | null
  business_hours: BusinessHours | null
  service_areas: Array<string> | null
  embed: Pick<EmbedSettings, 'enabled' | 'compact'>
  services: Array<PortalService>
}

const PORTAL_ORG_COLUMNS =
  'id, name, email, phone, address_line1, city, region, postal_code, timezone, logo_path, settings'

const LOGO_URL_TTL_SECONDS = 60 * 60 * 6

async function loadPortalOrg(slug: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('organizations')
    .select(PORTAL_ORG_COLUMNS)
    .eq('slug', slug)
    .maybeSingle()
  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to load the portal',
      cause: error,
    })
  }
  if (!data) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Portal not found' })
  }
  return { ...data, settings: parseCompanySettings(data.settings) }
}

export async function getPortal(slug: string): Promise<Portal> {
  const admin = createSupabaseAdminClient()
  const org = await loadPortalOrg(slug)
  const online = org.settings.online_requests

  let services: Array<PortalService> = []
  if (online.enabled) {
    const { data, error } = await admin.rpc('get_portal', { p_slug: slug })
    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to load the portal',
        cause: error,
      })
    }
    services = (
      (data as { services?: Array<PortalService> } | null)?.services ?? []
    ).map((s) => (online.show_prices ? s : { ...s, default_price_cents: null }))
  }

  let logoUrl: string | null = null
  if (org.logo_path) {
    const signed = await admin.storage
      .from('org-files')
      .createSignedUrl(org.logo_path, LOGO_URL_TTL_SECONDS)
    logoUrl = signed.data?.signedUrl ?? null
  }

  const address = [
    org.address_line1,
    [org.city, org.region].filter(Boolean).join(', '),
    org.postal_code,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    organization_name: org.name,
    accepting: online.enabled,
    brand_color: org.settings.brand_color,
    palette: online.palette,
    logo_url: logoUrl,
    tagline: online.tagline,
    mission: online.mission,
    about: online.about,
    timezone: org.timezone,
    contact: online.show_contact
      ? { email: org.email, phone: org.phone, address: address || null }
      : null,
    business_hours: online.show_hours ? org.settings.business_hours : null,
    service_areas: online.show_service_areas
      ? org.settings.service_areas
      : null,
    embed: { enabled: online.embed.enabled, compact: online.embed.compact },
    services,
  }
}

// The proxy must overwrite X-Real-IP. Outside production there is no proxy.
export function hashClientIp(headers: Headers) {
  if (!env.PORTAL_IP_HMAC_KEY) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Portal is not configured',
    })
  }
  const ip =
    headers.get('x-real-ip')?.trim() ||
    (process.env.NODE_ENV === 'production' ? null : 'local-dev')
  if (!ip) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Could not identify the client',
    })
  }
  return createHmac('sha256', env.PORTAL_IP_HMAC_KEY).update(ip).digest('hex')
}

const SUBMIT_ERRORS: Partial<
  Record<string, { code: TRPCError['code']; message: string }>
> = {
  portal_not_found: { code: 'NOT_FOUND', message: 'Portal not found' },
  portal_invalid_service: {
    code: 'BAD_REQUEST',
    message: 'That service is no longer available. Please reload the page.',
  },
  portal_closed: {
    code: 'FORBIDDEN',
    message: 'This company isn’t accepting online requests right now.',
  },
  portal_rate_limited: {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Please try again later.',
  },
}

export async function submitRequest(args: {
  slug: string
  serviceId: string
  name: string
  email: string
  phone: string | null
  address: string
  notes: string | null
  ipHash: string
}) {
  // The on/off switch lives in organizations.settings; check it before writing.
  const org = await loadPortalOrg(args.slug)
  if (!org.settings.online_requests.enabled) {
    throw new TRPCError({ ...SUBMIT_ERRORS.portal_closed! })
  }
  const { data, error } = await createSupabaseAdminClient().rpc(
    'submit_request',
    {
      p_slug: args.slug,
      p_service_id: args.serviceId,
      p_name: args.name,
      p_email: args.email,
      p_phone: args.phone as string,
      p_address: args.address,
      p_notes: args.notes as string,
      p_ip_hash: args.ipHash,
    },
  )
  if (error) {
    const known = SUBMIT_ERRORS[error.message]
    if (known) throw new TRPCError({ ...known, cause: error })
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to submit the request',
      cause: error,
    })
  }
  return { id: data }
}
