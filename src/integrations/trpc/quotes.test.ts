import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/env', () => ({
  env: { PORTAL_IP_HMAC_KEY: 'test-key-test-key-test-key' },
}))

vi.mock('#/server/trusted/supabase-admin', () => ({
  createSupabaseAdminClient: () => ({}),
}))

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

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
  fake.reset()
  fake.rpc = { data: QUOTE, error: null }
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

    fake.user = null
    for (const p of calls()) await expect(p).rejects.toThrow('UNAUTHORIZED')
    fake.user = { id: 'u1' }
    fake.setRole('worker')
    for (const p of calls()) {
      await expect(p).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
    fake.setRole(null)
    for (const p of calls()) {
      await expect(p).rejects.toThrow('You do not have access')
    }
    expect(fake.called('rpc')).toBe(false)
    expect(
      fake.calls.some(([k]) => !k.startsWith('organization_members.')),
    ).toBe(false)
  })

  it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
    fake.setRole(role)
    await expect(
      caller().quotes.pullBack({ organizationId: ORG, quoteId: QUOTE }),
    ).resolves.toEqual({ id: QUOTE })
  })
})

describe('quotes reads', () => {
  it('lists only active tax rates for the org', async () => {
    fake.results.tax_rates = [{ data: [{ id: TAX }], error: null }]
    await expect(
      caller().quotes.taxRates({ organizationId: ORG }),
    ).resolves.toEqual([{ id: TAX }])
    expect(fake.calls).toContainEqual(['tax_rates.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['tax_rates.is', 'archived_at', null])
  })

  it('scopes listForRequest to the org and request', async () => {
    await caller().quotes.listForRequest({
      organizationId: ORG,
      requestId: REQ,
    })
    expect(fake.calls).toContainEqual(['quotes.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['quotes.eq', 'request_id', REQ])
  })

  it('get returns quote, lines and delivery, and never selects the token hash', async () => {
    fake.results.quotes = [{ data: { id: QUOTE }, error: null }]
    fake.results.quote_line_items = [{ data: [{ id: LINE }], error: null }]
    fake.results.quote_share_tokens = [
      { data: { delivery_status: 'sent' }, error: null },
    ]
    await expect(
      caller().quotes.get({ organizationId: ORG, quoteId: QUOTE }),
    ).resolves.toEqual({
      quote: { id: QUOTE },
      lines: [{ id: LINE }],
      delivery: { delivery_status: 'sent' },
    })
    const tokenSelect = fake.calls.find(
      ([k]) => k === 'quote_share_tokens.select',
    )
    expect(String(tokenSelect?.[1])).not.toContain('token_hash')
    for (const t of ['quotes', 'quote_line_items', 'quote_share_tokens']) {
      expect(fake.calls).toContainEqual([`${t}.eq`, 'organization_id', ORG])
    }
  })

  it('404s when the quote is missing', async () => {
    fake.results.quotes = [{ data: null, error: null }]
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
    expect(fake.callsTo('rpc')[0]).toEqual([
      'rpc',
      'create_quote_draft',
      { p_request_id: REQ, p_copy_from_quote_id: QUOTE },
    ])
  })

  it('createDraft seeds one line from the requested service on a first revision', async () => {
    fake.results.requests = [{ data: [{ service_id: 'svc-1' }], error: null }]
    fake.results.services = [
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
    expect(fake.calls).toContainEqual([
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
    expect(fake.calls.some(([k]) => k === 'requests.select')).toBe(false)

    fake.results.requests = [{ data: [{ service_id: 'svc-1' }], error: null }]
    fake.results.services = [
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
    expect(fake.calls.some(([k]) => k === 'quote_line_items.insert')).toBe(
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
    fake.rpc = { data: null, error: { message: 'boom', code } }
    await expect(
      caller().quotes.pullBack({ organizationId: ORG, quoteId: QUOTE }),
    ).rejects.toMatchObject({ code: trpcCode })
  })

  it('update sends only the editable fields, scoped to the org', async () => {
    fake.results.quotes = [{ data: [{ id: QUOTE }], error: null }]
    await caller().quotes.update({
      organizationId: ORG,
      quoteId: QUOTE,
      title: ' Spring ',
      message: '',
      conditions: 'After site visit',
      validUntil: '2026-12-31',
    })
    expect(fake.calls).toContainEqual([
      'quotes.update',
      {
        title: 'Spring',
        message: null,
        conditions: 'After site visit',
        valid_until: '2026-12-31',
      },
    ])
    expect(fake.calls).toContainEqual(['quotes.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['quotes.eq', 'id', QUOTE])
  })

  it('update 404s when no row matches and rejects a bad date', async () => {
    fake.results.quotes = [{ data: [], error: null }]
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
    fake.results.quote_line_items = [
      { data: [{ position: 3 }], error: null },
      { data: { id: LINE }, error: null },
      { data: { id: LINE }, error: null },
    ]
    await caller().quotes.upsertLine(lineInput)
    const insert = fake.calls.find(([k]) => k === 'quote_line_items.insert')
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
    expect(fake.calls).toContainEqual([
      'quote_line_item_taxes.insert',
      [{ organization_id: ORG, line_item_id: LINE, tax_rate_id: TAX }],
    ])
  })

  it('upsertLine updates an existing line scoped to its quote', async () => {
    fake.results.quote_line_items = [
      { data: [{ id: LINE }], error: null },
      { data: { id: LINE }, error: null },
    ]
    await caller().quotes.upsertLine({
      ...lineInput,
      lineId: LINE,
      taxRateIds: [],
    })
    expect(fake.calls).toContainEqual([
      'quote_line_items.eq',
      'quote_id',
      QUOTE,
    ])
    expect(fake.calls).toContainEqual(['quote_line_items.eq', 'id', LINE])
    expect(fake.calls.some(([k]) => k === 'quote_line_items.insert')).toBe(
      false,
    )
    expect(fake.calls.some(([k]) => k === 'quote_line_item_taxes.insert')).toBe(
      false,
    )
    expect(fake.calls).toContainEqual(['quote_line_item_taxes.delete'])
  })

  it('upsertLine 404s on a line from another quote and rejects bad numbers', async () => {
    fake.results.quote_line_items = [{ data: [], error: null }]
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
    fake.results.quote_line_items = [{ data: [{ id: LINE }], error: null }]
    await expect(
      caller().quotes.deleteLine({
        organizationId: ORG,
        quoteId: QUOTE,
        lineId: LINE,
      }),
    ).resolves.toEqual({ id: LINE })
    expect(fake.calls).toContainEqual([
      'quote_line_items.eq',
      'quote_id',
      QUOTE,
    ])
    fake.results.quote_line_items = [{ data: [], error: null }]
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
    expect(fake.callsTo('rpc')[0]).toEqual([
      'rpc',
      'pull_back_quote',
      { p_quote_id: QUOTE },
    ])
  })

  it('setInfoNeeded writes only info_needed, scoped to the org, and clears blanks', async () => {
    fake.results.requests = [{ data: [{ id: REQ }], error: null }]
    await caller().requests.setInfoNeeded({
      organizationId: ORG,
      id: REQ,
      note: '  ',
    })
    expect(fake.calls).toContainEqual([
      'requests.update',
      { info_needed: null },
    ])
    expect(fake.calls).toContainEqual(['requests.eq', 'organization_id', ORG])
    fake.results.requests = [{ data: [], error: null }]
    await expect(
      caller().requests.setInfoNeeded({
        organizationId: ORG,
        id: REQ,
        note: 'sqft?',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
