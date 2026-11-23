import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted<{
  settings: unknown
  missing: boolean
  fail: boolean
  slugs: Array<unknown>
}>(() => ({ settings: {}, missing: false, fail: false, slugs: [] }))

vi.mock('./supabase-admin', () => ({
  createSupabaseAdminClient: () => {
    if (state.fail) throw new Error('no key')
    const q = {
      select: () => q,
      eq: (_c: string, slug: unknown) => (state.slugs.push(slug), q),
      maybeSingle: () =>
        Promise.resolve({
          data: state.missing ? null : { settings: state.settings },
          error: null,
        }),
    }
    return { from: () => q }
  },
}))

const { frameAncestorsFor, SAME_ORIGIN_ONLY } = await import('./frame-policy')
const at = (path: string) =>
  frameAncestorsFor(new URL(`https://app.test${path}`))

beforeEach(() => {
  state.settings = {}
  state.missing = false
  state.fail = false
  state.slugs = []
})

describe('frameAncestorsFor', () => {
  it('keeps every normal page same-origin without a database call', async () => {
    for (const path of [
      '/',
      '/dashboard',
      '/sign-in',
      '/portal/acme',
      '/q/abc',
    ]) {
      await expect(at(path)).resolves.toBe(SAME_ORIGIN_ONLY)
    }
    expect(state.slugs).toEqual([])
  })

  it('lets any site frame the embed view by default', async () => {
    await expect(at('/portal/acme-lawn?embed=true')).resolves.toBe(
      'frame-ancestors *',
    )
    await expect(at('/portal/acme-lawn?embed=1')).resolves.toBe(
      'frame-ancestors *',
    )
    expect(state.slugs).toEqual(['acme-lawn', 'acme-lawn'])
  })

  it('limits framing to the company’s allowed sites', async () => {
    state.settings = {
      online_requests: {
        embed: {
          allowed_origins: ['https://acme.test', 'https://www.acme.test'],
        },
      },
    }
    await expect(at('/portal/acme-lawn?embed=1')).resolves.toBe(
      "frame-ancestors 'self' https://acme.test https://www.acme.test",
    )
  })

  it.each([
    ['embedding is off', { online_requests: { embed: { enabled: false } } }],
    ['requests are off', { online_requests: { enabled: false } }],
  ])('blocks framing when %s', async (_label, settings) => {
    state.settings = settings
    await expect(at('/portal/acme-lawn?embed=1')).resolves.toBe(
      SAME_ORIGIN_ONLY,
    )
  })

  it('fails closed for unknown companies and errors', async () => {
    state.missing = true
    await expect(at('/portal/nope?embed=1')).resolves.toBe(SAME_ORIGIN_ONLY)
    state.missing = false
    state.fail = true
    await expect(at('/portal/acme?embed=1')).resolves.toBe(SAME_ORIGIN_ONLY)
  })
})
