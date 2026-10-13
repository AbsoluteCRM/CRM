import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rows: [] as Array<Record<string, unknown>>,
  error: null as { message: string } | null,
  calls: [] as Array<[string, ...Array<unknown>]>,
}))

vi.mock('#/lib/supabase/server', () => {
  const query = {
    select: (cols: string) => (state.calls.push(['select', cols]), query),
    eq: (c: string, v: unknown) => (state.calls.push(['eq', c, v]), query),
    is: (c: string, v: unknown) => (state.calls.push(['is', c, v]), query),
    order: (c: string) => (
      state.calls.push(['order', c]),
      Promise.resolve({ data: state.rows, error: state.error })
    ),
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
      from: (table: string) => (state.calls.push(['from', table]), query),
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const caller = () => trpcRouter.createCaller(createTRPCContext())

beforeEach(() => {
  state.user = { id: 'u1' }
  state.rows = []
  state.error = null
  state.calls = []
})

describe('crews.list', () => {
  it('rejects unauthenticated callers', async () => {
    state.user = null
    await expect(caller().crews.list({ organizationId: ORG })).rejects.toThrow(
      'UNAUTHORIZED',
    )
    expect(state.calls).toEqual([])
  })

  it('rejects a malformed organization id', async () => {
    await expect(
      caller().crews.list({ organizationId: 'nope' }),
    ).rejects.toThrow()
  })

  it('scopes to the org, excludes archived, and orders by name', async () => {
    state.rows = [{ id: 'c1', crew_members: [] }]
    await expect(caller().crews.list({ organizationId: ORG })).resolves.toEqual(
      [{ id: 'c1', crew_members: [] }],
    )
    expect(state.calls).toContainEqual(['from', 'crews'])
    expect(state.calls).toContainEqual(['eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['is', 'archived_at', null])
    expect(state.calls).toContainEqual(['order', 'name'])
  })

  it('does not select the PostGIS location columns', async () => {
    await caller().crews.list({ organizationId: ORG })
    const select = state.calls.find(([k]) => k === 'select')
    expect(String(select?.[1])).not.toContain('default_start_location')
    expect(String(select?.[1])).not.toContain('default_end_location')
  })

  it('embeds the crew roster', async () => {
    await caller().crews.list({ organizationId: ORG })
    const select = state.calls.find(([k]) => k === 'select')
    expect(String(select?.[1])).toContain('crew_members(member_id, is_lead)')
  })

  it('returns an empty list when RLS hides the org', async () => {
    await expect(caller().crews.list({ organizationId: ORG })).resolves.toEqual(
      [],
    )
  })

  it('surfaces database errors', async () => {
    state.error = { message: 'boom' }
    await expect(caller().crews.list({ organizationId: ORG })).rejects.toThrow(
      'boom',
    )
  })
})
