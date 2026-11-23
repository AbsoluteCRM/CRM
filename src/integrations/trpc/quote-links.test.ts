import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  rpc: { data: unknown; error: null | { message: string; code?: string } }
  rpcCalls: Array<[string, Record<string, unknown>]>
}

const state = vi.hoisted<State>(() => ({
  rpc: { data: null, error: null },
  rpcCalls: [],
}))

vi.mock('#/server/trusted/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push([name, args])
      return Promise.resolve(state.rpc)
    },
  }),
}))

vi.mock('#/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: null }, error: { message: 'none' } }),
    },
  }),
}))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const caller = () => trpcRouter.createCaller(createTRPCContext())
const TOKEN = 'ab'.repeat(32)
const HASH = createHash('sha256').update(TOKEN).digest('hex')
const LINE = '0198f0a0-0000-7000-8000-000000000005'

beforeEach(() => {
  state.rpc = { data: null, error: null }
  state.rpcCalls = []
})

describe('quoteLink (public, token-authorized)', () => {
  it('reads the quote by the token’s hash, never the raw token', async () => {
    state.rpc = { data: { number: 'Q-1', status: 'sent' }, error: null }
    await expect(caller().quoteLink.get({ token: TOKEN })).resolves.toEqual({
      number: 'Q-1',
      status: 'sent',
    })
    expect(state.rpcCalls[0]).toEqual([
      'portal_token_get_quote',
      { p_token_hash: HASH },
    ])
    expect(JSON.stringify(state.rpcCalls)).not.toContain(TOKEN)
  })

  it('turns every token failure into the same NOT_FOUND', async () => {
    state.rpc = {
      data: null,
      error: { message: 'quote not found', code: 'P0002' },
    }
    for (const call of [
      () => caller().quoteLink.get({ token: TOKEN }),
      () =>
        caller().quoteLink.approve({
          token: TOKEN,
          selectedOptionalLineIds: [],
        }),
      () => caller().quoteLink.decline({ token: TOKEN, reason: null }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
  })

  it('rejects malformed tokens without touching the database', async () => {
    for (const token of ['', 'short', 'g'.repeat(64), TOKEN.toUpperCase()]) {
      await expect(caller().quoteLink.get({ token })).rejects.toThrow()
    }
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('approves with the selected optional lines', async () => {
    await caller().quoteLink.approve({
      token: TOKEN,
      selectedOptionalLineIds: [LINE],
    })
    expect(state.rpcCalls[0]).toEqual([
      'portal_token_approve',
      { p_token_hash: HASH, p_selected_optional_line_ids: [LINE] },
    ])
  })

  it('declines with a trimmed reason, or none', async () => {
    await caller().quoteLink.decline({ token: TOKEN, reason: '  Too pricey ' })
    await caller().quoteLink.decline({ token: TOKEN, reason: '   ' })
    expect(state.rpcCalls.map(([, a]) => a.p_reason)).toEqual([
      'Too pricey',
      null,
    ])
  })

  it('hides database errors from the public', async () => {
    state.rpc = {
      data: null,
      error: { message: 'relation "x" does not exist', code: '42P01' },
    }
    await expect(
      caller().quoteLink.get({ token: TOKEN }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong. Please try again.',
    })
  })
})
