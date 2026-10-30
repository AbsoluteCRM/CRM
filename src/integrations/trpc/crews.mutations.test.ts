import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  user: { id: string } | null
  role: string | null
  result: { data: unknown; error: null | Record<string, string> }
  calls: Array<[string, ...Array<unknown>]>
  crewFound: boolean
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'dispatcher',
  result: { data: null, error: null },
  calls: [],
  crewFound: true,
}))

vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const done = () => Promise.resolve(state.result)
    for (const m of [
      'select',
      'eq',
      'is',
      'not',
      'order',
      'insert',
      'update',
      'delete',
    ]) {
      q[m] = (...a: Array<unknown>) => (
        state.calls.push([`${table}.${m}`, ...a]),
        q
      )
    }
    q.maybeSingle = () =>
      Promise.resolve({
        data:
          table === 'crews'
            ? state.crewFound
              ? { id: CREW }
              : null
            : state.role
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
      rpc: (fn: string, args: unknown) => (
        state.calls.push(['rpc', fn, args]),
        Promise.resolve(state.result)
      ),
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const CREW = '0198f0a0-0000-7000-8000-000000000002'
const MEMBER = '0198f0a0-0000-7000-8000-000000000003'
const caller = () => trpcRouter.createCaller(createTRPCContext())

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'dispatcher'
  state.result = { data: null, error: null }
  state.calls = []
  state.crewFound = true
})

