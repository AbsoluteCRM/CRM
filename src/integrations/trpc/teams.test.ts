import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  user: { id: string } | null
  memberships: Record<string, string>
  insertError: null | { code: string; message: string }
  updateError: null | { code: string; message: string }
  updateRows: Array<{ id: string }>
  rpcError: null | { code: string; message: string }
  calls: Array<[string, ...Array<unknown>]>
}
const state = vi.hoisted<State>(() => ({
  user: { id: 'user' },
  memberships: {},
  insertError: null,
  updateError: null,
  updateRows: [{ id: 'invite' }],
  rpcError: null,
  calls: [],
}))

vi.mock('#/lib/supabase/server', () => ({
  createSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from: (table: string) => {
      let org = ''
      let mutation = ''
      const q: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'is', 'insert', 'update']) {
        q[method] = (...args: Array<unknown>) => {
          state.calls.push([`${table}.${method}`, ...args])
          if (method === 'eq' && args[0] === 'organization_id')
            org = String(args[1])
          if (method === 'insert' || method === 'update') mutation = method
          return q
        }
      }
      q.maybeSingle = async () => ({
        data: state.memberships[org]
          ? {
              id: 'member',
              organization_id: org,
              role: state.memberships[org],
              status: 'active',
            }
          : null,
        error: null,
      })
      q.single = async () => ({ data: { name: '<Team & Co>' }, error: null })
      q.then = (resolve: (result: unknown) => unknown) =>
        Promise.resolve(
          mutation === 'insert'
            ? { data: null, error: state.insertError }
            : { data: state.updateRows, error: state.updateError },
        ).then(resolve)
      return q
    },
    rpc: async (name: string, input: unknown) => {
      state.calls.push([name, input])
      return {
        data: {
          organization_id: ORG,
          email: 'private@example.com',
          role: 'worker',
        },
        error: state.rpcError,
      }
    },
  }),
}))

const { createTRPCContext, createTRPCRouter } = await import('./init')
const { teamsRouter } = await import('./teams')
const router = createTRPCRouter(teamsRouter)
const ORG = '0198f0a0-0000-7000-8000-000000000001'
const OTHER = '0198f0a0-0000-7000-8000-000000000002'
const caller = () => router.createCaller(createTRPCContext())
const input = {
  organizationId: ORG,
  email: '  Person@Example.com ',
  role: 'worker' as const,
}
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('SERVER_URL', 'https://terraformaflow.com')
  vi.stubEnv('RESEND_API_KEY', 'test-key')
  vi.stubEnv('RESEND_FROM_EMAIL', 'requests@terraformaflow.com')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock
    .mockReset()
    .mockResolvedValue(new Response(JSON.stringify({ id: 'mail' })))
  state.user = { id: 'user' }
  state.memberships = { [ORG]: 'owner' }
  state.calls = []
  state.insertError = null
  state.updateError = null
  state.updateRows = [{ id: 'invite' }]
  state.rpcError = null
})

