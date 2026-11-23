import { beforeEach, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

const OTHER = '0198f0a0-0000-7000-8000-000000000002'
const weather = vi.hoisted(() => vi.fn())
vi.mock('#/server/weather', () => ({ getWeatherForecast: weather }))
vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext, createTRPCRouter } = await import('./init')
const { weatherRouter } = await import('./weather')
const router = createTRPCRouter({ weather: weatherRouter })
const caller = () => router.createCaller(createTRPCContext())
beforeEach(() => {
  fake.reset()
  weather.mockReset().mockResolvedValue({ city: 'Calgary' })
})
it('rejects anonymous callers before weather access', async () => {
  fake.user = null
  await expect(
    caller().weather.forecast({ organizationId: ORG }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  expect(weather).not.toHaveBeenCalled()
})
it.each([null, 'portal'])(
  'rejects non-members and portal role %s before weather access',
  async (role) => {
    fake.setRole(role)
    await expect(
      caller().weather.forecast({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(weather).not.toHaveBeenCalled()
  },
)
it.each(['owner', 'admin', 'dispatcher', 'worker'])(
  'allows %s after active membership verification',
  async (role) => {
    fake.setRole(role)
    await expect(
      caller().weather.forecast({ organizationId: ORG }),
    ).resolves.toEqual({ city: 'Calgary' })
    expect(fake.callsTo('organization_members.eq')).toEqual([
      ['organization_members.eq', 'organization_id', ORG],
      ['organization_members.eq', 'user_id', 'u1'],
      ['organization_members.eq', 'status', 'active'],
    ])
    expect(
      fake.calls.every(([k]) => k.startsWith('organization_members.')),
    ).toBe(true)
  },
)
it('verifies membership again before access to cached weather and denies foreign org', async () => {
  await caller().weather.forecast({ organizationId: ORG })
  fake.setRole(null)
  await expect(
    caller().weather.forecast({ organizationId: ORG }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(
    caller().weather.forecast({ organizationId: OTHER }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(weather).toHaveBeenCalledTimes(1)
})
it('scopes membership to each active organization for multi-org users', async () => {
  fake.memberships[OTHER] = 'worker'
  await caller().weather.forecast({ organizationId: ORG })
  await caller().weather.forecast({ organizationId: OTHER })
  expect(fake.calls).toContainEqual([
    'organization_members.eq',
    'organization_id',
    OTHER,
  ])
  expect(weather).toHaveBeenCalledTimes(2)
})
it('returns generic unavailable errors without upstream cause', async () => {
  weather.mockRejectedValue(new Error('secret URL'))
  await expect(
    caller().weather.forecast({ organizationId: ORG }),
  ).rejects.toMatchObject({
    message: 'Weather unavailable',
    code: 'INTERNAL_SERVER_ERROR',
  })
})
