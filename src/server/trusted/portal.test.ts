import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  logo: null as string | null,
  sign: vi.fn(async (path: string) => ({
    data: { signedUrl: `signed:${path}` },
    error: null,
  })),
}))
vi.mock('./supabase-admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'org',
              name: 'Acme',
              timezone: 'UTC',
              logo_path: state.logo,
              settings: { online_requests: { enabled: false } },
            },
            error: null,
          }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrl: state.sign }) },
  }),
}))
const { getPortal } = await import('./portal')
beforeEach(() => {
  state.sign.mockClear()
})
it('returns the full public company logo URL without signing it', async () => {
  state.logo = 'https://images.test/company_logos/org/logo.png?v=keep%2Fwhole'
  expect((await getPortal('acme')).logo_url).toBe(state.logo)
  expect(state.sign).not.toHaveBeenCalled()
})
it('continues signing legacy company logos for the public portal', async () => {
  state.logo = 'org/branding/logo.png'
  expect((await getPortal('acme')).logo_url).toBe(`signed:${state.logo}`)
  expect(state.sign).toHaveBeenCalledWith(state.logo, 6 * 60 * 60)
})
it('returns the initial fallback for a missing reference', async () => {
  state.logo = null
  expect((await getPortal('acme')).logo_url).toBeNull()
  expect(state.sign).not.toHaveBeenCalled()
})