describe('team invitations', () => {
  it.each(['owner', 'admin'])(
    'allows %s and writes only a seven-day token hash to the verified org',
    async (role) => {
      state.memberships[ORG] = role
      const before = Date.now()
      const result = await caller().invite(input)
      expect(result).toMatchObject({ delivery: 'sent', resent: false })
      const token = new URL(result.inviteLink).searchParams.get('token')!
      expect(token).toMatch(/^[a-f0-9]{64}$/)
      const row = state.calls.find(
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
      state.memberships = role ? { [ORG]: role } : {}
      await expect(caller().invite(input)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(state.calls.some(([method]) => method.endsWith('.insert'))).toBe(
        false,
      )
    },
  )
  it('rejects unauthenticated callers', async () => {
    state.user = null
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
    state.memberships[OTHER] = 'admin'
    await caller().invite({ ...input, organizationId: OTHER })
    expect(state.calls).toContainEqual(['organizations.eq', 'id', OTHER])
    expect(
      state.calls.find(([method]) => method.endsWith('.insert'))?.[1],
    ).toMatchObject({ organization_id: OTHER })
  })
  it('validates config before creating or rotating', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(caller().invite(input)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    expect(
      state.calls.some(([method]) => /\.(insert|update)$/.test(method)),
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
    state.insertError = {
      code: '23505',
      message:
        'duplicate key violates unique constraint "organization_invitations_pending_email_idx"',
    }
    expect(await caller().invite(input)).toMatchObject({ resent: true })
    expect(state.calls).toContainEqual([
      'organization_invitations.eq',
      'organization_id',
      ORG,
    ])
    expect(state.calls).toContainEqual([
      'organization_invitations.eq',
      'email',
      'person@example.com',
    ])
    expect(state.calls).toContainEqual([
      'organization_invitations.is',
      'accepted_at',
      null,
    ])
  })
  it.each(['23505', '42501', 'XX000'])(
    'does not send or rotate after unrelated write error %s',
    async (code) => {
      state.insertError = { code, message: 'different failure' }
      await expect(caller().invite(input)).rejects.toThrow('Could not create')
      expect(state.calls.some(([method]) => method.endsWith('.update'))).toBe(
        false,
      )
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
  it('does not send if rotation updates zero rows', async () => {
    state.insertError = {
      code: '23505',
      message: 'organization_invitations_pending_email_idx',
    }
    state.updateRows = []
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
    state.memberships = {}
    await expect(
      caller().acceptInvite({ token: 'b'.repeat(64) }),
    ).resolves.toEqual({ organizationId: ORG })
    expect(state.calls).toEqual([
      ['accept_invitation', { p_token: 'b'.repeat(64) }],
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each(['', 'ABC', 'A'.repeat(64), 'g'.repeat(64)])(
    'rejects malformed token',
    async (token) => {
      await expect(caller().acceptInvite({ token })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      })
      expect(state.calls).toEqual([])
    },
  )
  it.each([
    ['22023', 'BAD_REQUEST'],
    ['23505', 'CONFLICT'],
    ['42501', 'FORBIDDEN'],
    ['XX000', 'INTERNAL_SERVER_ERROR'],
  ])('maps %s safely', async (code, result) => {
    state.rpcError = { code, message: 'sensitive details' }
    await expect(
      caller().acceptInvite({ token: 'a'.repeat(64) }),
    ).rejects.toMatchObject({ code: result })
    await expect(
      caller().acceptInvite({ token: 'a'.repeat(64) }),
    ).rejects.not.toThrow('sensitive details')
  })
})

describe('teams.setCertifications', () => {
  const MEMBER = '0198f0a0-0000-7000-8000-0000000000aa'
  it('saves trimmed, de-duplicated certifications for a member of the verified org', async () => {
    state.memberships = { [ORG]: 'admin' }
    state.updateRows = [{ id: MEMBER }]
    state.calls = []
    await expect(
      caller().setCertifications({
        organizationId: ORG,
        memberId: MEMBER,
        certifications: [' First Aid / CPR ', 'first aid / cpr', 'Class 5'],
      }),
    ).resolves.toEqual({ certifications: ['First Aid / CPR', 'Class 5'] })
    expect(state.calls).toContainEqual([
      'organization_members.update',
      { certifications: ['First Aid / CPR', 'Class 5'] },
    ])
    expect(state.calls).toContainEqual([
      'organization_members.eq',
      'organization_id',
      ORG,
    ])
    expect(state.calls).toContainEqual([
      'organization_members.eq',
      'id',
      MEMBER,
    ])
  })

  it('returns NOT_FOUND for a member outside the org', async () => {
    state.memberships = { [ORG]: 'owner' }
    state.updateRows = []
    await expect(
      caller().setCertifications({
        organizationId: ORG,
        memberId: MEMBER,
        certifications: [],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it.each(['dispatcher', 'worker'])('stops a %s', async (role) => {
    state.memberships = { [ORG]: role }
    state.calls = []
    await expect(
      caller().setCertifications({
        organizationId: ORG,
        memberId: MEMBER,
        certifications: ['Class 5'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(
      state.calls.some((c) => c[0] === 'organization_members.update'),
    ).toBe(false)
  })
})
