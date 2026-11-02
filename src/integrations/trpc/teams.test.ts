import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'
import type { FakeError, FakeResult } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext, createTRPCRouter } = await import('./init')
const { teamsRouter } = await import('./teams')
const router = createTRPCRouter(teamsRouter)
const OTHER = '0198f0a0-0000-7000-8000-000000000002'
const caller = () => router.createCaller(createTRPCContext())
const input = {
  organizationId: ORG,
  email: '  Person@Example.com ',
  role: 'worker' as const,
}
const fetchMock = vi.fn()

// One invite call: the insert result, then the rotation update result.
const invitations = (
  insertError: FakeError | null,
  update: FakeResult = { data: [{ id: 'invite' }], error: null },
) => {
  fake.results.organization_invitations = [
    { data: null, error: insertError },
    update,
  ]
}

beforeEach(() => {
  vi.stubEnv('SERVER_URL', 'https://terraformaflow.com')
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('RESEND_FROM_EMAIL', 'requests@terraformaflow.com')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock
    .mockReset()
    .mockResolvedValue(new Response(JSON.stringify({ id: 'mail' })))
  fake.reset()
  fake.setRole('owner')
  fake.results.organizations = [{ data: { name: '<Team & Co>' }, error: null }]
  invitations(null)
  fake.rpc = {
    data: {
      organization_id: ORG,
      email: 'private@example.com',
      role: 'worker',
    },
    error: null,
  }
})

describe('team invitations', () => {
  it.each(['owner', 'admin'])(
    'allows %s and writes only a seven-day token hash to the verified org',
    async (role) => {
      fake.memberships[ORG] = role
      const before = Date.now()
      const result = await caller().invite(input)
      expect(result).toMatchObject({ delivery: 'sent', resent: false })
      const token = new URL(result.inviteLink).searchParams.get('token')!
      expect(token).toMatch(/^[a-f0-9]{64}$/)
      const row = fake.calls.find(
        ([method]) => method === 'organization_invitations.insert',
      )![1]
      expect(row).toMatchObject({
        organization_id: ORG,
        email: 'person@example.com',
        role: 'worker',
        token_hash: createHash('sha256').update(token).digest('hex'),
      })
      expect(JSON.stringify(row)).not.toContain(token)
      expect(
        Date.parse((row as { expires_at: string }).expires_at),
      ).toBeGreaterThanOrEqual(before + 7 * 86400000)
      expect(fetchMock).toHaveBeenCalledOnce()
    },
  )
  it.each(['dispatcher', 'worker', 'portal', null])(
    'rejects %s before writing or sending',
    async (role) => {
      fake.memberships = role ? { [ORG]: role } : {}
      await expect(caller().invite(input)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(fake.calls.some(([method]) => method.endsWith('.insert'))).toBe(
        false,
      )
    },
  )
  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(caller().invite(input)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    await expect(
      caller().acceptInvite({ token: 'a'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rejects a cross-tenant invitation', async () => {
    await expect(
      caller().invite({ ...input, organizationId: OTHER }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('scopes a multi-org caller to the selected organization', async () => {
    fake.memberships[OTHER] = 'admin'
    await caller().invite({ ...input, organizationId: OTHER })
    expect(fake.calls).toContainEqual(['organizations.eq', 'id', OTHER])
    expect(
      fake.calls.find(([method]) => method.endsWith('.insert'))?.[1],
    ).toMatchObject({ organization_id: OTHER })
  })
  it('validates config before creating or rotating', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(caller().invite(input)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    expect(
      fake.calls.some(([method]) => /\.(insert|update)$/.test(method)),
    ).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([
    'invalid',
    'https://evil.test/path',
    'https://terraformaflow.com?next=evil',
    'http://terraformaflow.com',
  ])('rejects invalid configured origin %s', async (origin) => {
    vi.stubEnv('SERVER_URL', origin)
    await expect(caller().invite(input)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('rotates only the pending-email conflict and checks org/email/unaccepted scope', async () => {
    invitations({
      code: '23505',
      message:
        'duplicate key violates unique constraint "organization_invitations_pending_email_idx"',
    })
    expect(await caller().invite(input)).toMatchObject({ resent: true })
    expect(fake.calls).toContainEqual([
      'organization_invitations.eq',
      'organization_id',
      ORG,
    ])
    expect(fake.calls).toContainEqual([
      'organization_invitations.eq',
      'email',
      'person@example.com',
    ])
    expect(fake.calls).toContainEqual([
      'organization_invitations.is',
      'accepted_at',
      null,
    ])
  })
  it.each(['23505', '42501', 'XX000'])(
    'does not send or rotate after unrelated write error %s',
    async (code) => {
      invitations({ code, message: 'different failure' })
      await expect(caller().invite(input)).rejects.toThrow('Could not create')
      expect(fake.calls.some(([method]) => method.endsWith('.update'))).toBe(
        false,
      )
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
  it('does not send if rotation updates zero rows', async () => {
    invitations(
      {
        code: '23505',
        message: 'organization_invitations_pending_email_idx',
      },
      { data: [], error: null },
    )
    await expect(caller().invite(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('preserves a copyable link on provider failure without leaking details', async () => {
    fetchMock.mockRejectedValue(new Error('private provider details'))
    expect(await caller().invite(input)).toMatchObject({
      delivery: 'failed',
      inviteLink: expect.stringContaining(
        'https://terraformaflow.com/accept-invite?token=',
      ),
    })
  })
  it('rejects malformed email and owner role', async () => {
    await expect(
      caller().invite({ ...input, email: 'wrong' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('explicit acceptance', () => {
  it('calls only the RPC with caller credentials and returns only its organization', async () => {
    fake.memberships = {}
    await expect(
      caller().acceptInvite({ token: 'b'.repeat(64) }),
    ).resolves.toEqual({ organizationId: ORG })
    expect(fake.calls).toEqual([
      ['rpc', 'accept_invitation', { p_token: 'b'.repeat(64) }],
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each(['', 'ABC', 'A'.repeat(64), 'g'.repeat(64)])(
    'rejects malformed token',
    async (token) => {
      await expect(caller().acceptInvite({ token })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
      expect(fake.calls).toEqual([])
    },
  )
  it.each([
    ['22023', 'BAD_REQUEST'],
    ['23505', 'CONFLICT'],
    ['42501', 'FORBIDDEN'],
    ['XX000', 'INTERNAL_SERVER_ERROR'],
  ])('maps %s safely', async (code, result) => {
    fake.rpc.error = { code, message: 'sensitive details' }
    await expect(
      caller().acceptInvite({ token: 'a'.repeat(64) }),
    ).rejects.toMatchObject({ code: result })
    await expect(
      caller().acceptInvite({ token: 'a'.repeat(64) }),
    ).rejects.not.toThrow('sensitive details')
  })
})
