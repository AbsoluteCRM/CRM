import { createHmac } from 'node:crypto'

import { TRPCError } from '@trpc/server'

import { env } from '#/env'
import { createSupabaseAdminClient } from './supabase-admin'
import type { Database } from '#/types/database'

type Frequency = Database['public']['Enums']['service_frequency']

export type PortalService = {
  id: string
  name: string
  description: string | null
  unit: string
  default_price_cents: number
  default_duration_minutes: number | null
  color: string
  frequencies: Array<Frequency>
  season_start_month: number | null
  season_end_month: number | null
}

export type Portal = {
  organization_name: string
  services: Array<PortalService>
}

export async function getPortal(slug: string): Promise<Portal> {
  const { data, error } = await createSupabaseAdminClient().rpc('get_portal', {
    p_slug: slug,
  })
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
  return data as unknown as Portal
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
