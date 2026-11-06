import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const SVC = '0198f0a0-0000-7000-8000-000000000002'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const input = {
  organizationId: ORG,
  name: 'Snow Removal',
  description: null,
  unit: 'visit' as const,
  default_price_cents: 9000,
  default_duration_minutes: 45,
  color: '#3366ff',
  equipment: ['Plow'],
  frequencies: ['one_time' as const],
  season_start_month: 11,
  season_end_month: 3,
}

beforeEach(() => {
  fake.reset()
  fake.result = { data: [{ id: SVC }], error: null }
})

describe('services.list', () => {
  it('rejects unauthenticated callers', async () => {
    fake.user = null
    await expect(
      caller().services.list({ organizationId: ORG }),
    ).rejects.toThrow('UNAUTHORIZED')
  })

  it('rejects non-members', async () => {
    fake.setRole(null)
    await expect(
      caller().services.list({ organizationId: ORG }),
    ).rejects.toThrow('You do not have access to this organization')
    expect(fake.calls.some(([k]) => k === 'services.select')).toBe(false)
  })

  it('scopes to the verified org and includes archived rows', async () => {
    await caller().services.list({ organizationId: ORG })
    expect(fake.calls).toContainEqual(['services.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual([
      'services.order',
      'name',
      { ascending: true },
    ])
    expect(fake.calls.some(([k]) => k === 'services.is')).toBe(false)
  })

  it('surfaces database errors', async () => {
    fake.result = { data: null, error: { message: 'boom' } }
    await expect(
      caller().services.list({ organizationId: ORG }),
    ).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database error',
      cause: { message: 'boom' },
    })
  })
})

