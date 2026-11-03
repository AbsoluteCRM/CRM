import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ORG, fake } from './test/fake-supabase'

vi.mock('#/lib/supabase/server', () => import('./test/fake-supabase'))

const { createTRPCContext } = await import('./init')
const { trpcRouter } = await import('./router')

const OTHER = '0198f0a0-0000-7000-8000-000000000009'
const DATE = '2026-11-03'
const caller = () => trpcRouter.createCaller(createTRPCContext())

const visit = (id: string, minutes: number, extra = {}) => ({
  id,
  duration_minutes: minutes,
  window_start: null,
  window_end: null,
  jobs: {
    id: `job-${id}`,
    number: 'J-1',
    title: 'Mow',
    clients: { id: 'c1', display_name: 'Jane' },
  },
  properties: {
    id: `p-${id}`,
    address_line1: '1 Main St',
    city: 'Calgary',
    latitude: 51.04,
    longitude: -114.07,
  },
  ...extra,
})

beforeEach(() => {
  fake.reset()
  fake.setRole('dispatcher')
})

describe.each(['list', 'availableVisits'] as const)(
  'routes.%s access',
  (name) => {
    it('rejects unauthenticated callers', async () => {
      fake.user = null
      await expect(
        caller().routes[name]({ organizationId: ORG, date: DATE }),
      ).rejects.toThrow('UNAUTHORIZED')
      expect(fake.calls).toEqual([])
    })

    it('rejects non-members before querying', async () => {
      fake.setRole(null)
      await expect(
        caller().routes[name]({ organizationId: ORG, date: DATE }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(fake.called('routes.select')).toBe(false)
      expect(fake.called('visits.select')).toBe(false)
    })

    it('rejects workers', async () => {
      fake.setRole('worker')
      await expect(
        caller().routes[name]({ organizationId: ORG, date: DATE }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(fake.called('routes.select')).toBe(false)
      expect(fake.called('visits.select')).toBe(false)
    })

    it.each(['owner', 'admin', 'dispatcher'])('allows %s', async (role) => {
      fake.setRole(role)
      await expect(
        caller().routes[name]({ organizationId: ORG, date: DATE }),
      ).resolves.toEqual([])
    })

    it('rejects a malformed date or organization id', async () => {
      await expect(
        caller().routes[name]({ organizationId: ORG, date: '11/03/2026' }),
      ).rejects.toThrow()
      await expect(
        caller().routes[name]({ organizationId: 'nope', date: DATE }),
      ).rejects.toThrow()
    })

    it('surfaces database errors without the raw message', async () => {
      fake.result = { data: null, error: { message: 'boom' } }
      await expect(
        caller().routes[name]({ organizationId: ORG, date: DATE }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database error',
      })
    })
  },
)

describe('routes.list', () => {
  it('filters by the verified org and the date, oldest route first', async () => {
    await caller().routes.list({ organizationId: ORG, date: DATE })
    expect(fake.calls).toContainEqual(['routes.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['routes.eq', 'route_date', DATE])
    expect(fake.calls).toContainEqual([
      'routes.order',
      'created_at',
      { ascending: true },
    ])
  })

  it('uses only the verified org for a multi-org user', async () => {
    fake.memberships = { [ORG]: 'worker', [OTHER]: 'dispatcher' }
    await caller().routes.list({ organizationId: OTHER, date: DATE })
    expect(fake.callsTo('routes.eq')).toContainEqual([
      'routes.eq',
      'organization_id',
      OTHER,
    ])
    expect(fake.callsTo('routes.eq')).not.toContainEqual([
      'routes.eq',
      'organization_id',
      ORG,
    ])
    // A worker in the first org is still refused there.
    await expect(
      caller().routes.list({ organizationId: ORG, date: DATE }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('does not select the PostGIS location columns', async () => {
    await caller().routes.list({ organizationId: ORG, date: DATE })
    const [select] = fake.callsTo('routes.select')
    const columns = String(select[1])
    expect(columns).not.toMatch(/\blocation\b|start_location|end_location/)
    expect(columns).toContain('latitude, longitude')
  })

  it('orders stops, flattens visits and totals the route', async () => {
    fake.result = {
      data: [
        {
          id: 'r1',
          route_date: DATE,
          status: 'draft',
          crew_id: 'crew1',
          planned_start: null,
          crews: {
            id: 'crew1',
            name: 'North',
            color: '#2f7350',
            vehicle: null,
          },
          route_stops: [
            {
              id: 's2',
              sequence: 2,
              is_locked: false,
              visit_id: 'v2',
              visits: visit('v2', 30),
            },
            {
              id: 's1',
              sequence: 1,
              is_locked: true,
              visit_id: 'v1',
              visits: visit('v1', 45),
            },
          ],
        },
        {
          id: 'r2',
          route_date: DATE,
          status: 'published',
          crew_id: 'crew2',
          planned_start: null,
          crews: null,
          route_stops: [],
        },
      ],
      error: null,
    }
    const routes = await caller().routes.list({
      organizationId: ORG,
      date: DATE,
    })
    expect(routes).toHaveLength(2)
    expect(routes[0].stops.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(routes[0].stops[0]).toMatchObject({
      sequence: 1,
      isLocked: true,
      visitId: 'v1',
      clientName: 'Jane',
      jobNumber: 'J-1',
      address: '1 Main St',
      latitude: 51.04,
    })
    expect(routes[0].totals).toEqual({ stops: 2, onSiteMinutes: 75 })
    expect(routes[0].crew).toEqual({
      id: 'crew1',
      name: 'North',
      color: '#2f7350',
      vehicle: null,
    })
    expect(routes[0].editable).toBe(true)
    expect(routes[1]).toMatchObject({
      editable: false,
      crew: null,
      totals: { stops: 0, onSiteMinutes: 0 },
    })
  })

  it('skips a stop whose visit RLS hides, and tolerates missing joins', async () => {
    fake.result = {
      data: [
        {
          id: 'r1',
          route_date: DATE,
          status: 'optimized',
          crew_id: 'crew1',
          planned_start: null,
          crews: null,
          route_stops: [
            {
              id: 's1',
              sequence: 1,
              is_locked: false,
              visit_id: 'v1',
              visits: null,
            },
            {
              id: 's2',
              sequence: 2,
              is_locked: false,
              visit_id: 'v2',
              visits: visit('v2', 20, { jobs: null, properties: null }),
            },
          ],
        },
      ],
      error: null,
    }
    const [route] = await caller().routes.list({
      organizationId: ORG,
      date: DATE,
    })
    expect(route.stops).toHaveLength(1)
    expect(route.stops[0]).toMatchObject({
      clientName: null,
      address: null,
      latitude: null,
    })
    expect(route.editable).toBe(true)
  })
})

describe('routes.availableVisits', () => {
  it('asks for scheduled, unrouted visits of the org on the date', async () => {
    await caller().routes.availableVisits({ organizationId: ORG, date: DATE })
    expect(fake.calls).toContainEqual(['visits.eq', 'organization_id', ORG])
    expect(fake.calls).toContainEqual(['visits.eq', 'scheduled_date', DATE])
    expect(fake.calls).toContainEqual(['visits.eq', 'status', 'scheduled'])
    expect(fake.calls).toContainEqual(['visits.is', 'route_stops', null])
  })

  it('uses only the verified org for a multi-org user', async () => {
    fake.memberships = { [ORG]: 'admin', [OTHER]: 'dispatcher' }
    await caller().routes.availableVisits({ organizationId: OTHER, date: DATE })
    expect(fake.callsTo('visits.eq')).toContainEqual([
      'visits.eq',
      'organization_id',
      OTHER,
    ])
    expect(fake.callsTo('visits.eq')).not.toContainEqual([
      'visits.eq',
      'organization_id',
      ORG,
    ])
  })

  it('does not select the PostGIS location column', async () => {
    await caller().routes.availableVisits({ organizationId: ORG, date: DATE })
    const [select] = fake.callsTo('visits.select')
    expect(String(select[1])).not.toMatch(/\blocation\b/)
  })

  it('returns flat display summaries', async () => {
    fake.result = {
      data: [{ ...visit('v1', 60), route_stops: [] }],
      error: null,
    }
    await expect(
      caller().routes.availableVisits({ organizationId: ORG, date: DATE }),
    ).resolves.toEqual([
      {
        visitId: 'v1',
        durationMinutes: 60,
        windowStart: null,
        windowEnd: null,
        jobId: 'job-v1',
        clientId: 'c1',
        jobNumber: 'J-1',
        jobTitle: 'Mow',
        clientName: 'Jane',
        propertyId: 'p-v1',
        address: '1 Main St',
        city: 'Calgary',
        latitude: 51.04,
        longitude: -114.07,
        preferredCrewName: null,
        areaId: null,
        areaName: null,
        areaColor: null,
        areaCrewName: null,
      },
    ])
  })

  it('returns the preferred crew and the service area with its crew', async () => {
    const base = visit('v1', 60)
    fake.result = {
      data: [
        {
          ...base,
          jobs: { ...base.jobs, preferred_crew: { id: 'c1', name: 'North' } },
          properties: {
            ...base.properties,
            service_areas: {
              id: 'a1',
              name: 'Northwest',
              color: '#2f7350',
              crews: { id: 'c2', name: 'West' },
            },
          },
          route_stops: [],
        },
      ],
      error: null,
    }
    const [row] = await caller().routes.availableVisits({
      organizationId: ORG,
      date: DATE,
    })
    expect(row).toMatchObject({
      preferredCrewName: 'North',
      areaId: 'a1',
      areaName: 'Northwest',
      areaColor: '#2f7350',
      areaCrewName: 'West',
    })
  })

  it('selects the area and its crew without any PostGIS column', async () => {
    await caller().routes.availableVisits({ organizationId: ORG, date: DATE })
    const [select] = fake.callsTo('visits.select')
    expect(String(select[1])).toContain('service_areas(')
    expect(String(select[1])).toContain('preferred_crew:crews(')
  })

  it('returns an empty list when RLS hides the rows', async () => {
    await expect(
      caller().routes.availableVisits({ organizationId: ORG, date: DATE }),
    ).resolves.toEqual([])
  })
})
