import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = {
  data: unknown
  error: null | { message: string; code?: string }
}

type State = {
  user: { id: string } | null
  role: string | null
  result: Result
  rpc: Result
  rpcCalls: Array<[string, Record<string, unknown>]>
  calls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'admin',
  result: { data: [], error: null },
  rpc: { data: null, error: null },
  rpcCalls: [],
  calls: [],
}))

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const MEMBER = '0198f0a0-0000-7000-8000-000000000002'
const TO = '0198f0a0-0000-7000-8000-000000000003'

vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    let membership = false
    for (const m of ['select', 'eq', 'in', 'lte', 'gte', 'order', 'update']) {
      q[m] = (...a: Array<unknown>) => {
        state.calls.push([`${table}.${m}`, ...a])
        if (m === 'eq' && a[0] === 'user_id') membership = true
        return q
      }
    }
    q.maybeSingle = () =>
      membership
        ? Promise.resolve({
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
        : Promise.resolve({
            data: Array.isArray(state.result.data)
              ? (state.result.data[0] ?? null)
              : state.result.data,
            error: state.result.error,
          })
    q.then = (r: (v: unknown) => unknown) =>
      Promise.resolve(state.result).then(r)
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
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push([name, args])
        return Promise.resolve(state.rpc)
      },
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')
const caller = () => trpcRouter.createCaller(createTRPCContext())
const base = { organizationId: ORG }

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'admin'
  state.result = { data: [{ id: MEMBER }], error: null }
  state.rpc = { data: TO, error: null }
  state.rpcCalls = []
  state.calls = []
})