describe('services mutations: access', () => {
  it.each(['dispatcher', 'worker'])('rejects %s', async (role) => {
    fake.setRole(role)
    await expect(caller().services.create(input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(
      caller().services.setArchived({
        organizationId: ORG,
        id: SVC,
        archived: true,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(fake.calls.some(([k]) => k === 'services.insert')).toBe(false)
  })

  it.each(['owner', 'admin'])('allows %s', async (role) => {
    fake.setRole(role)
    fake.result = { data: { id: SVC }, error: null }
    await expect(caller().services.create(input)).resolves.toEqual({
      id: SVC,
    })
  })
})

describe('services.create', () => {
  it('writes the season months and pins the verified org', async () => {
    fake.result = { data: { id: SVC }, error: null }
    await caller().services.create(input)
    const insert = fake.calls.find(([k]) => k === 'services.insert')
    expect(insert?.[1]).toMatchObject({
      organization_id: ORG,
      season_start_month: 11,
      season_end_month: 3,
    })
    expect(insert?.[1]).not.toHaveProperty('organizationId')
  })

  it('accepts a year-round service', async () => {
    fake.result = { data: { id: SVC }, error: null }
    await expect(
      caller().services.create({
        ...input,
        season_start_month: null,
        season_end_month: null,
      }),
    ).resolves.toBeDefined()
  })

  it.each([
    { season_start_month: 4, season_end_month: null },
    { season_start_month: null, season_end_month: 4 },
    { season_start_month: 0, season_end_month: 4 },
    { season_start_month: 4, season_end_month: 13 },
  ])('rejects an invalid season %j', async (season) => {
    await expect(
      caller().services.create({ ...input, ...season }),
    ).rejects.toThrow()
    expect(fake.calls.some(([k]) => k === 'services.insert')).toBe(false)
  })

  it('rejects empty frequencies and a bad color', async () => {
    await expect(
      caller().services.create({ ...input, frequencies: [] }),
    ).rejects.toThrow()
    await expect(
      caller().services.create({ ...input, color: 'green' }),
    ).rejects.toThrow()
  })

  it('maps a duplicate name to CONFLICT', async () => {
    fake.result = { data: null, error: { message: 'dup', code: '23505' } }
    await expect(caller().services.create(input)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})

describe('services.update and setArchived', () => {
  it('filters by org and id', async () => {
    await caller().services.update({
      organizationId: ORG,
      id: SVC,
      season_start_month: 4,
      season_end_month: 10,
    })
    expect(fake.calls).toContainEqual(['services.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['services.eq', 'id', SVC])
  })

  it('rejects an empty patch and a half-set season', async () => {
    await expect(
      caller().services.update({ organizationId: ORG, id: SVC }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      caller().services.update({
        organizationId: ORG,
        id: SVC,
        season_start_month: 4,
      }),
    ).rejects.toThrow()
  })

  it('returns NOT_FOUND when RLS or the org filter matches nothing', async () => {
    fake.result = { data: [], error: null }
    await expect(
      caller().services.update({ organizationId: ORG, id: SVC, name: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      caller().services.setArchived({
        organizationId: ORG,
        id: SVC,
        archived: false,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('archives with a timestamp and restores with null', async () => {
    await caller().services.setArchived({
      organizationId: ORG,
      id: SVC,
      archived: true,
    })
    await caller().services.setArchived({
      organizationId: ORG,
      id: SVC,
      archived: false,
    })
    const updates = fake.calls.filter(([k]) => k === 'services.update')
    expect(typeof (updates[0][1] as { archived_at: unknown }).archived_at).toBe(
      'string',
    )
    expect(updates[1][1]).toEqual({ archived_at: null })
  })
})

describe('service pricing units', () => {
  it('creates monthly pricing without changing the service frequency or price', async () => {
    fake.result = { data: { id: SVC, unit: 'monthly' }, error: null }
    await expect(
      caller().services.create({ ...input, unit: 'monthly' }),
    ).resolves.toEqual({ id: SVC, unit: 'monthly' })
    expect(
      fake.calls.find(([k]) => k === 'services.insert')?.[1],
    ).toMatchObject({
      organization_id: ORG,
      unit: 'monthly',
      default_price_cents: input.default_price_cents,
      frequencies: input.frequencies,
    })
  })

  it('updates only the pricing unit to monthly in the verified organization', async () => {
    fake.result = { data: [{ id: SVC, unit: 'monthly' }], error: null }
    await expect(
      caller().services.update({
        organizationId: ORG,
        id: SVC,
        unit: 'monthly',
      }),
    ).resolves.toEqual({ id: SVC, unit: 'monthly' })
    expect(fake.calls.find(([k]) => k === 'services.update')?.[1]).toEqual({
      unit: 'monthly',
    })
    expect(fake.calls).toContainEqual(['services.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['services.eq', 'id', SVC])
  })

  it.each(['each', 'job'])(
    'rejects removed unit %s before create or update writes',
    async (unit) => {
      await expect(
        caller().services.create({ ...input, unit } as never),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(
        caller().services.update({
          organizationId: ORG,
          id: SVC,
          unit,
        } as never),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(
        fake.calls.some(
          ([k]) => k === 'services.insert' || k === 'services.update',
        ),
      ).toBe(false)
    },
  )
})

describe('service precipitation preferences', () => {
  const preference = {
    precipitation_type: 'snow' as const,
    precipitation_action: 'schedule' as const,
  }

  it('selects both fields on list and mutation responses', async () => {
    await caller().services.list({ organizationId: ORG })
    await caller().services.create({ ...input, ...preference })
    await caller().services.update({
      organizationId: ORG,
      id: SVC,
      ...preference,
    })
    await caller().services.setArchived({
      organizationId: ORG,
      id: SVC,
      archived: false,
    })
    const selects = fake.calls.filter(([key]) => key === 'services.select')
    expect(selects).toHaveLength(4)
    for (const [, columns] of selects) {
      expect(columns).toContain('precipitation_type')
      expect(columns).toContain('precipitation_action')
    }
  })

  it('defaults omitted create preferences to none and preserves omitted update preferences', async () => {
    await caller().services.create(input)
    expect(
      fake.calls.find(([k]) => k === 'services.insert')?.[1],
    ).toMatchObject({
      precipitation_type: 'none',
      precipitation_action: 'none',
    })
    await caller().services.update({
      organizationId: ORG,
      id: SVC,
      name: 'Updated',
    })
    expect(fake.calls.find(([k]) => k === 'services.update')?.[1]).toEqual({
      name: 'Updated',
    })
  })

  it.each([
    ['none', 'none'],
    ['rain', 'schedule'],
    ['rain', 'reschedule'],
    ['snow', 'schedule'],
    ['snow', 'reschedule'],
    ['any', 'schedule'],
    ['any', 'reschedule'],
  ] as const)(
    'writes %s/%s atomically on create and update',
    async (precipitation_type, precipitation_action) => {
      const pair = { precipitation_type, precipitation_action }
      await caller().services.create({ ...input, ...pair })
      await caller().services.update({ organizationId: ORG, id: SVC, ...pair })
      expect(
        fake.calls.find(([k]) => k === 'services.insert')?.[1],
      ).toMatchObject(pair)
      expect(fake.calls.find(([k]) => k === 'services.update')?.[1]).toEqual(
        pair,
      )
    },
  )

  it.each([
    { precipitation_type: 'rain' },
    { precipitation_action: 'schedule' },
    { precipitation_type: 'none' },
    { precipitation_action: 'none' },
    { precipitation_type: 'none', precipitation_action: 'schedule' },
    { precipitation_type: 'snow', precipitation_action: 'none' },
    { precipitation_type: 'hail', precipitation_action: 'reschedule' },
    { precipitation_type: 'rain', precipitation_action: 're_schedule' },
    { precipitation_type: null, precipitation_action: null },
  ])('rejects invalid input before writes: %j', async (pair) => {
    // Exercise runtime input validation with values an untyped caller can send.
    await expect(
      caller().services.create({ ...input, ...pair } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      caller().services.update({
        organizationId: ORG,
        id: SVC,
        ...pair,
      } as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(
      fake.calls.some(
        ([k]) => k === 'services.insert' || k === 'services.update',
      ),
    ).toBe(false)
  })

  it.each(['owner', 'admin'])(
    'allows %s to create and update preferences',
    async (role) => {
      fake.setRole(role)
      await caller().services.create({ ...input, ...preference })
      await caller().services.update({
        organizationId: ORG,
        id: SVC,
        ...preference,
      })
      expect(fake.calls.some(([k]) => k === 'services.insert')).toBe(true)
      expect(fake.calls.some(([k]) => k === 'services.update')).toBe(true)
    },
  )

  it.each(['dispatcher', 'worker', 'portal', null])(
    'denies %s both preference mutations',
    async (role) => {
      fake.setRole(role)
      await expect(
        caller().services.create({ ...input, ...preference }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      await expect(
        caller().services.update({
          organizationId: ORG,
          id: SVC,
          ...preference,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(
        fake.calls.some(
          ([k]) => k === 'services.insert' || k === 'services.update',
        ),
      ).toBe(false)
    },
  )

  it('uses only the verified active organization for a multi-org user', async () => {
    const other = '0198f0a0-0000-7000-8000-000000000003'
    for (const org of [ORG, other]) {
      fake.calls = []
      fake.setRole('admin', org)
      await caller().services.list({ organizationId: org })
      await caller().services.create({
        ...input,
        organizationId: org,
        ...preference,
      })
      await caller().services.update({
        organizationId: org,
        id: SVC,
        ...preference,
      })
      expect(
        fake.calls.filter(
          ([k, column]) => k === 'services.eq' && column === 'organization_id',
        ),
      ).toEqual([
        ['services.eq', 'organization_id', org],
        ['services.eq', 'organization_id', org],
      ])
      expect(
        fake.calls.find(([k]) => k === 'services.insert')?.[1],
      ).toMatchObject({ organization_id: org })
      expect(fake.calls).toContainEqual([
        'organization_members.eq',
        'organization_id',
        org,
      ])
    }
  })

  it('rejects a service belonging to another organization', async () => {
    fake.result = { data: [], error: null }
    await expect(
      caller().services.update({ organizationId: ORG, id: SVC, ...preference }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(fake.calls).toContainEqual(['services.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['services.eq', 'id', SVC])
  })
})
