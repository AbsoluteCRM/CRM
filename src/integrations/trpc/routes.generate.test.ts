import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const OTHER = '0198f0a0-0000-7000-8000-000000000009'
const VISIT = '0198f0a0-0000-7000-8000-0000000000c1'
const VISIT_2 = '0198f0a0-0000-7000-8000-0000000000c2'
const DATE = '2026-11-03'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const run = (organizationId: string = ORG, date: string = DATE) =>
  caller().routes.generateDrafts({ organizationId, date })

const RESULT = {
  assigned: 7,
  routes_created: 2,
  remaining: 0,
  unassigned: [
    { visit_id: VISIT, reason: 'no_location' },
    { visit_id: VISIT_2, reason: 'area_has_no_crew' },
  ],
}

beforeEach(() => {
  fake.reset()
  fake.setRole('dispatcher')
  fake.rpc = { data: RESULT, error: null }
})

describe('routes.generateDrafts access', () => {
  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(run()).rejects.toThrow('UNAUTHORIZED')
    expect(fake.called('rpc')).toBe(false)
  })

  it('rejects non-members before calling the database', async () => {
    fake.setRole(null)
    await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.called('rpc')).toBe(false)
  })

  it('rejects workers', async () => {
    fake.setRole('worker')
    await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.called('rpc')).toBe(false)
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    fake.setRole(role)
    await expect(run()).resolves.toMatchObject({ assigned: 7 })
  })

  it('uses the requested org for a multi-org user, never another', async () => {
    fake.memberships = { [ORG]: 'worker', [OTHER]: 'dispatcher' }
    await run(OTHER)
    expect(fake.callsTo('rpc')[0][2]).toMatchObject({
      p_organization_id: OTHER,
    })
    await expect(run(ORG)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.callsTo('rpc')).toHaveLength(1)
  })
})

describe('routes.generateDrafts', () => {
  it('calls generate_draft_routes for the verified org and the date', async () => {
    await run()
    expect(fake.calls).toContainEqual([
      'rpc',
      'generate_draft_routes',
      { p_organization_id: ORG, p_date: DATE },
    ])
  })

  it('does not write with the table API', async () => {
    await run()
    for (const [key] of fake.calls)
      expect(key).not.toMatch(/\.(insert|update|delete|upsert)$/)
  })

  it('returns the result in camelCase', async () => {
    await expect(run()).resolves.toEqual({
      assigned: 7,
      routesCreated: 2,
      remaining: 0,
      unassigned: [
        { visitId: VISIT, reason: 'no_location' },
        { visitId: VISIT_2, reason: 'area_has_no_crew' },
      ],
    })
  })

  it('rejects a malformed date or organization id without calling the database', async () => {
    await expect(run(ORG, 'tomorrow')).rejects.toThrow()
    await expect(run('nope')).rejects.toThrow()
    expect(fake.called('rpc')).toBe(false)
  })

  it('maps a role refusal to FORBIDDEN with its message', async () => {
    fake.rpc = {
      data: null,
      error: { message: 'not allowed to build routes', code: '42501' },
    }
    await expect(run()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'not allowed to build routes',
    })
  })

  it('maps a race on a visit to CONFLICT', async () => {
    fake.rpc = {
      data: null,
      error: { message: 'that visit is already on a route', code: '23505' },
    }
    await expect(run()).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'that visit is already on a route',
    })
  })

  it('hides raw Postgres messages', async () => {
    fake.rpc = {
      data: null,
      error: {
        message:
          'duplicate key value violates unique constraint "route_stops_organization_id_visit_id_key"',
        code: '23505',
      },
    }
    await expect(run()).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'That conflicts with existing data',
    })
  })

  it('maps an unexpected error to a generic INTERNAL_SERVER_ERROR', async () => {
    fake.rpc = {
      data: null,
      error: { message: 'deadlock detected', code: '40P01' },
    }
    await expect(run()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database error',
    })
  })

  it('refuses a result of the wrong shape instead of showing a blank summary', async () => {
    fake.rpc = { data: { assigned: 'many' }, error: null }
    await expect(run()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database error',
    })
  })
})