describe('availability access', () => {
  it('lets a contractor request and cancel, but not record, review or set schedules', async () => {
    state.role = 'worker'
    await expect(
      caller().availability.request({
        ...base,
        kind: 'sick',
        start: '2026-11-02',
        end: '2026-11-03',
        note: 'Flu',
      }),
    ).resolves.toEqual({ id: TO })
    expect(state.rpcCalls[0]).toEqual([
      'request_time_off',
      {
        p_org: ORG,
        p_kind: 'sick',
        p_start: '2026-11-02',
        p_end: '2026-11-03',
        p_note: 'Flu',
      },
    ])
    await expect(
      caller().availability.cancel({ ...base, id: TO }),
    ).resolves.toEqual({ id: TO })

    for (const call of [
      () =>
        caller().availability.record({
          ...base,
          memberId: MEMBER,
          kind: 'vacation',
          start: '2026-11-02',
          end: '2026-11-02',
          note: null,
        }),
      () =>
        caller().availability.review({
          ...base,
          id: TO,
          approve: true,
          note: null,
        }),
      () =>
        caller().availability.setSchedule({
          ...base,
          memberId: MEMBER,
          workDays: [1],
          workStart: '08:00',
          workEnd: '17:00',
        }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
    expect(state.rpcCalls.map(([n]) => n)).toEqual([
      'request_time_off',
      'cancel_time_off',
    ])
  })

  it.each(['dispatcher', 'worker'])(
    'stops a %s reviewing requests',
    async (role) => {
      state.role = role
      await expect(
        caller().availability.review({
          ...base,
          id: TO,
          approve: true,
          note: null,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    },
  )

  it('rejects signed-out callers and non-members', async () => {
    state.user = null
    await expect(
      caller().availability.timeOff({
        ...base,
        from: '2026-11-01',
        to: '2026-11-14',
      }),
    ).rejects.toThrow('UNAUTHORIZED')
    state.user = { id: 'u1' }
    state.role = null
    await expect(
      caller().availability.timeOff({
        ...base,
        from: '2026-11-01',
        to: '2026-11-14',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('availability procedures', () => {
  it('lists open time off overlapping the range, scoped to the org', async () => {
    await caller().availability.timeOff({
      ...base,
      from: '2026-11-01',
      to: '2026-11-14',
    })
    expect(state.calls).toContainEqual(['time_off.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual([
      'time_off.in',
      'status',
      ['pending', 'approved'],
    ])
    expect(state.calls).toContainEqual([
      'time_off.lte',
      'start_date',
      '2026-11-14',
    ])
    expect(state.calls).toContainEqual([
      'time_off.gte',
      'end_date',
      '2026-11-01',
    ])
  })

  it('rejects an end date before the start', async () => {
    await expect(
      caller().availability.request({
        ...base,
        kind: 'sick',
        start: '2026-11-03',
        end: '2026-11-02',
        note: null,
      }),
    ).rejects.toThrow()
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('records only for a member of the verified company', async () => {
    state.result = { data: [], error: null }
    await expect(
      caller().availability.record({
        ...base,
        memberId: MEMBER,
        kind: 'vacation',
        start: '2026-11-02',
        end: '2026-11-02',
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('maps database refusals (overlap, own request)', async () => {
    state.rpc = { data: null, error: { message: 'overlaps', code: '55000' } }
    await expect(
      caller().availability.request({
        ...base,
        kind: 'sick',
        start: '2026-11-02',
        end: '2026-11-02',
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    state.rpc = { data: null, error: { message: 'own', code: '42501' } }
    await expect(
      caller().availability.review({
        ...base,
        id: TO,
        approve: true,
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('saves schedules sorted and de-duplicated, scoped to the org', async () => {
    await caller().availability.setSchedule({
      ...base,
      memberId: MEMBER,
      workDays: [5, 1, 3, 1],
      workStart: '07:30',
      workEnd: '16:00',
    })
    expect(state.calls).toContainEqual([
      'organization_members.update',
      { work_days: [1, 3, 5], work_start: '07:30', work_end: '16:00' },
    ])
    expect(state.calls).toContainEqual([
      'organization_members.eq',
      'organization_id',
      ORG,
    ])
    await expect(
      caller().availability.setSchedule({
        ...base,
        memberId: MEMBER,
        workDays: [8],
        workStart: '08:00',
        workEnd: '17:00',
      }),
    ).rejects.toThrow()
    await expect(
      caller().availability.setSchedule({
        ...base,
        memberId: MEMBER,
        workDays: [1],
        workStart: '17:00',
        workEnd: '08:00',
      }),
    ).rejects.toThrow()
  })
})

describe('availability: day off and clearing', () => {
  it('records a one-off day off', async () => {
    await caller().availability.record({
      ...base,
      memberId: MEMBER,
      kind: 'day_off',
      start: '2026-11-04',
      end: '2026-11-04',
      note: null,
    })
    expect(state.rpcCalls[0]).toEqual([
      'record_time_off',
      expect.objectContaining({ p_kind: 'day_off', p_member_id: MEMBER }),
    ])
  })

  it('clears time off for a member of the verified company', async () => {
    state.rpc = { data: 1, error: null }
    await expect(
      caller().availability.clear({
        ...base,
        memberId: MEMBER,
        start: '2026-11-04',
        end: '2026-11-05',
      }),
    ).resolves.toEqual({ cleared: 1 })
    expect(state.calls).toContainEqual([
      'organization_members.eq',
      'organization_id',
      ORG,
    ])
    expect(state.rpcCalls).toEqual([
      [
        'clear_time_off',
        { p_member_id: MEMBER, p_start: '2026-11-04', p_end: '2026-11-05' },
      ],
    ])
  })

  it('refuses to clear for a member outside the company', async () => {
    state.result = { data: [], error: null }
    await expect(
      caller().availability.clear({
        ...base,
        memberId: MEMBER,
        start: '2026-11-04',
        end: '2026-11-04',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('lets only managers clear', async () => {
    state.role = 'worker'
    await expect(
      caller().availability.clear({
        ...base,
        memberId: MEMBER,
        start: '2026-11-04',
        end: '2026-11-04',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
