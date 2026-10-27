import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  headers: vi.fn(),
}))
vi.mock('@tanstack/react-start/server', () => ({
  setResponseHeader: state.headers,
}))
vi.mock('#/server/trusted/quotes', () => ({
  getPublicQuote: state.get,
  postPublicMessage: state.post,
  listPublicMessages: vi.fn(),
  decidePublicQuote: vi.fn(),
}))
const { publicQuoteRequest, bearer } = await import('#/server/quote-public')
const getQuote = ({ data }: { data: unknown }) =>
  publicQuoteRequest('test.get', data, bearer, state.get)
const postMessage = ({ data }: { data: unknown }) =>
  publicQuoteRequest('test.post', data, bearer, state.post)
const token = 'a'.repeat(64)
beforeEach(() => {
  state.get.mockReset()
  state.post.mockReset()
  state.headers.mockReset()
})
describe('public quote wrappers', () => {
  it('rejects malformed tokens independently and sends privacy headers', async () => {
    await expect(
      getQuote({ data: { token: 'invalid' } }),
    ).resolves.toMatchObject({ ok: false, unavailable: true })
    expect(state.get).not.toHaveBeenCalled()
    expect(state.headers.mock.calls).toEqual([
      ['cache-control', 'no-store'],
      ['referrer-policy', 'no-referrer'],
      ['x-robots-tag', 'noindex, nofollow'],
    ])
  })
  it('returns the safe rate limit classification without reflecting other errors', async () => {
    state.post.mockRejectedValue(
      new Error('Too many messages. Try again later.'),
    )
    const input = {
      data: {
        token,
        body: 'Hello',
        clientMessageId: '0198f0a0-0000-7000-8000-000000000001',
      },
    }
    await expect(postMessage(input)).resolves.toMatchObject({
      ok: false,
      unavailable: false,
      message: 'Too many messages. Try again later.',
    })
    state.post.mockRejectedValue(new Error(token))
    const result = await postMessage(input)
    expect(JSON.stringify(result)).not.toContain(token)
  })
})
