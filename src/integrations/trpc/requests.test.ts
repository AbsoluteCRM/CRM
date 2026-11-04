import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  user: { id: string } | null
  role: string | null
  result: { data: unknown; error: null | Record<string, string> }
  rpc: { data: unknown; error: null | { message: string } }
  rpcCalls: Array<[string, Record<string, unknown>]>
  calls: Array<[string, ...Array<unknown>]>
  /** The organizations row the trusted portal code reads by slug. */
  org: Record<string, unknown> | null
  adminCalls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'admin',
  result: { data: null, error: null },
  rpc: { data: null, error: null },
  rpcCalls: [],
  calls: [],
  org: null,
  adminCalls: [],
}))

const env = vi.hoisted<Record<string, string | undefined>>(() => ({
  PORTAL_IP_HMAC_KEY: 'test-key-test-key-test-key',
}))

vi.mock('#/env', () => ({ env }))

vi.mock('#/server/trusted/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push([name, args])
      return Promise.resolve(state.rpc)
    },
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) {
        q[m] = (...a: Array<unknown>) => (
          state.adminCalls.push([`${table}.${m}`, ...a]),
          q
        )
      }
      q.maybeSingle = () => Promise.resolve({ data: state.org, error: null })
      return q
    },
    storage: {
      from: () => ({
        createSignedUrl: (path: string) =>
          Promise.resolve({
            data: { signedUrl: `https://files.test/${path}?token=t` },
            error: null,
          }),
      }),
    },
  }),
}))

vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const done = () => Promise.resolve(state.result)
    for (const m of ['select', 'eq', 'update', 'order']) {
      q[m] = (...a: Array<unknown>) => (
        state.calls.push([`${table}.${m}`, ...a]),
        q
      )
    }
    q.maybeSingle = () =>
      Promise.resolve({
        data: state.role
          ? {
              id: 'm1',
              organization_id: ORG,
              role: state.role,
              status: 'active',
            }
          : null,
        error: null,
      })
    q.then = (r: (v: unknown) => unknown) => done().then(r)
    return q
  }
  return {
    createSupabaseServerClient: () => ({
      auth: {
        getUser: () =>
          Promise.resolve(
            state.user
              ? { data: { user: state.user }, error: null }
              : { data: { user: null }, error: { message: 'no session' } },
          ),
      },
      from: (table: string) => chain(table),
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const ORG = '0198f0a0-0000-7000-8000-000000000001'
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

const orgRow = (settings: Record<string, unknown> = {}) => ({
  id: ORG,
  name: 'Acme',
  email: 'hello@acme.test',
  phone: '403-555-0100',
  address_line1: '1 Main St',
  city: 'Calgary',
  region: 'AB',
  postal_code: 'T2P 1A1',
  timezone: 'America/Edmonton',
  logo_path: null,
  settings,
})

const PRICED_SERVICE = {
  id: SVC,
  name: 'Mowing',
  description: null,
  unit: 'visit',
  default_price_cents: 4500,
  default_duration_minutes: 45,
  color: '#7fb547',
  frequencies: ['weekly'],
  season_start_month: null,
  season_end_month: null,
}

beforeEach(() => {
  env.TURNSTILE_SECRET_KEY = undefined
  vi.unstubAllGlobals()
  state.org = orgRow()
  state.adminCalls = []
  state.user = { id: 'u1' }
  state.role = 'admin'
  state.result = { data: [{ id: REQ }], error: null }
  state.rpc = { data: REQ, error: null }
  state.rpcCalls = []
  state.calls = []
})

describe('portal.get', () => {
  it('returns the public profile and services for a slug without a session', async () => {
    state.user = null
    state.rpc = {
      data: { organization_name: 'Acme', services: [PRICED_SERVICE] },
      error: null,
    }
    const portal = await publicCaller().portal.get({ orgSlug: 'acme-lawn' })
    expect(portal).toMatchObject({
      organization_name: 'Acme',
      accepting: true,
      brand_color: '#2f7350',
      logo_url: null,
      contact: {
        email: 'hello@acme.test',
        phone: '403-555-0100',
        address: '1 Main St · Calgary, AB · T2P 1A1',
      },
      service_areas: [],
      services: [PRICED_SERVICE],
    })
    expect(portal.business_hours?.mon).toEqual({
      closed: false,
      open: '08:00',
      close: '17:00',
    })
    expect(state.adminCalls).toContainEqual([
      'organizations.eq',
      'slug',
      'acme-lawn',
    ])
    expect(state.rpcCalls[0]).toEqual(['get_portal', { p_slug: 'acme-lawn' }])
  })

  it('returns only allow-listed fields', async () => {
    state.org = {
      ...orgRow({ workers_see_prices: true, invoice_prefix: 'X-' }),
      stripe_account_id: 'acct_secret',
    }
    state.rpc = { data: { services: [] }, error: null }
    const portal = await publicCaller().portal.get({ orgSlug: 'acme-lawn' })
    const json = JSON.stringify(portal)
    expect(json).not.toContain(ORG)
    expect(json).not.toContain('acct_secret')
    expect(json).not.toContain('invoice_prefix')
    expect(json).not.toContain('workers_see_prices')
  })

  it('applies the company’s visibility settings', async () => {
    state.org = {
      ...orgRow({
        brand_color: '#245a7a',
        service_areas: ['Calgary NW'],
        online_requests: {
          tagline: 'Lawns done right',
          mission: 'Greener yards',
          show_prices: false,
          show_hours: false,
          show_contact: false,
        },
      }),
      logo_path: `${ORG}/branding/logo.png`,
    }
    state.rpc = { data: { services: [PRICED_SERVICE] }, error: null }
    const portal = await publicCaller().portal.get({ orgSlug: 'acme-lawn' })
    expect(portal).toMatchObject({
      brand_color: '#245a7a',
      tagline: 'Lawns done right',
      mission: 'Greener yards',
      contact: null,
      business_hours: null,
      service_areas: ['Calgary NW'],
      logo_url: `https://files.test/${ORG}/branding/logo.png?token=t`,
    })
    expect(portal.services[0].default_price_cents).toBeNull()
  })

  it('hides services and stops accepting when requests are switched off', async () => {
    state.org = orgRow({ online_requests: { enabled: false } })
    const portal = await publicCaller().portal.get({ orgSlug: 'acme-lawn' })
    expect(portal.accepting).toBe(false)
    expect(portal.services).toEqual([])
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('404s on an unknown slug and rejects malformed slugs', async () => {
    state.org = null
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
    state.user = null
    await expect(publicCaller().portal.submit(submitInput)).resolves.toEqual({
      id: REQ,
    })
    const [name, args] = state.rpcCalls[0]
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
    expect(state.rpcCalls[0][1].p_ip_hash).not.toBe(
      state.rpcCalls[1][1].p_ip_hash,
    )
  })

  it('refuses submissions when online requests are switched off', async () => {
    state.org = orgRow({ online_requests: { enabled: false } })
    await expect(
      publicCaller().portal.submit(submitInput),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('404s a submission for an unknown slug before writing', async () => {
    state.org = null
    await expect(
      publicCaller().portal.submit(submitInput),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('requires a passing bot check when Turnstile is configured', async () => {
    env.TURNSTILE_SECRET_KEY = 'ts-secret'
    const verify = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ success: false }))),
    )
    vi.stubGlobal('fetch', verify)
    await expect(
      publicCaller().portal.submit(submitInput),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(verify).not.toHaveBeenCalled()
    await expect(
      publicCaller().portal.submit({ ...submitInput, captchaToken: 'bad' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(state.rpcCalls).toHaveLength(0)

    verify.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true }))),
    )
    await expect(
      publicCaller().portal.submit({ ...submitInput, captchaToken: 'good' }),
    ).resolves.toEqual({ id: REQ })
    const [url, init] = verify.mock.calls.at(-1)!
    expect(url).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    )
    const body = new URLSearchParams(String(init.body))
    expect(body.get('secret')).toBe('ts-secret')
    expect(body.get('response')).toBe('good')
  })

  it('rejects a filled honeypot without calling the database', async () => {
    await expect(
      publicCaller().portal.submit({ ...submitInput, website: 'spam.com' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('rejects invalid email and empty address', async () => {
    await expect(
      publicCaller().portal.submit({ ...submitInput, email: 'nope' }),
    ).rejects.toThrow()
    await expect(
      publicCaller().portal.submit({ ...submitInput, address: '  ' }),
    ).rejects.toThrow()
    expect(state.rpcCalls).toHaveLength(0)
  })

  it.each([
    ['portal_rate_limited', 'TOO_MANY_REQUESTS'],
    ['portal_invalid_service', 'BAD_REQUEST'],
    ['portal_not_found', 'NOT_FOUND'],
    ['something else', 'INTERNAL_SERVER_ERROR'],
  ])('maps %s to %s', async (message, code) => {
    state.rpc = { data: null, error: { message } }
    await expect(
      publicCaller().portal.submit(submitInput),
    ).rejects.toMatchObject({ code })
  })
})

describe('requests (staff)', () => {
  it('rejects unauthenticated callers and workers', async () => {
    state.user = null
    await expect(
      staffCaller().requests.list({ organizationId: ORG }),
    ).rejects.toThrow('UNAUTHORIZED')
    state.user = { id: 'u1' }
    state.role = 'worker'
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
    expect(state.calls.some(([k]) => k.startsWith('requests.'))).toBe(false)
  })

  it('rejects non-members', async () => {
    state.role = null
    await expect(
      staffCaller().requests.list({ organizationId: ORG }),
    ).rejects.toThrow('You do not have access to this organization')
  })

  it('scopes list and setStatus to the verified org', async () => {
    await staffCaller().requests.list({ organizationId: ORG })
    expect(state.calls).toContainEqual(['requests.eq', 'organization_id', ORG])
    state.calls = []
    await staffCaller().requests.setStatus({
      organizationId: ORG,
      id: REQ,
      status: 'reviewing',
    })
    expect(state.calls).toContainEqual(['requests.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['requests.eq', 'id', REQ])
  })

  it('404s when setStatus matches no row', async () => {
    state.result = { data: [], error: null }
    await expect(
      staffCaller().requests.setStatus({
        organizationId: ORG,
        id: REQ,
        status: 'reviewing',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
