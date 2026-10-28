import { beforeEach, expect, it, vi } from 'vitest'

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const OTHER = '0198f0a0-0000-7000-8000-000000000002'
const state = vi.hoisted<{
  user: boolean
  roles: Record<string, string>
  calls: Array<[string, unknown]>
  weather: ReturnType<typeof vi.fn>
}>(() => ({
  user: true,
  roles: {},
  calls: [],
  weather: vi.fn(),
}))
vi.mock('#/server/weather', () => ({ getWeatherForecast: state.weather }))
vi.mock('#/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: 'u1' } : null },
        error: null,
      }),
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters[key] = value
          state.calls.push([key, value])
          return q
        },
        maybeSingle: async () => {
          expect(table).toBe('organization_members')
          const org = String(filters.organization_id)
          return {
            data: state.roles[org]
              ? {
                  id: 'm1',
                  organization_id: org,
                  role: state.roles[org],
                  status: 'active',
                }
              : null,
            error: null,
          }
        },
      }
      return q
    },
  }),
}))
const { createTRPCContext, createTRPCRouter } = await import('./init')
const { weatherRouter } = await import('./weather')
const router = createTRPCRouter({ weather: weatherRouter })
const caller = () => router.createCaller(createTRPCContext())
beforeEach(() => {
  state.user = true
  state.roles = { [ORG]: 'admin' }
  state.calls = []
  state.weather.mockReset().mockResolvedValue({ city: 'Calgary' })
})
it('rejects anonymous callers before weather access', async () => {
  state.user = false
  await expect(
    caller().weather.forecast({ organizationId: ORG }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  expect(state.weather).not.toHaveBeenCalled()
})
it.each([null, 'portal'])(
  'rejects non-members and portal role %s before weather access',
  async (role) => {
    state.roles = role ? { [ORG]: role } : {}
    await expect(
      caller().weather.forecast({ organizationId: ORG }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(state.weather).not.toHaveBeenCalled()
  },
)
it.each(['owner', 'admin', 'dispatcher', 'worker'])(
  'allows %s after active membership verification',
  async (role) => {
    state.roles[ORG] = role
    await expect(
      caller().weather.forecast({ organizationId: ORG }),
    ).resolves.toEqual({ city: 'Calgary' })
    expect(state.calls).toEqual([
      ['organization_id', ORG],
      ['user_id', 'u1'],
      ['status', 'active'],
    ])
  },
)
it('verifies membership again before access to cached weather and denies foreign org', async () => {
  await caller().weather.forecast({ organizationId: ORG })
  state.roles = {}
  await expect(
    caller().weather.forecast({ organizationId: ORG }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(
    caller().weather.forecast({ organizationId: OTHER }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(state.weather).toHaveBeenCalledTimes(1)
})
it('scopes membership to each active organization for multi-org users', async () => {
  state.roles[OTHER] = 'worker'
  await caller().weather.forecast({ organizationId: ORG })
  await caller().weather.forecast({ organizationId: OTHER })
  expect(state.calls).toContainEqual(['organization_id', OTHER])
  expect(state.weather).toHaveBeenCalledTimes(2)
})
it('returns generic unavailable errors without upstream cause', async () => {
  state.weather.mockRejectedValue(new Error('secret URL'))
  await expect(
    caller().weather.forecast({ organizationId: ORG }),
  ).rejects.toMatchObject({
    message: 'Weather unavailable',
    code: 'INTERNAL_SERVER_ERROR',
  })
})