describe('crews mutations: access', () => {
  it('rejects unauthenticated callers', async () => {
    state.user = null
    await expect(
      caller().crews.moveMember({
        organizationId: ORG,
        memberId: MEMBER,
        crewId: CREW,
      }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects non-members of the org', async () => {
    state.role = null
    await expect(
      caller().crews.moveMember({
        organizationId: ORG,
        memberId: MEMBER,
        crewId: CREW,
      }),
    ).rejects.toThrow('You do not have access to this organization')
    expect(state.calls.some(([k]) => k === 'rpc')).toBe(false)
  })

  it('rejects workers', async () => {
    state.role = 'worker'
    await expect(
      caller().crews.setLead({
        organizationId: ORG,
        crewId: CREW,
        memberId: MEMBER,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    state.role = role
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
    expect(state.calls).toContainEqual([
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
    expect(state.calls).toContainEqual([
      'rpc',
      'set_crew_lead',
      { p_organization_id: ORG, p_crew_id: CREW, p_member_id: null },
    ])
  })

  it('maps a not-in-crew error to BAD_REQUEST', async () => {
    state.result = { data: null, error: { message: 'x', code: 'P0002' } }
    await expect(
      caller().crews.setLead({
        organizationId: ORG,
        crewId: CREW,
        memberId: MEMBER,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
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
    state.result = { data: { id: CREW }, error: null }
    await expect(
      caller().crews.create({
        organizationId: ORG,
        name: '  Crew Z ',
        color: '#7fb547',
      }),
    ).resolves.toEqual({ id: CREW })
    expect(state.calls).toContainEqual([
      'crews.insert',
      { organization_id: ORG, name: 'Crew Z', color: '#7fb547' },
    ])
  })

  it('maps a duplicate name to CONFLICT', async () => {
    state.result = { data: null, error: { message: 'dup', code: '23505' } }
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
    state.result = { data: [{ id: CREW }], error: null }
    await caller().crews.update({
      organizationId: ORG,
      crewId: CREW,
      name: 'Renamed',
    })
    expect(state.calls).toContainEqual(['crews.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['crews.eq', 'id', CREW])
    expect(state.calls).toContainEqual(['crews.update', { name: 'Renamed' }])
  })

  it('returns NOT_FOUND when RLS or the org filter hides the crew', async () => {
    state.result = { data: [], error: null }
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

describe('crews.archive', () => {
  it('unassigns the members, then archives the crew in the verified org', async () => {
    state.result = { data: [{ id: CREW }], error: null }
    await caller().crews.archive({ organizationId: ORG, crewId: CREW })
    const names = state.calls.map((c) => c[0])
    expect(names.indexOf('crew_members.delete')).toBeLessThan(
      names.indexOf('crews.update'),
    )
    expect(state.calls).toContainEqual([
      'crew_members.eq',
      'organization_id',
      ORG,
    ])
    expect(state.calls).toContainEqual(['crew_members.eq', 'crew_id', CREW])
    const patch = state.calls.find((c) => c[0] === 'crews.update')?.[1]
    expect(Object.keys(patch as object)).toEqual(['archived_at'])
    expect(state.calls).toContainEqual(['crews.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['crews.is', 'archived_at', null])
  })

  it('returns NOT_FOUND for a crew outside the org or already deleted', async () => {
    state.result = { data: [], error: null }
    await expect(
      caller().crews.archive({ organizationId: ORG, crewId: CREW }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects workers', async () => {
    state.role = 'worker'
    await expect(
      caller().crews.archive({ organizationId: ORG, crewId: CREW }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(state.calls.some((c) => c[0] === 'crews.update')).toBe(false)
  })
})

describe('crews: disable, restore and archived list', () => {
  it('disables and reactivates a crew in the verified org', async () => {
    state.result = { data: [{ id: CREW }], error: null }
    await caller().crews.setActive({
      organizationId: ORG,
      crewId: CREW,
      active: false,
    })
    const off = state.calls.find((c) => c[0] === 'crews.update')?.[1] as {
      disabled_at: string | null
    }
    expect(off.disabled_at).toEqual(expect.any(String))
    expect(state.calls).toContainEqual(['crews.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['crews.is', 'archived_at', null])

    state.calls = []
    await caller().crews.setActive({
      organizationId: ORG,
      crewId: CREW,
      active: true,
    })
    expect(state.calls).toContainEqual(['crews.update', { disabled_at: null }])
  })

  it('restores an archived crew as active', async () => {
    state.result = { data: [{ id: CREW }], error: null }
    await caller().crews.restore({ organizationId: ORG, crewId: CREW })
    expect(state.calls).toContainEqual([
      'crews.update',
      { archived_at: null, disabled_at: null },
    ])
    expect(state.calls).toContainEqual(['crews.not', 'archived_at', 'is', null])
  })

  it('explains a name clash when restoring', async () => {
    state.result = { data: null, error: { message: 'dup', code: '23505' } }
    await expect(
      caller().crews.restore({ organizationId: ORG, crewId: CREW }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Rename'),
    })
  })

  it('lists archived crews for the org, newest first', async () => {
    state.result = { data: [], error: null }
    await caller().crews.archived({ organizationId: ORG })
    expect(state.calls).toContainEqual(['crews.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['crews.not', 'archived_at', 'is', null])
    expect(state.calls).toContainEqual([
      'crews.order',
      'archived_at',
      { ascending: false },
    ])
  })

  it('keeps workers out', async () => {
    state.role = 'worker'
    await expect(
      caller().crews.archived({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('crews: history and permanent delete', () => {
  it('reports a crew history', async () => {
    state.result = {
      data: [
        {
          past_routes: 4,
          upcoming_routes: 1,
          completed_visits: 9,
          last_route_date: '2026-10-20',
        },
      ],
      error: null,
    }
    await expect(
      caller().crews.history({ organizationId: ORG, crewId: CREW }),
    ).resolves.toEqual({
      pastRoutes: 4,
      upcomingRoutes: 1,
      completedVisits: 9,
      lastRouteDate: '2026-10-20',
    })
    expect(state.calls).toContainEqual([
      'rpc',
      'crew_history',
      { p_crew_id: CREW },
    ])
  })

  it.each(['owner', 'admin'])('lets %s delete a crew', async (role) => {
    state.role = role
    state.result = { data: 2, error: null }
    await expect(
      caller().crews.delete({ organizationId: ORG, crewId: CREW }),
    ).resolves.toEqual({ routesRemoved: 2 })
    expect(state.calls).toContainEqual(['crews.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual([
      'rpc',
      'delete_crew',
      { p_crew_id: CREW },
    ])
  })

  it.each(['dispatcher', 'worker'])(
    'stops a %s deleting a crew',
    async (role) => {
      state.role = role
      await expect(
        caller().crews.delete({ organizationId: ORG, crewId: CREW }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(state.calls.some((c) => c[0] === 'rpc')).toBe(false)
    },
  )

  it('refuses a crew outside the verified org', async () => {
    state.role = 'owner'
    state.crewFound = false
    await expect(
      caller().crews.delete({ organizationId: ORG, crewId: CREW }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(state.calls.some((c) => c[0] === 'rpc')).toBe(false)
  })
})
