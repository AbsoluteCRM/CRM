import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const OTHER = '0198f0a0-0000-7000-8000-000000000009'
const caller = () => trpcRouter.createCaller(createTRPCContext())

beforeEach(() => {
  fake.reset()
  fake.setRole('worker')
})

describe('crews.list', () => {
  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(caller().crews.list({ organizationId: ORG })).rejects.toThrow(
      'UNAUTHORIZED',
    )
    expect(fake.calls).toEqual([])
  })

  it('rejects non-members before querying crews', async () => {
    fake.setRole(null)
    await expect(
      caller().crews.list({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.called('crews.select')).toBe(false)
  })

  it('rejects a malformed organization id', async () => {
    await expect(
      caller().crews.list({ organizationId: 'nope' }),
    ).rejects.toThrow()
  })

  it('scopes to the org, excludes archived, and orders by name', async () => {
    fake.result = { data: [{ id: 'c1', crew_members: [] }], error: null }
    await expect(caller().crews.list({ organizationId: ORG })).resolves.toEqual(
      [{ id: 'c1', crew_members: [] }],
    )
    expect(fake.calls).toContainEqual(['crews.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['crews.is', 'archived_at', null])
    expect(fake.calls).toContainEqual([
      'crews.order',
      'name',
      { ascending: true },
    ])
  })

  it('uses only the verified org for a multi-org user', async () => {
    fake.memberships = { [ORG]: 'admin', [OTHER]: 'worker' }
    await caller().crews.list({ organizationId: OTHER })
    expect(fake.callsTo('crews.eq')).toEqual([
      ['crews.eq', 'organization_id', OTHER],
    ])
  })

  it('does not select the PostGIS location columns', async () => {
    await caller().crews.list({ organizationId: ORG })
    const [select] = fake.callsTo('crews.select')
    expect(String(select[1])).not.toContain('default_start_location')
    expect(String(select[1])).not.toContain('default_end_location')
  })

  it('embeds the crew roster', async () => {
    await caller().crews.list({ organizationId: ORG })
    const [select] = fake.callsTo('crews.select')
    expect(String(select[1])).toContain('crew_members(member_id, is_lead)')
  })

  it('returns an empty list when RLS hides the rows', async () => {
    await expect(caller().crews.list({ organizationId: ORG })).resolves.toEqual(
      [],
    )
  })

  it('surfaces database errors without the raw message', async () => {
    fake.result = { data: null, error: { message: 'boom' } }
    await expect(
      caller().crews.list({ organizationId: ORG }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database error',
      cause: { message: 'boom' },
    })
  })
})
