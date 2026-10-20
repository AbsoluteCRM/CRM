import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  user: { id: string } | null
  role: string | null
  result: { data: unknown; error: null | Record<string, string> }
  calls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'dispatcher',
  result: { data: null, error: null },
  calls: [],
}))

vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const done = () => Promise.resolve(state.result)
    for (const m of ['select', 'eq', 'insert', 'update']) {
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
    q.single = done
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
const CLIENT = '0198f0a0-0000-7000-8000-000000000002'
const caller = () => trpcRouter.createCaller(createTRPCContext())

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'dispatcher'
  state.result = { data: null, error: null }
  state.calls = []
})

describe('clients mutations: access', () => {
  it('rejects unauthenticated callers', async () => {
    state.user = null
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: 'Jane Smith',
        kind: 'individual',
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects non-members of the org', async () => {
    state.role = null
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: 'Jane Smith',
        kind: 'individual',
      }),
    ).rejects.toThrow('You do not have access to this organization')
    expect(state.calls.some(([k]) => k === 'clients.insert')).toBe(false)
  })

  it('rejects workers', async () => {
    state.role = 'worker'
    await expect(
      caller().clients.update({
        organizationId: ORG,
        clientId: CLIENT,
        display_name: 'New Name',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    state.role = role
    state.result = { data: { id: CLIENT }, error: null }
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: 'Jane Smith',
        kind: 'individual',
      }),
    ).resolves.toEqual({ id: CLIENT })
  })
})

describe('clients.create', () => {
  it('inserts into the verified org', async () => {
    state.result = { data: { id: CLIENT }, error: null }
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: '  Jane Smith ',
        kind: 'individual',
        email: '  Jane@Example.com ',
        phone: ' (403) 555-0100 ',
      }),
    ).resolves.toEqual({ id: CLIENT })
    expect(state.calls).toContainEqual([
      'clients.insert',
      {
        organization_id: ORG,
        display_name: 'Jane Smith',
        kind: 'individual',
        email: 'jane@example.com',
        phone: '(403) 555-0100',
        company_name: null,
      },
    ])
  })

  it('auto-supplies company_name from display_name for a company client', async () => {
    state.result = { data: { id: CLIENT }, error: null }
    await caller().clients.create({
      organizationId: ORG,
      display_name: 'Acme Property Group',
      kind: 'company',
    })
    expect(state.calls).toContainEqual([
      'clients.insert',
      {
        organization_id: ORG,
        display_name: 'Acme Property Group',
        kind: 'company',
        email: null,
        phone: null,
        company_name: 'Acme Property Group',
      },
    ])
  })

  it('rejects a blank name', async () => {
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: '   ',
        kind: 'individual',
      }),
    ).rejects.toThrow()
  })

  it('rejects an invalid email', async () => {
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: 'Jane Smith',
        kind: 'individual',
        email: 'not-an-email',
      }),
    ).rejects.toThrow()
  })

  it('maps a duplicate to CONFLICT', async () => {
    state.result = { data: null, error: { message: 'dup', code: '23505' } }
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: 'Jane Smith',
        kind: 'individual',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})

describe('clients.update', () => {
  it('filters by org and client id', async () => {
    state.result = { data: [{ id: CLIENT }], error: null }
    await caller().clients.update({
      organizationId: ORG,
      clientId: CLIENT,
      display_name: 'Renamed',
    })
    expect(state.calls).toContainEqual(['clients.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['clients.eq', 'id', CLIENT])
    expect(state.calls).toContainEqual([
      'clients.update',
      { display_name: 'Renamed' },
    ])
  })

  it('normalizes a blank phone/email/notes to null', async () => {
    state.result = { data: [{ id: CLIENT }], error: null }
    await caller().clients.update({
      organizationId: ORG,
      clientId: CLIENT,
      phone: '',
      email: '',
      notes: '',
    })
    expect(state.calls).toContainEqual([
      'clients.update',
      { phone: null, email: null, notes: null },
    ])
  })

  it('returns NOT_FOUND when RLS or the org filter hides the client', async () => {
    state.result = { data: [], error: null }
    await expect(
      caller().clients.update({
        organizationId: ORG,
        clientId: CLIENT,
        status: 'inactive',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('requires something to change', async () => {
    await expect(
      caller().clients.update({ organizationId: ORG, clientId: CLIENT }),
    ).rejects.toThrow()
  })

  it('rejects malformed ids', async () => {
    await expect(
      caller().clients.update({
        organizationId: ORG,
        clientId: 'nope',
        display_name: 'Renamed',
      }),
    ).rejects.toThrow()
  })
})
