import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  user: { id: string } | null
  role: string | null
  result: { data: unknown; error: null | Record<string, string> }
  calls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'admin',
  result: { data: null, error: null },
  calls: [],
}))

vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const done = () => Promise.resolve(state.result)
    for (const m of ['select', 'eq', 'insert', 'update', 'order']) {
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
      from: (table: string) =>
        table === 'organization_members' ? chain('members') : chain(table),
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const SVC = '0198f0a0-0000-7000-8000-000000000002'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const input = {
  organizationId: ORG,
  name: 'Snow Removal',
  description: null,
  unit: 'visit' as const,
  default_price_cents: 9000,
  default_duration_minutes: 45,
  color: '#3366ff',
  equipment: ['Plow'],
  frequencies: ['one_time' as const],
  season_start_month: 11,
  season_end_month: 3,
}

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'admin'
  state.result = { data: [{ id: SVC }], error: null }
  state.calls = []
})

describe('services.list', () => {
  it('rejects unauthenticated callers', async () => {
    state.user = null
    await expect(
      caller().services.list({ organizationId: ORG }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects non-members', async () => {
    state.role = null
    await expect(
      caller().services.list({ organizationId: ORG }),
    ).rejects.toThrow('You do not have access to this organization')
    expect(state.calls.some(([k]) => k === 'services.select')).toBe(false)
  })

  it('scopes to the verified org and includes archived rows', async () => {
    await caller().services.list({ organizationId: ORG })
    expect(state.calls).toContainEqual(['services.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual([
      'services.order',
      'name',
      { ascending: true },
    ])
    expect(state.calls.some(([k]) => k === 'services.is')).toBe(false)
  })

  it('surfaces database errors', async () => {
    state.result = { data: null, error: { message: 'boom' } }
    await expect(
      caller().services.list({ organizationId: ORG }),
    ).rejects.toThrow('boom')
  })
})

describe('services mutations: access', () => {
  it.each(['dispatcher', 'worker'])('rejects %s', async (role) => {
    state.role = role
    await expect(caller().services.create(input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      caller().services.setArchived({
        organizationId: ORG,
        id: SVC,
        archived: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(state.calls.some(([k]) => k === 'services.insert')).toBe(false)
  })

  it.each(['owner', 'admin'])('allows %s', async (role) => {
    state.role = role
    state.result = { data: { id: SVC }, error: null }
    await expect(caller().services.create(input)).resolves.toEqual({
      id: SVC,
    })
  })
})

describe('services.create', () => {
  it('writes the season months and pins the verified org', async () => {
    state.result = { data: { id: SVC }, error: null }
    await caller().services.create(input)
    const insert = state.calls.find(([k]) => k === 'services.insert')
    expect(insert?.[1]).toMatchObject({
      organization_id: ORG,
      season_start_month: 11,
      season_end_month: 3,
    })
    expect(insert?.[1]).not.toHaveProperty('organizationId')
  })

  it('accepts a year-round service', async () => {
    state.result = { data: { id: SVC }, error: null }
    await expect(
      caller().services.create({
        ...input,
        season_start_month: null,
        season_end_month: null,
      }),
    ).resolves.toBeDefined()
  })

  it.each([
    { season_start_month: 4, season_end_month: null },
    { season_start_month: null, season_end_month: 4 },
    { season_start_month: 0, season_end_month: 4 },
    { season_start_month: 4, season_end_month: 13 },
  ])('rejects an invalid season %j', async (season) => {
    await expect(
      caller().services.create({ ...input, ...season }),
    ).rejects.toThrow()
    expect(state.calls.some(([k]) => k === 'services.insert')).toBe(false)
  })

  it('rejects empty frequencies and a bad color', async () => {
    await expect(
      caller().services.create({ ...input, frequencies: [] }),
    ).rejects.toThrow()
    await expect(
      caller().services.create({ ...input, color: 'green' }),
    ).rejects.toThrow()
  })

  it('maps a duplicate name to CONFLICT', async () => {
    state.result = { data: null, error: { message: 'dup', code: '23505' } }
    await expect(caller().services.create(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

describe('services.update and setArchived', () => {
  it('filters by org and id', async () => {
    await caller().services.update({
      organizationId: ORG,
      id: SVC,
      season_start_month: 4,
      season_end_month: 10,
    })
    expect(state.calls).toContainEqual(['services.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['services.eq', 'id', SVC])
  })

  it('rejects an empty patch and a half-set season', async () => {
    await expect(
      caller().services.update({ organizationId: ORG, id: SVC }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      caller().services.update({
        organizationId: ORG,
        id: SVC,
        season_start_month: 4,
      }),
    ).rejects.toThrow()
  })

  it('returns NOT_FOUND when RLS or the org filter matches nothing', async () => {
    state.result = { data: [], error: null }
    await expect(
      caller().services.update({ organizationId: ORG, id: SVC, name: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      caller().services.setArchived({
        organizationId: ORG,
        id: SVC,
        archived: false,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('archives with a timestamp and restores with null', async () => {
    await caller().services.setArchived({
      organizationId: ORG,
      id: SVC,
      archived: true,
    })
    await caller().services.setArchived({
      organizationId: ORG,
      id: SVC,
      archived: false,
    })
    const updates = state.calls.filter(([k]) => k === 'services.update')
    expect(typeof (updates[0][1] as { archived_at: unknown }).archived_at).toBe(
      'string',
    )
    expect(updates[1][1]).toEqual({ archived_at: null })
  })
})
