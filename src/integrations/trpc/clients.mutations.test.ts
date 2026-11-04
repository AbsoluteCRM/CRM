import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const CLIENT = '0198f0a0-0000-7000-8000-000000000002'
const caller = () => trpcRouter.createCaller(createTRPCContext())

beforeEach(() => {
  fake.reset()
  fake.setRole('dispatcher')
  fake.result = { data: null, error: null }
})

describe('clients mutations: access', () => {
  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: 'Jane Smith',
        kind: 'individual',
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects non-members of the org', async () => {
    fake.setRole(null)
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: 'Jane Smith',
        kind: 'individual',
      }),
    ).rejects.toThrow('You do not have access to this organization')
    expect(fake.calls.some(([k]) => k === 'clients.insert')).toBe(false)
  })

  it('rejects workers', async () => {
    fake.setRole('worker')
    await expect(
      caller().clients.update({
        organizationId: ORG,
        clientId: CLIENT,
        display_name: 'New Name',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    fake.setRole(role)
    fake.result = { data: { id: CLIENT }, error: null }
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
    fake.result = { data: { id: CLIENT }, error: null }
    await expect(
      caller().clients.create({
        organizationId: ORG,
        display_name: '  Jane Smith ',
        kind: 'individual',
        email: '  Jane@Example.com ',
        phone: ' (403) 555-0100 ',
      }),
    ).resolves.toEqual({ id: CLIENT })
    expect(fake.calls).toContainEqual([
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
    fake.result = { data: { id: CLIENT }, error: null }
    await caller().clients.create({
      organizationId: ORG,
      display_name: 'Acme Property Group',
      kind: 'company',
    })
    expect(fake.calls).toContainEqual([
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
    fake.result = { data: null, error: { message: 'dup', code: '23505' } }
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
    fake.result = { data: [{ id: CLIENT }], error: null }
    await caller().clients.update({
      organizationId: ORG,
      clientId: CLIENT,
      display_name: 'Renamed',
    })
    expect(fake.calls).toContainEqual(['clients.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['clients.eq', 'id', CLIENT])
    expect(fake.calls).toContainEqual([
      'clients.update',
      { display_name: 'Renamed' },
    ])
  })

  it('normalizes a blank phone/email/notes to null', async () => {
    fake.result = { data: [{ id: CLIENT }], error: null }
    await caller().clients.update({
      organizationId: ORG,
      clientId: CLIENT,
      phone: '',
      email: '',
      notes: '',
    })
    expect(fake.calls).toContainEqual([
      'clients.update',
      { phone: null, email: null, notes: null },
    ])
  })

  it('returns NOT_FOUND when RLS or the org filter hides the client', async () => {
    fake.result = { data: [], error: null }
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

describe('client address (billing_* columns)', () => {
  const ADDRESS = {
    address_line1: ' 120 Crowfoot Way NW ',
    address_line2: '',
    city: 'Calgary',
    region: 'AB',
    postal_code: 't3g 2r2',
    country: 'ca',
  }
  const write = (name: string) =>
    fake.calls.find((c) => c[0] === name)?.[1] as Record<string, unknown>

  it('saves an address with a new client', async () => {
    fake.result = { data: { id: CLIENT }, error: null }
    await caller().clients.create({
      organizationId: ORG,
      display_name: 'Jane Smith',
      kind: 'individual',
      address: ADDRESS,
    })
    expect(write('clients.insert')).toMatchObject({
      billing_address_line1: '120 Crowfoot Way NW',
      billing_address_line2: null,
      billing_city: 'Calgary',
      billing_region: 'AB',
      billing_postal_code: 'T3G 2R2',
      billing_country: 'CA',
    })
  })

  it('leaves the address columns out when none is given', async () => {
    fake.result = { data: { id: CLIENT }, error: null }
    await caller().clients.create({
      organizationId: ORG,
      display_name: 'Jane Smith',
      kind: 'individual',
    })
    expect(write('clients.insert')).not.toHaveProperty('billing_city')
  })

  it('updates the address on its own', async () => {
    fake.result = { data: [{ id: CLIENT }], error: null }
    await caller().clients.update({
      organizationId: ORG,
      clientId: CLIENT,
      address: ADDRESS,
    })
    expect(Object.keys(write('clients.update')).sort()).toEqual([
      'billing_address_line1',
      'billing_address_line2',
      'billing_city',
      'billing_country',
      'billing_postal_code',
      'billing_region',
    ])
  })

  it('clears every address column with null', async () => {
    fake.result = { data: [{ id: CLIENT }], error: null }
    await caller().clients.update({
      organizationId: ORG,
      clientId: CLIENT,
      address: null,
    })
    expect(Object.values(write('clients.update'))).toEqual(Array(6).fill(null))
  })

  it.each([
    ['a missing city', { ...ADDRESS, city: '' }],
    ['a country name', { ...ADDRESS, country: 'Canada' }],
  ])('rejects %s', async (_label, address) => {
    await expect(
      caller().clients.update({
        organizationId: ORG,
        clientId: CLIENT,
        address,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
