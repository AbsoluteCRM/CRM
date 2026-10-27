import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const state = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase-admin', () => ({
  createSupabaseAdminClient: () => ({ rpc: state.rpc }),
}))
const {
  listPublicMessages,
  postPublicMessage,
  getPublicQuote,
  decidePublicQuote,
} = await import('./quotes')
const token = 'a'.repeat(64)
const id = '0198f0a0-0000-7000-8000-000000000001'
const message = {
  id,
  body: 'Hello',
  sender_kind: 'customer',
  created_at: '2026-10-27T12:00:00Z',
  organization_id: 'private',
  staff_user_id: 'private',
}
beforeEach(() =>
  state.rpc.mockReset().mockResolvedValue({ data: [message], error: null }),
)

describe('trusted quote token boundary', () => {
  it('independently rejects malformed bearer tokens before privileged access', async () => {
    await expect(getPublicQuote('bad')).rejects.toThrow()
    await expect(listPublicMessages('bad')).rejects.toThrow()
    await expect(postPublicMessage('bad', 'Hello', id)).rejects.toThrow()
    await expect(decidePublicQuote('bad', 'approve')).rejects.toThrow()
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('sends only a hash to the token RPC and returns safe message fields', async () => {
    const result = await postPublicMessage(token, ' Hello ', id)
    expect(state.rpc).toHaveBeenCalledWith('portal_token_post_message', {
      p_token_hash: createHash('sha256').update(token).digest('hex'),
      p_body: 'Hello',
      p_client_message_id: id,
    })
    expect(result).toEqual({
      id,
      body: 'Hello',
      sender_kind: 'customer',
      created_at: message.created_at,
    })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('returns a paired history cursor with exactly fifty safe rows', async () => {
    state.rpc.mockResolvedValue({
      data: Array.from({ length: 50 }, () => message),
      error: null,
    })
    const page = await listPublicMessages(token)
    expect(page.olderCursor).toEqual({
      beforeCreatedAt: message.created_at,
      beforeId: id,
    })
    expect(page.messages[0]).not.toHaveProperty('organization_id')
  })
  it('hides database errors and makes missing/revoked/expired links indistinguishable', async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: 'secret quote detail' },
    })
    await expect(getPublicQuote(token)).rejects.toThrow('Quote unavailable')
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: token },
    })
    await expect(getPublicQuote(token)).rejects.toThrow(
      'Could not complete this request. Please try again.',
    )
  })
  it('accepts only an empty optional selection and reloads the persisted decision', async () => {
    state.rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'P0002' } })
    await expect(decidePublicQuote(token, 'approve')).rejects.toThrow(
      'Quote unavailable',
    )
    expect(state.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_selected_optional_line_ids: [],
    })
    expect(state.rpc.mock.calls[1]?.[0]).toBe('portal_token_get_quote')
  })
  it('rejects overlong decline reasons before mutation', async () => {
    await expect(
      decidePublicQuote(token, 'decline', 'x'.repeat(1001)),
    ).rejects.toThrow()
    expect(state.rpc).not.toHaveBeenCalled()
  })
})
