import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = {
  data: unknown
  error: null | { message: string; code?: string }
}
type State = {
  user: { id: string } | null
  role: string | null
  results: Record<string, Array<Result>>
  rpc: Result
  rpcCalls: Array<[string, Record<string, unknown>]>
  calls: Array<[string, ...Array<unknown>]>
}

const state = vi.hoisted<State>(() => ({
  user: null,
  role: 'admin',
  results: {},
  rpc: { data: null, error: null },
  rpcCalls: [],
  calls: [],
}))

vi.mock('#/env', () => ({
  env: { PORTAL_IP_HMAC_KEY: 'test-key-test-key-test-key' },
}))

vi.mock('#/server/trusted/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({}),
}))

// Each awaited query on a table consumes the next queued result for it.
vi.mock('#/lib/supabase/server', () => {
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    const next = () =>
      Promise.resolve(
        (state.results[table] as Array<Result> | undefined)?.shift() ?? {
          data: [],
          error: null,
        },
      )
    for (const m of [
      'select',
      'eq',
      'update',
      'insert',
      'delete',
      'order',
      'limit',
      'is',
    ]) {
      q[m] = (...a: Array<unknown>) => (
        state.calls.push([`${table}.${m}`, ...a]),
        q
      )
    }
    const single = () =>
      table === 'organization_members'
        ? Promise.resolve({
            data: state.role
              ? {
                  id: 'm1',
                  organization_id: ORG,
                  role: state.role,
                  status: 'active',
                }
              : null,
            error: null,
          })
        : next().then((r) => ({
            ...r,
            data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data,
          }))
    q.maybeSingle = single
    q.single = single
    q.then = (r: (v: unknown) => unknown) => next().then(r)
    return q
  }
  return {
    createSupabaseServerClient: () => ({
      auth: {
        getUser: () =>
          Promise.resolve(
            state.user
              ? { data: { user: state.user }, error: null }
              : { data: { user: null }, error: { message: 'no session' } },
          ),
      },
      from: (table: string) => chain(table),
      rpc: (name: string, args: Record<string, unknown>) => {
        state.rpcCalls.push([name, args])
        return Promise.resolve(state.rpc)
      },
    }),
  }
})

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const REQ = '0198f0a0-0000-7000-8000-000000000003'
const QUOTE = '0198f0a0-0000-7000-8000-000000000004'
const LINE = '0198f0a0-0000-7000-8000-000000000005'
const TAX = '0198f0a0-0000-7000-8000-000000000006'

const caller = () => trpcRouter.createCaller(createTRPCContext())

const lineInput = {
  organizationId: ORG,
  quoteId: QUOTE,
  serviceId: null,
  description: 'Mow',
  quantity: 2,
  unitPriceCents: 5000,
  isOptional: false,
  frequency: 'one_time' as const,
  seasonStartMonth: null,
  seasonEndMonth: null,
  taxRateIds: [TAX, TAX],
}

beforeEach(() => {
  state.user = { id: 'u1' }
  state.role = 'admin'
  state.results = {}
  state.rpc = { data: QUOTE, error: null }
  state.rpcCalls = []
  state.calls = []
})

