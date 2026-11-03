import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const OTHER = '0198f0a0-0000-7000-8000-000000000009'
const caller = () => trpcRouter.createCaller(createTRPCContext())

beforeEach(() => {
  fake.reset()
  fake.setRole('dispatcher')
})

describe('clients.list', () => {
  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(
      caller().clients.list({ organizationId: ORG }),
    ).rejects.toThrow('UNAUTHORIZED')
    expect(fake.calls).toEqual([])
  })

  it('rejects non-members before querying clients', async () => {
    fake.setRole(null)
    await expect(
      caller().clients.list({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.called('clients.select')).toBe(false)
  })

  it('rejects a malformed organization id', async () => {
    await expect(
      caller().clients.list({ organizationId: 'nope' }),
    ).rejects.toThrow()
  })

  it('scopes to the org, excludes archived, and orders by name', async () => {
    fake.result = { data: [{ id: 'c1' }], error: null }
    await expect(
      caller().clients.list({ organizationId: ORG }),
    ).resolves.toEqual([{ id: 'c1' }])
    expect(fake.calls).toContainEqual(['clients.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['clients.is', 'archived_at', null])
    expect(fake.calls).toContainEqual([
      'clients.order',
      'display_name',
      { ascending: true },
    ])
  })

  it('uses only the verified org for a multi-org user', async () => {
    fake.memberships = { [ORG]: 'admin', [OTHER]: 'dispatcher' }
    await caller().clients.list({ organizationId: OTHER })
    expect(fake.callsTo('clients.eq')).toEqual([
      ['clients.eq', 'organization_id', OTHER],
    ])
  })

  it('does not select stripe_customer_id', async () => {
    await caller().clients.list({ organizationId: ORG })
    const [select] = fake.callsTo('clients.select')
    expect(String(select[1])).not.toContain('stripe_customer_id')
  })

  it('returns an empty list when RLS hides the rows', async () => {
    await expect(
      caller().clients.list({ organizationId: ORG }),
    ).resolves.toEqual([])
  })

  it('surfaces database errors without the raw message', async () => {
    fake.result = { data: null, error: { message: 'boom' } }
    const error = caller().clients.list({ organizationId: ORG })
    await expect(error).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database error',
      cause: { message: 'boom' },
    })
  })
})
