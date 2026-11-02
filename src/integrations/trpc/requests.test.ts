import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

// The portal procedures use the trusted (service-role) client.
const admin = vi.hoisted<{
  rpc: { data: unknown; error?: { message: string } | null }
  calls: Array<[string, Record<string, unknown>]>
}>(() => ({ rpc: { data: null }, calls: [] }))

vi.mock('#/env', () => ({
  env: { PORTAL_IP_HMAC_KEY: 'test-key-test-key-test-key' },
}))

vi.mock('#/server/trusted/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      admin.calls.push([name, args])
      return Promise.resolve({ error: null, ...admin.rpc })
    },
  }),
}))

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const SVC = '0198f0a0-0000-7000-8000-000000000002'
const REQ = '0198f0a0-0000-7000-8000-000000000003'

const publicCaller = (ip: string | null = '203.0.113.7') =>
  trpcRouter.createCaller(
    createTRPCContext({
      req: new Request('http://x', ip ? { headers: { 'x-real-ip': ip } } : {}),
    }),
  )
const staffCaller = () => trpcRouter.createCaller(createTRPCContext())

const submitInput = {
  orgSlug: 'acme-lawn',
  serviceId: SVC,
  name: ' Jane ',
  email: 'Jane@Example.com',
  phone: null,
  address: '1 Main St',
  notes: null,
  website: '',
}

beforeEach(() => {
  fake.reset()
  fake.result = { data: [{ id: REQ }], error: null }
  admin.rpc = { data: REQ }
  admin.calls = []
})

describe('portal.get', () => {
  it('returns the portal for a slug without a session', async () => {
    fake.user = null
    admin.rpc = {
      data: { organization_name: 'Acme', services: [] },
      error: null,
    }
    await expect(
      publicCaller().portal.get({ orgSlug: 'acme-lawn' }),
    ).resolves.toEqual({ organization_name: 'Acme', services: [] })
    expect(admin.calls[0]).toEqual(['get_portal', { p_slug: 'acme-lawn' }])
  })

  it('404s on an unknown slug and rejects malformed slugs', async () => {
    admin.rpc = { data: null, error: null }
    await expect(
      publicCaller().portal.get({ orgSlug: 'nope' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      publicCaller().portal.get({ orgSlug: 'Bad Slug!' }),
    ).rejects.toThrow()
  })
})

describe('portal.submit', () => {
  it('submits with normalised fields and a hashed IP, never the raw IP', async () => {
    fake.user = null
    await expect(publicCaller().portal.submit(submitInput)).resolves.toEqual({
      id: REQ,
    })
    const [name, args] = admin.calls[0]
    expect(name).toBe('submit_request')
    expect(args).toMatchObject({
      p_slug: 'acme-lawn',
      p_service_id: SVC,
      p_name: 'Jane',
      p_email: 'jane@example.com',
    })
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(args)).not.toContain('203.0.113.7')
  })

  it('hashes different IPs differently', async () => {
    await publicCaller('203.0.113.7').portal.submit(submitInput)
    await publicCaller('203.0.113.8').portal.submit(submitInput)
    expect(admin.calls[0][1].p_ip_hash).not.toBe(admin.calls[1][1].p_ip_hash)
  })

  it('rejects a filled honeypot without calling the database', async () => {
    await expect(
      publicCaller().portal.submit({ ...submitInput, website: 'spam.com' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(admin.calls).toHaveLength(0)
  })

  it('rejects invalid email and empty address', async () => {
    await expect(
      publicCaller().portal.submit({ ...submitInput, email: 'nope' }),
    ).rejects.toThrow()
    await expect(
      publicCaller().portal.submit({ ...submitInput, address: '  ' }),
    ).rejects.toThrow()
    expect(admin.calls).toHaveLength(0)
  })

  it.each([
    ['portal_rate_limited', 'TOO_MANY_REQUESTS'],
    ['portal_invalid_service', 'BAD_REQUEST'],
    ['portal_not_found', 'NOT_FOUND'],
    ['something else', 'INTERNAL_SERVER_ERROR'],
  ])('maps %s to %s', async (message, code) => {
    admin.rpc = { data: null, error: { message } }
    await expect(
      publicCaller().portal.submit(submitInput),
    ).rejects.toMatchObject({ code })
  })
})

describe('requests (staff)', () => {
  it('rejects unauthenticated callers and workers', async () => {
    fake.user = null
    await expect(
      staffCaller().requests.list({ organizationId: ORG }),
    ).rejects.toThrow('UNAUTHORIZED')
    fake.user = { id: 'u1' }
    fake.setRole('worker')
    await expect(
      staffCaller().requests.list({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      staffCaller().requests.setStatus({
        organizationId: ORG,
        id: REQ,
        status: 'reviewing',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.calls.some(([k]) => k.startsWith('requests.'))).toBe(false)
  })

  it('rejects non-members', async () => {
    fake.setRole(null)
    await expect(
      staffCaller().requests.list({ organizationId: ORG }),
    ).rejects.toThrow('You do not have access to this organization')
  })

  it('scopes list and setStatus to the verified org', async () => {
    await staffCaller().requests.list({ organizationId: ORG })
    expect(fake.calls).toContainEqual(['requests.eq', 'organization_id', ORG])
    fake.calls = []
    await staffCaller().requests.setStatus({
      organizationId: ORG,
      id: REQ,
      status: 'reviewing',
    })
    expect(fake.calls).toContainEqual(['requests.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['requests.eq', 'id', REQ])
  })

  it('404s when setStatus matches no row', async () => {
    fake.result = { data: [], error: null }
    await expect(
      staffCaller().requests.setStatus({
        organizationId: ORG,
        id: REQ,
        status: 'reviewing',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
