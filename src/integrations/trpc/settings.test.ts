import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data: unknown; error: null | Record<string, string> }

type State = {
  user: { id: string } | null
  role: string | null
  membershipOrg: string
  /** Rows returned for organizations reads, in call order. */
  orgReads: Array<Result>
  /** Result of organizations updates. */
  update: Result
  counts: Record<string, number>
  removed: Array<Array<string>>
  calls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'admin',
  membershipOrg: '0198f0a0-0000-7000-8000-000000000001',
  orgReads: [],
  update: { data: [], error: null },
  counts: {},
  removed: [],
  calls: [],
}))

vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    let membershipOrgFilter: unknown
    let isUpdate = false
    for (const m of ['select', 'eq', 'update']) {
      q[m] = (...a: Array<unknown>) => {
        state.calls.push([`${table}.${m}`, ...a])
        if (m === 'update') isUpdate = true
        if (m === 'eq' && a[0] === 'organization_id') membershipOrgFilter = a[1]
        return q
      }
    }
    q.maybeSingle = () => {
      if (table === 'organization_members' && !isCount) {
        return Promise.resolve({
          data:
            state.role && membershipOrgFilter === state.membershipOrg
              ? {
                  id: 'm1',
                  organization_id: state.membershipOrg,
                  role: state.role,
                  status: 'active',
                }
              : null,
          error: null,
        })
      }
      return Promise.resolve(
        state.orgReads.shift() ?? { data: null, error: null },
      )
    }
    let isCount = false
    const select = q.select as (...a: Array<unknown>) => unknown
    q.select = (...a: Array<unknown>) => {
      if ((a[1] as { head?: boolean } | undefined)?.head) isCount = true
      return select(...a)
    }
    q.then = (r: (v: unknown) => unknown) =>
      Promise.resolve(
        isCount
          ? { count: state.counts[table] ?? 0, error: null }
          : isUpdate
            ? state.update
            : { data: null, error: null },
      ).then(r)
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
      storage: {
        from: () => ({
          createSignedUrl: (path: string) =>
            Promise.resolve({
              data: { signedUrl: `https://files.test/${path}` },
              error: null,
            }),
          remove: (paths: Array<string>) => {
            state.removed.push(paths)
            return Promise.resolve({ data: [], error: null })
          },
        }),
      },
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const OTHER_ORG = '0198f0a0-0000-7000-8000-0000000000ff'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const orgRow = (over: Record<string, unknown> = {}) => ({
  id: ORG,
  name: 'Acme Lawn',
  slug: 'acme-lawn',
  timezone: 'America/Edmonton',
  currency: 'CAD',
  country: 'CA',
  email: null,
  phone: null,
  address_line1: null,
  address_line2: null,
  city: null,
  region: null,
  postal_code: null,
  logo_path: null,
  settings: {},
  updated_at: '2026-10-29T00:00:00Z',
  ...over,
})

const updates = () =>
  state.calls.filter(([c]) => c === 'organizations.update').map(([, v]) => v)

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'admin'
  state.membershipOrg = ORG
  state.orgReads = []
  state.update = { data: [{ id: ORG }], error: null }
  state.counts = {}
  state.removed = []
  state.calls = []
})