describe('quotes access', () => {
  it('rejects unauthenticated callers, workers and non-members on every procedure', async () => {
    const calls = (): Array<Promise<unknown>> => [
      caller().quotes.listForRequest({ organizationId: ORG, requestId: REQ }),
      caller().quotes.get({ organizationId: ORG, quoteId: QUOTE }),
      caller().quotes.taxRates({ organizationId: ORG }),
      caller().quotes.createDraft({ organizationId: ORG, requestId: REQ }),
      caller().quotes.update({
        organizationId: ORG,
        quoteId: QUOTE,
        title: 'T',
        message: null,
        conditions: null,
        validUntil: null,
      }),
      caller().quotes.upsertLine(lineInput),
      caller().quotes.deleteLine({
        organizationId: ORG,
        quoteId: QUOTE,
        lineId: LINE,
      }),
      caller().quotes.pullBack({ organizationId: ORG, quoteId: QUOTE }),
      caller().requests.setInfoNeeded({
        organizationId: ORG,
        id: REQ,
        note: 'x',
      }),
    ]

    state.user = null
    for (const p of calls()) await expect(p).rejects.toThrow('UNAUTHORIZED')
    state.user = { id: 'u1' }
    state.role = 'worker'
    for (const p of calls()) {
      await expect(p).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
    state.role = null
    for (const p of calls()) {
      await expect(p).rejects.toThrow('You do not have access')
    }
    expect(state.rpcCalls).toHaveLength(0)
    expect(
      state.calls.some(([k]) => !k.startsWith('organization_members.')),
    ).toBe(false)
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    state.role = role
    await expect(
      caller().quotes.pullBack({ organizationId: ORG, quoteId: QUOTE }),
    ).resolves.toEqual({ id: QUOTE })
  })
})

describe('quotes reads', () => {
  it('lists only active tax rates for the org', async () => {
    state.results.tax_rates = [{ data: [{ id: TAX }], error: null }]
    await expect(
      caller().quotes.taxRates({ organizationId: ORG }),
    ).resolves.toEqual([{ id: TAX }])
    expect(state.calls).toContainEqual(['tax_rates.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['tax_rates.is', 'archived_at', null])
  })

  it('scopes listForRequest to the org and request', async () => {
    await caller().quotes.listForRequest({
      organizationId: ORG,
      requestId: REQ,
    })
    expect(state.calls).toContainEqual(['quotes.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['quotes.eq', 'request_id', REQ])
  })

  it('get returns quote, lines and delivery, and never selects the token hash', async () => {
    state.results.quotes = [{ data: { id: QUOTE }, error: null }]
    state.results.quote_line_items = [{ data: [{ id: LINE }], error: null }]
    state.results.quote_share_tokens = [
      { data: { delivery_status: 'sent' }, error: null },
    ]
    await expect(
      caller().quotes.get({ organizationId: ORG, quoteId: QUOTE }),
    ).resolves.toEqual({
      quote: { id: QUOTE },
      lines: [{ id: LINE }],
      delivery: { delivery_status: 'sent' },
    })
    const tokenSelect = state.calls.find(
      ([k]) => k === 'quote_share_tokens.select',
    )
    expect(String(tokenSelect?.[1])).not.toContain('token_hash')
    for (const t of ['quotes', 'quote_line_items', 'quote_share_tokens']) {
      expect(state.calls).toContainEqual([`${t}.eq`, 'organization_id', ORG])
    }
  })

  it('404s when the quote is missing', async () => {
    state.results.quotes = [{ data: null, error: null }]
    await expect(
      caller().quotes.get({ organizationId: ORG, quoteId: QUOTE }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('quotes writes', () => {
  it('createDraft calls create_quote_draft and returns the id', async () => {
    await expect(
      caller().quotes.createDraft({
        organizationId: ORG,
        requestId: REQ,
        copyFromQuoteId: QUOTE,
      }),
    ).resolves.toEqual({ id: QUOTE })
    expect(state.rpcCalls[0]).toEqual([
      'create_quote_draft',
      { p_request_id: REQ, p_copy_from_quote_id: QUOTE },
    ])
  })

  it('createDraft seeds one line from the requested service on a first revision', async () => {
    state.results.requests = [{ data: [{ service_id: 'svc-1' }], error: null }]
    state.results.services = [
      {
        data: [
          {
            id: 'svc-1',
            name: 'Lawn maintenance',
            default_price_cents: 12000,
            archived_at: null,
            frequencies: ['weekly', 'monthly'],
            season_start_month: 5,
            season_end_month: 9,
          },
        ],
        error: null,
      },
    ]
    await caller().quotes.createDraft({ organizationId: ORG, requestId: REQ })
    expect(state.calls).toContainEqual([
      'quote_line_items.insert',
      {
        organization_id: ORG,
        quote_id: QUOTE,
        service_id: 'svc-1',
        position: 1,
        description: 'Lawn maintenance',
        quantity: 1,
        unit_price_cents: 12000,
        is_optional: false,
        frequency: 'weekly',
        season_start_month: 5,
        season_end_month: 9,
      },
    ])
  })

  it('createDraft does not seed when copying, or when the service is archived', async () => {
    await caller().quotes.createDraft({
      organizationId: ORG,
      requestId: REQ,
      copyFromQuoteId: QUOTE,
    })
    expect(state.calls.some(([k]) => k === 'requests.select')).toBe(false)

    state.results.requests = [{ data: [{ service_id: 'svc-1' }], error: null }]
    state.results.services = [
      {
        data: [
          {
            id: 'svc-1',
            name: 'X',
            default_price_cents: 1,
            archived_at: 'x',
            frequencies: [],
            season_start_month: null,
            season_end_month: null,
          },
        ],
        error: null,
      },
    ]
    await caller().quotes.createDraft({ organizationId: ORG, requestId: REQ })
    expect(state.calls.some(([k]) => k === 'quote_line_items.insert')).toBe(
      false,
    )
  })

  it.each([
    ['P0002', 'NOT_FOUND'],
    ['55000', 'CONFLICT'],
    ['42501', 'FORBIDDEN'],
    ['23514', 'BAD_REQUEST'],
    [undefined, 'INTERNAL_SERVER_ERROR'],
  ])('maps database error %s to %s', async (code, trpcCode) => {
    state.rpc = { data: null, error: { message: 'boom', code } }
    await expect(
      caller().quotes.pullBack({ organizationId: ORG, quoteId: QUOTE }),
    ).rejects.toMatchObject({ code: trpcCode })
  })

  it('update sends only the editable fields, scoped to the org', async () => {
    state.results.quotes = [{ data: [{ id: QUOTE }], error: null }]
    await caller().quotes.update({
      organizationId: ORG,
      quoteId: QUOTE,
      title: ' Spring ',
      message: '',
      conditions: 'After site visit',
      validUntil: '2026-12-31',
    })
    expect(state.calls).toContainEqual([
      'quotes.update',
      {
        title: 'Spring',
        message: null,
        conditions: 'After site visit',
        valid_until: '2026-12-31',
      },
    ])
    expect(state.calls).toContainEqual(['quotes.eq', 'organization_id', ORG])
    expect(state.calls).toContainEqual(['quotes.eq', 'id', QUOTE])
  })

  it('update 404s when no row matches and rejects a bad date', async () => {
    state.results.quotes = [{ data: [], error: null }]
    const input = {
      organizationId: ORG,
      quoteId: QUOTE,
      title: 'T',
      message: null,
      conditions: null,
      validUntil: null,
    }
    await expect(caller().quotes.update(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      caller().quotes.update({ ...input, validUntil: 'tomorrow' }),
    ).rejects.toThrow()
  })

  it('upsertLine inserts after the last position and attaches deduped taxes, with no amounts or status', async () => {
    state.results.quote_line_items = [
      { data: [{ position: 3 }], error: null },
      { data: { id: LINE }, error: null },
      { data: { id: LINE }, error: null },
    ]
    await caller().quotes.upsertLine(lineInput)
    const insert = state.calls.find(([k]) => k === 'quote_line_items.insert')
    expect(insert?.[1]).toEqual({
      service_id: null,
      description: 'Mow',
      quantity: 2,
      unit_price_cents: 5000,
      is_optional: false,
      frequency: 'one_time',
      season_start_month: null,
      season_end_month: null,
      organization_id: ORG,
      quote_id: QUOTE,
      position: 4,
    })
    expect(state.calls).toContainEqual([
      'quote_line_item_taxes.insert',
      [{ organization_id: ORG, line_item_id: LINE, tax_rate_id: TAX }],
    ])
  })

  it('upsertLine updates an existing line scoped to its quote', async () => {
    state.results.quote_line_items = [
      { data: [{ id: LINE }], error: null },
      { data: { id: LINE }, error: null },
    ]
    await caller().quotes.upsertLine({
      ...lineInput,
      lineId: LINE,
      taxRateIds: [],
    })
    expect(state.calls).toContainEqual([
      'quote_line_items.eq',
      'quote_id',
      QUOTE,
    ])
    expect(state.calls).toContainEqual(['quote_line_items.eq', 'id', LINE])
    expect(state.calls.some(([k]) => k === 'quote_line_items.insert')).toBe(
      false,
    )
    expect(
      state.calls.some(([k]) => k === 'quote_line_item_taxes.insert'),
    ).toBe(false)
    expect(state.calls).toContainEqual(['quote_line_item_taxes.delete'])
  })

  it('upsertLine 404s on a line from another quote and rejects bad numbers', async () => {
    state.results.quote_line_items = [{ data: [], error: null }]
    await expect(
      caller().quotes.upsertLine({ ...lineInput, lineId: LINE }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      caller().quotes.upsertLine({ ...lineInput, quantity: 0 }),
    ).rejects.toThrow()
    await expect(
      caller().quotes.upsertLine({ ...lineInput, unitPriceCents: -1 }),
    ).rejects.toThrow()
    await expect(
      caller().quotes.upsertLine({ ...lineInput, seasonStartMonth: 5 }),
    ).rejects.toThrow()
    await expect(
      caller().quotes.upsertLine({
        ...lineInput,
        seasonStartMonth: 13,
        seasonEndMonth: 14,
      }),
    ).rejects.toThrow()
  })

  it('deleteLine is scoped and 404s when nothing matches', async () => {
    state.results.quote_line_items = [{ data: [{ id: LINE }], error: null }]
    await expect(
      caller().quotes.deleteLine({
        organizationId: ORG,
        quoteId: QUOTE,
        lineId: LINE,
      }),
    ).resolves.toEqual({ id: LINE })
    expect(state.calls).toContainEqual([
      'quote_line_items.eq',
      'quote_id',
      QUOTE,
    ])
    state.results.quote_line_items = [{ data: [], error: null }]
    await expect(
      caller().quotes.deleteLine({
        organizationId: ORG,
        quoteId: QUOTE,
        lineId: LINE,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('pullBack calls pull_back_quote', async () => {
    await caller().quotes.pullBack({ organizationId: ORG, quoteId: QUOTE })
    expect(state.rpcCalls[0]).toEqual([
      'pull_back_quote',
      { p_quote_id: QUOTE },
    ])
  })

  it('setInfoNeeded writes only info_needed, scoped to the org, and clears blanks', async () => {
    state.results.requests = [{ data: [{ id: REQ }], error: null }]
    await caller().requests.setInfoNeeded({
      organizationId: ORG,
      id: REQ,
      note: '  ',
    })
    expect(state.calls).toContainEqual([
      'requests.update',
      { info_needed: null },
    ])
    expect(state.calls).toContainEqual(['requests.eq', 'organization_id', ORG])
    state.results.requests = [{ data: [], error: null }]
    await expect(
      caller().requests.setInfoNeeded({
        organizationId: ORG,
        id: REQ,
        note: 'sqft?',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
