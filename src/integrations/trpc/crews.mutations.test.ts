import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const CREW = '0198f0a0-0000-7000-8000-000000000002'
const MEMBER = '0198f0a0-0000-7000-8000-000000000003'
const caller = () => trpcRouter.createCaller(createTRPCContext())

beforeEach(() => {
  fake.reset()
  fake.setRole('dispatcher')
  fake.result = { data: null, error: null }
})

describe('crews mutations: access', () => {
  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(
      caller().crews.moveMember({
        organizationId: ORG,
        memberId: MEMBER,
        crewId: CREW,
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects non-members of the org', async () => {
    fake.setRole(null)
    await expect(
      caller().crews.moveMember({
        organizationId: ORG,
        memberId: MEMBER,
        crewId: CREW,
      }),
    ).rejects.toThrow('You do not have access to this organization')
    expect(fake.calls.some(([k]) => k === 'rpc')).toBe(false)
  })

  it('rejects workers', async () => {
    fake.setRole('worker')
    await expect(
      caller().crews.setLead({
        organizationId: ORG,
        crewId: CREW,
        memberId: MEMBER,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    fake.setRole(role)
    await expect(
      caller().crews.moveMember({
        organizationId: ORG,
        memberId: MEMBER,
        crewId: null,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('crews.moveMember / setLead', () => {
  it('calls move_crew_member scoped to the verified org', async () => {
    await caller().crews.moveMember({
      organizationId: ORG,
      memberId: MEMBER,
      crewId: CREW,
    })
    expect(fake.calls).toContainEqual([
      'rpc',
      'move_crew_member',
      { p_organization_id: ORG, p_member_id: MEMBER, p_crew_id: CREW },
    ])
  })

  it('calls set_crew_lead and allows clearing the lead', async () => {
    await caller().crews.setLead({
      organizationId: ORG,
      crewId: CREW,
      memberId: null,
    })
    expect(fake.calls).toContainEqual([
      'rpc',
      'set_crew_lead',
      { p_organization_id: ORG, p_crew_id: CREW, p_member_id: null },
    ])
  })

  it('maps a not-in-crew error to NOT_FOUND with its message', async () => {
    fake.rpc = {
      data: null,
      error: { message: 'member is not in this crew', code: 'P0002' },
    }
    await expect(
      caller().crews.setLead({
        organizationId: ORG,
        crewId: CREW,
        memberId: MEMBER,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'member is not in this crew',
    })
  })

  it('rejects malformed ids', async () => {
    await expect(
      caller().crews.moveMember({
        organizationId: ORG,
        memberId: 'nope',
        crewId: null,
      }),
    ).rejects.toThrow()
  })
})

describe('crews.create', () => {
  it('inserts into the verified org', async () => {
    fake.result = { data: { id: CREW }, error: null }
    await expect(
      caller().crews.create({
        organizationId: ORG,
        name: '  Crew Z ',
        color: '#7fb547',
      }),
    ).resolves.toEqual({ id: CREW })
    expect(fake.calls).toContainEqual([
      'crews.insert',
      { organization_id: ORG, name: 'Crew Z', color: '#7fb547' },
    ])
  })

  it('maps a duplicate name to CONFLICT', async () => {
    fake.result = { data: null, error: { message: 'dup', code: '23505' } }
    await expect(
      caller().crews.create({ organizationId: ORG, name: 'Crew Z' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('rejects a blank name', async () => {
    await expect(
      caller().crews.create({ organizationId: ORG, name: '   ' }),
    ).rejects.toThrow()
  })
})

describe('crews.update', () => {
  it('filters by org and crew id', async () => {
    fake.result = { data: [{ id: CREW }], error: null }
    await caller().crews.update({
      organizationId: ORG,
      crewId: CREW,
      name: 'Renamed',
    })
    expect(fake.calls).toContainEqual(['crews.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['crews.eq', 'id', CREW])
    expect(fake.calls).toContainEqual(['crews.update', { name: 'Renamed' }])
  })

  it('returns NOT_FOUND when RLS or the org filter hides the crew', async () => {
    fake.result = { data: [], error: null }
    await expect(
      caller().crews.update({
        organizationId: ORG,
        crewId: CREW,
        vehicle: 'Truck 1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('requires something to change', async () => {
    await expect(
      caller().crews.update({ organizationId: ORG, crewId: CREW }),
    ).rejects.toThrow()
  })
})