describe('settings access', () => {
  it('rejects signed-out callers', async () => {
    state.user = null
    await expect(
      caller().settings.get({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects a member of another organization (cross-tenant)', async () => {
    await expect(
      caller().settings.get({ organizationId: OTHER_ORG }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      caller().settings.updateProfile({
        organizationId: OTHER_ORG,
        name: 'Hijack',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(updates()).toHaveLength(0)
  })

  it.each(['dispatcher', 'worker'])(
    'lets a %s read but not change settings',
    async (role) => {
      state.role = role
      state.orgReads = [{ data: orgRow(), error: null }]
      await expect(
        caller().settings.get({ organizationId: ORG }),
      ).resolves.toMatchObject({ id: ORG })
      await expect(
        caller().settings.updateProfile({ organizationId: ORG, name: 'X' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(
        caller().settings.updateSettings({
          organizationId: ORG,
          brand_color: '#245a7a',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(
        caller().settings.setLogo({ organizationId: ORG, path: null }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(
        caller().settings.overview({ organizationId: ORG }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(updates()).toHaveLength(0)
    },
  )
})

describe('settings.get', () => {
  it('reads the verified org and fills in defaults', async () => {
    state.orgReads = [
      {
        data: orgRow({
          logo_path: `${ORG}/branding/logo.png`,
          settings: { service_areas: ['Calgary NW'], brand_color: 'nope' },
        }),
        error: null,
      },
    ]
    const org = await caller().settings.get({ organizationId: ORG })
    expect(state.calls).toContainEqual(['organizations.eq', 'id', ORG])
    expect(org.logo_url).toBe(`https://files.test/${ORG}/branding/logo.png`)
    expect(org.settings.service_areas).toEqual(['Calgary NW'])
    // An invalid stored value falls back to the default.
    expect(org.settings.brand_color).toBe('#2f7350')
    expect(org.settings.online_requests.enabled).toBe(true)
    // Open every day by default.
    expect(org.settings.business_hours.sun.closed).toBe(false)
  })
})

describe('settings.updateProfile', () => {
  it('updates only the verified org and blanks empty optional fields', async () => {
    await caller().settings.updateProfile({
      organizationId: ORG,
      name: ' Acme Lawn & Garden ',
      email: '',
      phone: ' 403-555-0100 ',
    })
    expect(updates()[0]).toEqual({
      name: 'Acme Lawn & Garden',
      email: null,
      phone: '403-555-0100',
    })
    expect(state.calls).toContainEqual(['organizations.eq', 'id', ORG])
  })

  it('rejects an invalid email, an empty name, and an empty patch', async () => {
    await expect(
      caller().settings.updateProfile({ organizationId: ORG, email: 'nope' }),
    ).rejects.toThrow()
    await expect(
      caller().settings.updateProfile({ organizationId: ORG, name: '  ' }),
    ).rejects.toThrow()
    await expect(
      caller().settings.updateProfile({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(updates()).toHaveLength(0)
  })

  it('maps a rejected time zone to BAD_REQUEST', async () => {
    state.update = {
      data: null,
      error: { message: 'invalid time zone', code: '22023' },
    }
    await expect(
      caller().settings.updateProfile({
        organizationId: ORG,
        timezone: 'Mars/Olympus',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('settings.updateSettings', () => {
  it('merges into stored settings and keeps keys it does not own', async () => {
    state.orgReads = [
      {
        data: {
          settings: {
            workers_see_prices: true,
            invoice_prefix: 'INV-',
            online_requests: {
              mission: 'Greener yards',
              embed: { height: 700 },
            },
          },
        },
        error: null,
      },
    ]
    state.update = { data: [{ settings: {} }], error: null }
    await caller().settings.updateSettings({
      organizationId: ORG,
      service_areas: ['Calgary NW', 'Calgary NW', 'Airdrie'],
      online_requests: { enabled: false, embed: { style: 'button' } },
    })
    const written = (updates()[0] as { settings: Record<string, unknown> })
      .settings
    expect(written).toMatchObject({
      workers_see_prices: true,
      invoice_prefix: 'INV-',
      service_areas: ['Calgary NW', 'Airdrie'],
      online_requests: {
        enabled: false,
        mission: 'Greener yards',
        embed: { height: 700, style: 'button', enabled: true },
      },
    })
    expect(state.calls).toContainEqual(['organizations.eq', 'id', ORG])
  })

  it('normalizes allowed embed sites to origins', async () => {
    state.orgReads = [{ data: { settings: {} }, error: null }]
    state.update = { data: [{ settings: {} }], error: null }
    await caller().settings.updateSettings({
      organizationId: ORG,
      online_requests: {
        embed: {
          allowed_origins: ['www.acme.test', 'https://shop.acme.test/contact'],
        },
      },
    })
    const written = (updates()[0] as { settings: Record<string, unknown> })
      .settings
    expect(written).toMatchObject({
      online_requests: {
        embed: {
          allowed_origins: ['https://www.acme.test', 'https://shop.acme.test'],
        },
      },
    })
  })

  it('rejects bad colors, hours, and oversized lists before writing', async () => {
    // Typed loosely on purpose: these are payloads the schema must refuse.
    const bad: Array<Record<string, unknown>> = [
      { brand_color: 'green' },
      {
        business_hours: {
          mon: { closed: false, open: '17:00', close: '08:00' },
        },
      },
      { service_areas: Array.from({ length: 51 }, (_, i) => `Area ${i}`) },
      { online_requests: { embed: { height: 50 } } },
      { online_requests: { embed: { allowed_origins: ['http://acme.test'] } } },
      { online_requests: { embed: { allowed_origins: ['not a site'] } } },
    ]
    for (const patch of bad) {
      await expect(
        caller().settings.updateSettings({
          organizationId: ORG,
          ...(patch as object),
        }),
      ).rejects.toThrow()
    }
    expect(updates()).toHaveLength(0)
  })
})

describe('settings.setLogo', () => {
  it('accepts a logo in the org’s branding folder and removes the old file', async () => {
    state.orgReads = [
      { data: { logo_path: `${ORG}/branding/old.png` }, error: null },
    ]
    await caller().settings.setLogo({
      organizationId: ORG,
      path: `${ORG}/branding/logo-1.webp`,
    })
    expect(updates()[0]).toEqual({ logo_path: `${ORG}/branding/logo-1.webp` })
    expect(state.removed).toEqual([[`${ORG}/branding/old.png`]])
  })

  it.each([
    `${OTHER_ORG}/branding/logo.png`,
    `${ORG}/visits/logo.png`,
    `${ORG}/branding/../../${OTHER_ORG}/x.png`,
    `${ORG}/branding/logo.svg`,
  ])('rejects %s', async (path) => {
    await expect(
      caller().settings.setLogo({ organizationId: ORG, path }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(updates()).toHaveLength(0)
  })

  it('clears the logo', async () => {
    state.orgReads = [
      { data: { logo_path: `${ORG}/branding/old.png` }, error: null },
    ]
    await caller().settings.setLogo({ organizationId: ORG, path: null })
    expect(updates()[0]).toEqual({ logo_path: null })
    expect(state.removed).toEqual([[`${ORG}/branding/old.png`]])
  })
})

describe('settings.overview', () => {
  it('counts rows for the verified org only', async () => {
    state.counts = {
      clients: 12,
      services: 5,
      organization_members: 4,
      requests: 7,
    }
    await expect(
      caller().settings.overview({ organizationId: ORG }),
    ).resolves.toEqual({ clients: 12, services: 5, members: 4, requests: 7 })
    for (const t of ['clients', 'services', 'requests']) {
      expect(state.calls).toContainEqual([`${t}.eq`, 'organization_id', ORG])
    }
  })
})

describe('public logo persistence', () => {
  const url = `https://images.test/base/company_logos/${ORG}/logo.png?v=keep%2Fwhole&other=1`
  it.each(['owner', 'admin'])(
    'allows %s and retains the complete URL',
    async (role) => {
      state.role = role
      state.orgReads = [{ data: { logo_path: url }, error: null }]
      await caller().settings.setLogo({ organizationId: ORG, path: url })
      expect(updates()).toEqual([{ logo_path: url }])
      expect(state.removed).toEqual([])
      state.orgReads = [{ data: orgRow({ logo_path: url }), error: null }]
      expect(
        (await caller().settings.get({ organizationId: ORG })).logo_url,
      ).toBe(url)
    },
  )
  it('removes the public reference without calling Storage removal', async () => {
    state.orgReads = [{ data: { logo_path: url }, error: null }]
    await caller().settings.setLogo({ organizationId: ORG, path: null })
    expect(state.removed).toEqual([])
  })
  it('does not remove an old legacy file when saving fails', async () => {
    state.orgReads = [
      { data: { logo_path: `${ORG}/branding/old.png` }, error: null },
    ]
    state.update = { data: null, error: { code: '42501', message: 'denied' } }
    await expect(
      caller().settings.setLogo({ organizationId: ORG, path: url }),
    ).rejects.toThrow()
    expect(state.removed).toEqual([])
  })
  it.each(['portal', null])(
    'denies %s membership before writes',
    async (role) => {
      state.role = role
      await expect(
        caller().settings.setLogo({ organizationId: ORG, path: url }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(updates()).toEqual([])
    },
  )
})

it('scopes logo writes to the selected membership for a multi-org administrator', async () => {
  state.membershipOrg = OTHER_ORG
  const url = `https://images.test/company_logos/${OTHER_ORG}/logo.webp?v=selected`
  await caller().settings.setLogo({ organizationId: OTHER_ORG, path: url })
  expect(updates()).toEqual([{ logo_path: url }])
  expect(state.calls).toContainEqual(['organizations.eq', 'id', OTHER_ORG])
  await expect(
    caller().settings.setLogo({
      organizationId: OTHER_ORG,
      path: `https://images.test/company_logos/${ORG}/logo.png`,
    }),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  expect(updates()).toHaveLength(1)
})
