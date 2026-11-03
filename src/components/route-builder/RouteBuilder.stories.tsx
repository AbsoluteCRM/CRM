import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TRPCClientError, createTRPCClient } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { RouteBuilder } from '#/components/route-builder/RouteBuilder'
import type {
  CrewOption,
  RouteBuilderProps,
} from '#/components/route-builder/RouteBuilder'
import { RouteBoard } from '#/components/route-builder/RouteBuilderLive'
import {
  applyAdd,
  applyMove,
  applyRemove,
  applyReorder,
} from '#/integrations/routes/routes'
import type {
  AvailableVisit,
  Board,
  DayRoute,
  DraftResult,
  RouteStop,
} from '#/integrations/routes/routes'
import { TRPCProvider } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'

const DATE = '2026-10-29'
const ORG = '0198f0a0-0000-7000-8000-000000000001'
const SCOPE = {
  organizationId: ORG,
  enabled: true,
  input: { organizationId: ORG },
}

const CREWS: Array<CrewOption> = [
  {
    id: 'crew-north',
    name: 'North crew',
    color: '#2f7350',
    vehicle: 'Truck 01',
  },
  {
    id: 'crew-south',
    name: 'South crew',
    color: '#a35b3d',
    vehicle: 'Truck 02',
  },
  { id: 'crew-west', name: 'West crew', color: '#5b9bc4', vehicle: null },
]

const visit = (
  n: number,
  client: string,
  address: string,
  title: string,
  minutes: number,
  at: [number, number] | null,
): AvailableVisit => ({
  visitId: `visit-${n}`,
  durationMinutes: minutes,
  windowStart: null,
  windowEnd: null,
  jobId: `job-${n}`,
  clientId: `client-${n}`,
  jobNumber: `J-10${n}`,
  jobTitle: title,
  clientName: client,
  propertyId: `property-${n}`,
  address,
  city: 'Calgary',
  latitude: at?.[0] ?? null,
  longitude: at?.[1] ?? null,
  preferredCrewName: null,
  areaId: null,
  areaName: null,
  areaColor: null,
  areaCrewName: null,
})

const inArea = (
  v: AvailableVisit,
  areaName: string,
  areaCrewName: string | null,
): AvailableVisit => ({
  ...v,
  areaId: `area-${areaName}`,
  areaName,
  areaColor: '#2f7350',
  areaCrewName,
})

const V = {
  eleanor: visit(
    1,
    'Eleanor Mitchell',
    '1248 Briarwood Drive',
    'Fall yard cleanup',
    75,
    [51.08, -114.13],
  ),
  priya: visit(
    2,
    'Priya Shah',
    '77 Lakeview Crescent',
    'Weekly mowing',
    45,
    [51.06, -114.02],
  ),
  marcus: visit(
    3,
    'Marcus Lee',
    '910 Ridge Road',
    'Hedge trimming',
    60,
    [50.98, -114.07],
  ),
  hannah: visit(
    4,
    'Hannah Brooks',
    '22 Aspen Way',
    'Aeration',
    90,
    [51.02, -114.2],
  ),
  oliver: inArea(
    visit(
      5,
      'Oliver Bennett',
      '5 Coulee Court',
      'Weekly mowing',
      40,
      [51.1, -114.05],
    ),
    'Northwest',
    'North crew',
  ),
  grace: visit(6, 'Grace Kim', '300 Prairie Lane', 'Snow-ready prep', 30, null),
  noah: visit(
    7,
    'Noah Wilson',
    '18 Foothills Blvd',
    'Leaf removal',
    50,
    [51.04, -114.0],
  ),
}

const stop = (id: string, sequence: number, v: AvailableVisit): RouteStop => ({
  id,
  sequence,
  isLocked: false,
  plannedArrival: null,
  plannedDeparture: null,
  travelDistanceM: null,
  travelDurationS: null,
  ...v,
})

const route = (
  id: string,
  crew: CrewOption,
  stops: Array<RouteStop>,
  status: DayRoute['status'] = 'draft',
): DayRoute => ({
  id,
  date: DATE,
  status,
  editable: status === 'draft' || status === 'optimized',
  plannedStart: null,
  plannedEnd: null,
  crew,
  stops,
  totals: {
    stops: stops.length,
    onSiteMinutes: stops.reduce((n, s) => n + s.durationMinutes, 0),
  },
  road: null,
})

const seedRoutes = (): Array<DayRoute> => [
  route('route-north', CREWS[0], [
    stop('stop-1', 1, V.eleanor),
    stop('stop-2', 2, V.priya),
  ]),
  route('route-south', CREWS[1], [stop('stop-3', 1, V.marcus)]),
]
const seedPool = (): Array<AvailableVisit> => [V.oliver, V.grace, V.noah]

const noop = () => undefined

const DRAFTED: DraftResult = {
  assigned: 4,
  routesCreated: 2,
  remaining: 0,
  unassigned: [],
}
const actionSpies = () => ({
  createRoute: fn(() => Promise.resolve('route-new')),
  assignCrew: fn((routeId: string) => Promise.resolve(routeId)),
  deleteRoute: fn(() => Promise.resolve()),
  generateDrafts: fn(() => Promise.resolve(DRAFTED)),
  addStop: fn(),
  moveStop: fn(),
  removeStop: fn(),
  reorderStops: fn(),
})

const baseArgs = (): RouteBuilderProps => ({
  date: DATE,
  onDateChange: fn(noop),
  routes: seedRoutes(),
  available: seedPool(),
  crews: CREWS,
  status: 'ready',
  actions: actionSpies(),
})

const meta = {
  title: 'Operations/RouteBuilder',
  component: RouteBuilder,
  args: baseArgs(),
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-(--cream) p-4 text-(--ink)">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RouteBuilder>
export default meta
type Story = StoryObj<typeof meta>

const region = (element: HTMLElement, name: string) =>
  within(within(element).getByRole('region', { name }))

// Real DragEvents so React reads the same DataTransfer in dragover and drop.
function drop(
  element: HTMLElement,
  targetName: string,
  item: { kind: 'visit' | 'stop'; id: string },
) {
  const transfer = new DataTransfer()
  transfer.setData('application/x-crm-route-item', JSON.stringify(item))
  const target = within(element).getByRole('region', { name: targetName })
  target.dispatchEvent(
    new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }),
  )
  flushSync(() => {
    target.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  })
}

export const Loading: Story = {
  args: { status: 'loading', routes: [], available: [] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(
      c.getByRole('status', { name: 'Loading routes' }),
    ).toBeVisible()
    await expect(
      c.queryByRole('region', { name: 'Existing routes' }),
    ).toBeNull()
    await expect(c.getByRole('button', { name: 'Create route' })).toBeDisabled()
  },
}

export const LoadError: Story = {
  args: {
    status: 'error',
    errorMessage: 'You do not have access to this organization',
    onRetry: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('alert')).toHaveTextContent('Routes didn’t load')
    await expect(c.getByRole('alert')).toHaveTextContent('do not have access')
    await userEvent.click(c.getByRole('button', { name: 'Try again' }))
    await expect(args.onRetry).toHaveBeenCalledOnce()
  },
}

export const NoRoutesYet: Story = {
  args: { routes: [], available: [V.oliver] },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByText('A fresh start')).toBeVisible()
    await expect(
      c.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    ).toBeDisabled()
    await expect(
      c.getByText('Create or select a route to add jobs.'),
    ).toBeVisible()
  },
}

export const NoCrewsFree: Story = {
  args: { routes: seedRoutes(), crews: CREWS.slice(0, 2) },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(c.getByRole('button', { name: 'Create route' })).toBeDisabled()
    await expect(
      c.getByText('Every crew already has a route on this date.'),
    ).toBeVisible()
  },
}

export const NoCrewsAtAll: Story = {
  args: { routes: [], crews: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no crews yet/i)).toBeVisible()
  },
}

export const AllRouted: Story = {
  args: { available: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Everything is routed'),
    ).toBeVisible()
  },
}

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const north = region(canvasElement, 'North crew')
    await expect(
      north.getByLabelText('North crew: 2 stops, 2h on site'),
    ).toBeInTheDocument()
    await expect(
      north.getByRole('list', { name: 'Ordered stops for North crew' }),
    ).toBeInTheDocument()
    await expect(
      north.getByRole('combobox', { name: 'Crew for North crew' }),
    ).toHaveValue('crew-north')
    // Occupied crews are disabled in the other route's dropdown.
    await expect(
      within(
        north.getByRole('combobox', { name: 'Crew for North crew' }),
      ).getByRole('option', { name: /South crew/ }),
    ).toBeDisabled()
    await expect(c.getByText('Adding to North crew')).toBeVisible()
  },
}

export const SearchPool: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.type(
      c.getByPlaceholderText('Search jobs, customers, addresses'),
      'prairie',
    )
    await expect(
      c.getByRole('article', { name: 'Visit Grace Kim' }),
    ).toBeVisible()
    await expect(
      c.queryByRole('article', { name: 'Visit Noah Wilson' }),
    ).toBeNull()
    await userEvent.clear(
      c.getByPlaceholderText('Search jobs, customers, addresses'),
    )
    await userEvent.type(
      c.getByPlaceholderText('Search jobs, customers, addresses'),
      'zzz',
    )
    await expect(c.getByText('No matching visits')).toBeVisible()
  },
}

export const ButtonsCallActions: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Select South crew' }))
    await userEvent.click(
      c.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    )
    await expect(args.actions.addStop).toHaveBeenCalledWith(
      'route-south',
      'visit-5',
    )

    const north = region(canvasElement, 'North crew')
    await userEvent.click(
      north.getByRole('button', { name: 'Move Eleanor Mitchell down' }),
    )
    await expect(args.actions.reorderStops).toHaveBeenCalledWith(
      'route-north',
      ['stop-2', 'stop-1'],
    )
    await expect(
      north.getByRole('button', { name: 'Move Eleanor Mitchell up' }),
    ).toBeDisabled()

    await userEvent.selectOptions(
      north.getByRole('combobox', { name: 'Move Eleanor Mitchell to route' }),
      'route-south',
    )
    await userEvent.click(
      north.getByRole('button', {
        name: 'Move Eleanor Mitchell to selected route',
      }),
    )
    await expect(args.actions.moveStop).toHaveBeenCalledWith(
      'stop-1',
      'route-south',
      2,
    )

    await userEvent.click(
      north.getByRole('button', { name: 'Remove Priya Shah from route' }),
    )
    await expect(args.actions.removeStop).toHaveBeenCalledWith('stop-2')
    await expect(c.getByRole('status')).toHaveTextContent(
      'Priya Shah returned to Available jobs.',
    )
  },
}

export const DragCallsActions: Story = {
  play: async ({ canvasElement, args }) => {
    drop(canvasElement, 'South crew', { kind: 'visit', id: 'visit-7' })
    await expect(args.actions.addStop).toHaveBeenCalledWith(
      'route-south',
      'visit-7',
    )
    drop(canvasElement, 'South crew', { kind: 'stop', id: 'stop-1' })
    await expect(args.actions.moveStop).toHaveBeenCalledWith(
      'stop-1',
      'route-south',
      2,
    )
    drop(canvasElement, 'Available jobs', { kind: 'stop', id: 'stop-3' })
    await expect(args.actions.removeStop).toHaveBeenCalledWith('stop-3')
  },
}

export const IgnoresUnknownAndSameRouteDrops: Story = {
  play: async ({ canvasElement, args }) => {
    drop(canvasElement, 'South crew', { kind: 'visit', id: 'visit-gone' })
    drop(canvasElement, 'South crew', { kind: 'stop', id: 'stop-gone' })
    drop(canvasElement, 'North crew', { kind: 'stop', id: 'stop-1' })
    drop(canvasElement, 'Available jobs', { kind: 'visit', id: 'visit-5' })
    await expect(args.actions.addStop).not.toHaveBeenCalled()
    await expect(args.actions.moveStop).not.toHaveBeenCalled()
    await expect(args.actions.removeStop).not.toHaveBeenCalled()
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'That stop is no longer on a route.',
    )
  },
}

export const LockedRoute: Story = {
  args: {
    routes: [
      ...seedRoutes(),
      route('route-west', CREWS[2], [stop('stop-9', 1, V.hannah)], 'published'),
    ],
  },
  play: async ({ canvasElement, args }) => {
    const west = region(canvasElement, 'West crew')
    await expect(west.getByText('Published')).toBeVisible()
    await expect(west.getByText('Route is locked')).toBeVisible()
    await expect(
      west.getByRole('combobox', { name: 'Crew for West crew' }),
    ).toBeDisabled()
    await expect(
      west.getByRole('button', { name: 'Remove Hannah Brooks from route' }),
    ).toBeDisabled()
    await expect(
      west.getByRole('article', { name: 'Visit Hannah Brooks' }),
    ).toHaveAttribute('draggable', 'false')
    // It takes no drops, and is not offered as a move target.
    drop(canvasElement, 'West crew', { kind: 'visit', id: 'visit-5' })
    await expect(args.actions.addStop).not.toHaveBeenCalled()
    const north = region(canvasElement, 'North crew')
    await expect(
      within(
        north.getByRole('combobox', { name: 'Move Eleanor Mitchell to route' }),
      ).queryByRole('option', { name: 'West crew' }),
    ).toBeNull()
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Select West crew' }),
    )
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Add Oliver Bennett to route',
      }),
    ).toBeDisabled()
    await expect(
      within(canvasElement).getByText(/West crew is locked/),
    ).toBeVisible()
  },
}

export const CreateRouteCallsAction: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    // North and South are taken; West is the only free crew and is preselected.
    const select = c.getByRole('combobox', { name: 'Crew for new route' })
    await expect(select).toHaveValue('crew-west')
    await userEvent.click(c.getByRole('button', { name: 'Create route' }))
    await expect(args.actions.createRoute).toHaveBeenCalledWith('crew-west')
    await waitFor(() =>
      expect(c.getByRole('status')).toHaveTextContent(
        'West crew route created',
      ),
    )
  },
}

export const DeleteEmptyDraftOnly: Story = {
  args: {
    routes: [
      route('route-north', CREWS[0], []),
      route('route-south', CREWS[1], [stop('stop-3', 1, V.marcus)]),
    ],
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(
      c.queryByRole('button', { name: 'Delete South crew route' }),
    ).toBeNull()
    await userEvent.click(
      c.getByRole('button', { name: 'Delete North crew route' }),
    )
    await expect(args.actions.deleteRoute).toHaveBeenCalledWith('route-north')
  },
}

export const ChangeCrew: Story = {
  play: async ({ canvasElement, args }) => {
    const north = region(canvasElement, 'North crew')
    await userEvent.selectOptions(
      north.getByRole('combobox', { name: 'Crew for North crew' }),
      'crew-west',
    )
    await expect(args.actions.assignCrew).toHaveBeenCalledWith(
      'route-north',
      'crew-west',
    )
  },
}

// --- Against an in-memory server -----------------------------------------
// The real hooks run (queries, optimistic edits, rollback, refetch) against a
// tRPC link that answers from memory. No network.

type Server = {
  board: Board
  failing: Set<string>
  calls: Array<[string, unknown]>
}

function newServer(failing: Array<string> = []): Server {
  return {
    board: { routes: seedRoutes(), available: seedPool() },
    failing: new Set(failing),
    calls: [],
  }
}

const crewRow = (c: CrewOption) => ({
  id: c.id,
  organization_id: ORG,
  name: c.name,
  color: c.color,
  vehicle: c.vehicle,
  default_start_time: '08:00:00',
  max_work_minutes: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  crew_members: [],
})

// Gives optimistic stops real ids, as the database would.
const settle = (board: Board): Board => ({
  available: board.available,
  routes: board.routes.map((r) => ({
    ...r,
    stops: r.stops.map((s) =>
      s.id.startsWith('pending:') ? { ...s, id: `stop-${s.visitId}` } : s,
    ),
  })),
})

function handle(server: Server, path: string, input: Record<string, string>) {
  server.calls.push([path, input])
  if (server.failing.has(path)) throw new Error('The database said no')
  const b = server.board
  switch (path) {
    case 'crews.list':
      return CREWS.map(crewRow)
    case 'routes.list':
      return b.routes.filter((r) => r.date === input.date)
    case 'routes.availableVisits':
      return input.date === DATE ? b.available : []
    case 'routes.addStop':
      server.board = settle(
        applyAdd(b, input.visitId, input.routeId, input.position as never),
      )
      return { id: `stop-${input.visitId}` }
    case 'routes.moveStop':
      server.board = applyMove(
        b,
        input.stopId,
        input.toRouteId,
        Number(input.position),
      )
      return undefined
    case 'routes.removeStop':
      server.board = applyRemove(b, input.stopId)
      return undefined
    case 'routes.reorderStops':
      server.board = applyReorder(b, input.routeId, input.stopIds as never)
      return undefined
    case 'routes.generateDrafts':
      // Oliver is in an area, so he is routed; Grace has no location.
      server.board = settle(applyAdd(b, 'visit-5', 'route-north'))
      return {
        assigned: 1,
        routesCreated: 0,
        remaining: 0,
        unassigned: [{ visitId: 'visit-6', reason: 'no_location' }],
      }
    case 'routes.create': {
      const crew = CREWS.find((c) => c.id === input.crewId)!
      server.board = {
        ...b,
        routes: [...b.routes, route(`route-${crew.id}`, crew, [])],
      }
      return { id: `route-${crew.id}` }
    }
    case 'routes.assignCrew': {
      const crew = CREWS.find((c) => c.id === input.crewId)!
      server.board = {
        ...b,
        routes: b.routes.map((r) =>
          r.id === input.routeId ? { ...r, id: `route-${crew.id}`, crew } : r,
        ),
      }
      return { id: `route-${crew.id}` }
    }
    case 'routes.delete':
      server.board = {
        ...b,
        routes: b.routes.filter((r) => r.id !== input.routeId),
      }
      return undefined
    default:
      throw new Error(`Unexpected call: ${path}`)
  }
}

function ServerProviders({
  failing,
  onServer,
  children,
}: {
  failing: Array<string>
  onServer: (server: Server) => void
  children: ReactNode
}) {
  const [server] = useState(() => {
    const created = newServer(failing)
    onServer(created)
    return created
  })
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const [client] = useState(() =>
    createTRPCClient<TRPCRouter>({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              // A beat of latency, so optimistic state is observable.
              const timer = setTimeout(() => {
                try {
                  observer.next({
                    result: {
                      type: 'data',
                      data: structuredClone(
                        handle(server, op.path, op.input as never),
                      ),
                    },
                  })
                  observer.complete()
                } catch (e) {
                  observer.error(
                    TRPCClientError.from(
                      e instanceof Error ? e : new Error('failed'),
                    ),
                  )
                }
              }, 30)
              return () => clearTimeout(timer)
            }),
      ],
    }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}

type Canvas = Parameters<NonNullable<Story['play']>>[0]

// Each mount gets a fresh in-memory server; `play` reads it through `server()`.
function liveStory(
  failing: Array<string>,
  play: (ctx: Canvas, server: () => Server) => Promise<void>,
): Story {
  let current: Server | null = null
  const server = () => {
    if (!current) throw new Error('The story has not rendered yet')
    return current
  }
  return {
    render: () => (
      <ServerProviders
        failing={failing}
        onServer={(created) => {
          current = created
        }}
      >
        <RouteBoard scope={SCOPE} initialDate={DATE} />
      </ServerProviders>
    ),
    play: (ctx) => play(ctx, server),
  }
}

const countOf = (server: Server, path: string) =>
  server.calls.filter(([p]) => p === path).length

const loaded = (c: ReturnType<typeof within>) =>
  c.findByRole('region', { name: 'North crew' })

export const LiveLoadsFromTheDatabase = liveStory(
  [],
  async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(
      c.getByRole('status', { name: 'Loading routes' }),
    ).toBeVisible()
    await loaded(c)
    await expect(
      region(canvasElement, 'Available jobs').getByRole('article', {
        name: 'Visit Oliver Bennett',
      }),
    ).toBeVisible()
    await expect(
      region(canvasElement, 'South crew').getByRole('article', {
        name: 'Visit Marcus Lee',
      }),
    ).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Select North crew' }))
    await expect(
      c.getByRole('region', { name: 'Map of North crew' }),
    ).toBeVisible()
  },
)

export const LiveMoveBetweenRoutes = liveStory(
  [],
  async ({ canvasElement }, server) => {
    const c = within(canvasElement)
    await loaded(c)
    drop(canvasElement, 'South crew', { kind: 'stop', id: 'stop-1' })
    // Optimistic: the stop is on South before the server answers.
    await expect(
      await region(canvasElement, 'South crew').findByRole('article', {
        name: 'Visit Eleanor Mitchell',
      }),
    ).toBeVisible()
    await expect(
      region(canvasElement, 'North crew').getByLabelText(
        'North crew: 1 stops, 45 min on site',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(countOf(server(), 'routes.moveStop')).toBe(1))
    await waitFor(() =>
      expect(countOf(server(), 'routes.list')).toBeGreaterThan(1),
    )
    await expect(server().board.routes[1].stops.map((s) => s.id)).toEqual([
      'stop-3',
      'stop-1',
    ])
  },
)

export const LiveAddRemoveAndReorder = liveStory(
  [],
  async ({ canvasElement }, server) => {
    const c = within(canvasElement)
    await loaded(c)
    await userEvent.click(c.getByRole('button', { name: 'Select South crew' }))
    await userEvent.click(
      c.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    )
    await expect(
      region(canvasElement, 'South crew').getByRole('article', {
        name: 'Visit Oliver Bennett',
      }),
    ).toBeVisible()
    await expect(
      within(
        within(canvasElement).getByRole('region', { name: 'Available jobs' }),
      ).queryByRole('article', { name: 'Visit Oliver Bennett' }),
    ).toBeNull()
    await waitFor(() => expect(countOf(server(), 'routes.addStop')).toBe(1))
    await waitFor(() =>
      expect(countOf(server(), 'routes.list')).toBeGreaterThan(1),
    )

    const south = region(canvasElement, 'South crew')
    await userEvent.click(
      south.getByRole('button', { name: 'Move Marcus Lee down' }),
    )
    await waitFor(() =>
      expect(countOf(server(), 'routes.reorderStops')).toBe(1),
    )
    await expect(server().board.routes[1].stops.map((s) => s.visitId)).toEqual([
      'visit-5',
      'visit-3',
    ])

    await userEvent.click(
      south.getByRole('button', { name: 'Remove Oliver Bennett from route' }),
    )
    await waitFor(() => expect(countOf(server(), 'routes.removeStop')).toBe(1))
    await expect(
      region(canvasElement, 'Available jobs').getByRole('article', {
        name: 'Visit Oliver Bennett',
      }),
    ).toBeVisible()
  },
)

export const LiveFailedMoveRollsBack = liveStory(
  ['routes.moveStop'],
  async ({ canvasElement }, server) => {
    const c = within(canvasElement)
    await loaded(c)
    drop(canvasElement, 'South crew', { kind: 'stop', id: 'stop-1' })
    await expect(
      await region(canvasElement, 'South crew').findByRole('article', {
        name: 'Visit Eleanor Mitchell',
      }),
    ).toBeVisible()
    // The server refuses; the board returns to what the server holds.
    await waitFor(() =>
      expect(
        region(canvasElement, 'North crew').getByRole('article', {
          name: 'Visit Eleanor Mitchell',
        }),
      ).toBeVisible(),
    )
    await expect(
      region(canvasElement, 'South crew').queryByRole('article', {
        name: 'Visit Eleanor Mitchell',
      }),
    ).toBeNull()
    await expect(countOf(server(), 'routes.moveStop')).toBe(1)
  },
)

export const LiveCreateAndDeleteRoute = liveStory(
  [],
  async ({ canvasElement }, server) => {
    const c = within(canvasElement)
    await loaded(c)
    await userEvent.click(c.getByRole('button', { name: 'Create route' }))
    const west = await c.findByRole('region', { name: 'West crew' })
    await expect(within(west).getByText('Empty route')).toBeVisible()
    await expect(
      c.getByText('Every crew already has a route on this date.'),
    ).toBeVisible()
    await userEvent.click(
      within(west).getByRole('button', { name: 'Delete West crew route' }),
    )
    await waitFor(() =>
      expect(c.queryByRole('region', { name: 'West crew' })).toBeNull(),
    )
    await expect(server().board.routes.map((r) => r.id)).toEqual([
      'route-north',
      'route-south',
    ])
  },
)

export const LiveChangeCrewKeepsStops = liveStory(
  [],
  async ({ canvasElement }) => {
    const c = within(canvasElement)
    await loaded(c)
    await userEvent.selectOptions(
      region(canvasElement, 'South crew').getByRole('combobox', {
        name: 'Crew for South crew',
      }),
      'crew-west',
    )
    const west = await c.findByRole('region', { name: 'West crew' })
    await expect(
      within(west).getByRole('article', { name: 'Visit Marcus Lee' }),
    ).toBeVisible()
    await expect(c.queryByRole('region', { name: 'South crew' })).toBeNull()
  },
)

export const LiveOtherDateIsEmpty = liveStory([], async ({ canvasElement }) => {
  const c = within(canvasElement)
  await loaded(c)
  const input = c.getByLabelText('Route date')
  fireEvent.change(input, { target: { value: '2026-10-30' } })
  await expect(await c.findByText('A fresh start')).toBeVisible()
  await expect(c.getByText('Everything is routed')).toBeVisible()
})

export const LiveLoadFailureOffersRetry = liveStory(
  ['routes.list'],
  async ({ canvasElement }, server) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('alert')).toHaveTextContent(
      'Routes didn’t load',
    )
    server().failing.clear()
    await userEvent.click(c.getByRole('button', { name: 'Try again' }))
    await loaded(c)
  },
)

// Build routes from service areas ---------------------------------------------

const buildButton = (c: ReturnType<typeof within>) =>
  c.getByRole('button', { name: 'Build routes from service areas' })

const MIXED: DraftResult = {
  assigned: 6,
  routesCreated: 2,
  remaining: 12,
  unassigned: [
    { visitId: 'visit-6', reason: 'no_location' },
    { visitId: 'visit-5', reason: 'no_area' },
    { visitId: 'visit-7', reason: 'area_has_no_crew' },
    { visitId: 'visit-9', reason: 'crew_archived' },
    { visitId: 'visit-8', reason: 'route_locked' },
  ],
}

export const BuildRoutesShowsWhatToFix: Story = {
  args: {
    actions: {
      ...actionSpies(),
      generateDrafts: fn(() => Promise.resolve(MIXED)),
    },
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(buildButton(c))
    await expect(args.actions.generateDrafts).toHaveBeenCalledOnce()
    const result = await c.findByRole('status', { name: 'Build result' })
    const r = within(result)
    await expect(r.getByText('6 visits placed on 2 new routes')).toBeVisible()
    await expect(r.getByText(/12 more visits are waiting/)).toBeVisible()
    await expect(r.getByText('5 visits need attention')).toBeVisible()
    const list = r.getByRole('list', {
      name: 'Visits that could not be placed',
    })
    const rows = within(list).getAllByRole('listitem')
    await expect(rows.map((row) => row.dataset.reason)).toEqual([
      'no_location',
      'no_area',
      'area_has_no_crew',
      'crew_archived',
      'route_locked',
    ])
    // Known visits are named; unknown ones are still listed.
    await expect(rows[0]).toHaveTextContent('Grace Kim')
    await expect(rows[0]).toHaveTextContent('No map location')
    await expect(
      within(rows[0]).getByRole('link', {
        name: 'Open the client to set a location',
      }),
    ).toHaveAttribute('href', '/clients?id=client-6')
    await expect(rows[1]).toHaveTextContent('Outside every service area')
    await expect(
      within(rows[1]).getByRole('link', { name: 'Edit service areas' }),
    ).toHaveAttribute('href', '/settings')
    await expect(rows[2]).toHaveTextContent('Area has no crew')
    await expect(
      within(rows[3]).getByRole('link', { name: 'Open Teams' }),
    ).toHaveAttribute('href', '/teams')
    await expect(rows[4]).toHaveTextContent('already published')
    await expect(within(rows[4]).queryByRole('link')).toBeNull()
    await userEvent.click(r.getByRole('button', { name: 'Dismiss result' }))
    await expect(c.queryByRole('status', { name: 'Build result' })).toBeNull()
  },
}

export const BuildRoutesSummary: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(buildButton(c))
    await expect(
      await c.findByText('4 visits placed on 2 new routes'),
    ).toBeVisible()
    await expect(c.queryByText(/need attention/)).toBeNull()
    await expect(c.getByText('4 visits placed on routes.')).toBeVisible()
  },
}

export const BuildRoutesIntoExistingRoutes: Story = {
  args: {
    actions: {
      ...actionSpies(),
      generateDrafts: fn(() =>
        Promise.resolve({ ...DRAFTED, assigned: 1, routesCreated: 0 }),
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(buildButton(c))
    await expect(
      await c.findByText('1 visit placed on 0 new routes'),
    ).toBeVisible()
    await expect(c.getByText(/routes that already existed/)).toBeVisible()
  },
}

export const BuildRoutesNothingToPlace: Story = {
  args: {
    actions: {
      ...actionSpies(),
      generateDrafts: fn(() =>
        Promise.resolve({
          assigned: 0,
          routesCreated: 0,
          remaining: 0,
          unassigned: [],
        }),
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(buildButton(c))
    await expect(await c.findByText('Nothing to place')).toBeVisible()
    await expect(
      c.getByText('Every scheduled visit on this date is already on a route.'),
    ).toBeVisible()
  },
}

export const BuildRoutesInProgress: Story = {
  args: {
    actions: {
      ...actionSpies(),
      generateDrafts: fn(() => new Promise<DraftResult>(() => undefined)),
    },
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await userEvent.click(buildButton(c))
    const busy = await c.findByRole('button', { name: 'Building routes…' })
    await expect(busy).toBeDisabled()
    await expect(busy).toHaveAttribute('aria-busy', 'true')
    // A second press does nothing while the first is running.
    await userEvent.click(busy)
    await expect(args.actions.generateDrafts).toHaveBeenCalledOnce()
  },
}

export const BuildRoutesFails: Story = {
  args: {
    actions: {
      ...actionSpies(),
      generateDrafts: fn(() =>
        Promise.reject(new Error('That conflicts with existing data')),
      ),
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(buildButton(c))
    const alert = await c.findByRole('alert')
    await expect(alert).toHaveTextContent('Routes were not built')
    await expect(alert).toHaveTextContent('That conflicts with existing data.')
    await expect(alert).toHaveTextContent('Nothing was changed')
    // The button is usable again.
    await expect(buildButton(c)).toBeEnabled()
  },
}

export const BuildRoutesNeedsTheBoard: Story = {
  args: { status: 'loading', routes: [], available: [] },
  play: async ({ canvasElement }) => {
    await expect(buildButton(within(canvasElement))).toBeDisabled()
  },
}

export const BuildRoutesHiddenWithoutPermission: Story = {
  args: { canBuild: false },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(
      c.queryByRole('button', { name: 'Build routes from service areas' }),
    ).toBeNull()
    await expect(
      c.queryByRole('region', { name: 'Build routes from service areas' }),
    ).toBeNull()
    await expect(c.getByRole('button', { name: 'Create route' })).toBeVisible()
  },
}

export const ChangingTheDateClearsTheResult: Story = {
  args: {
    actions: {
      ...actionSpies(),
      generateDrafts: fn(() => Promise.resolve(MIXED)),
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(buildButton(c))
    await c.findByRole('status', { name: 'Build result' })
    fireEvent.change(c.getByLabelText('Route date'), {
      target: { value: '2026-10-30' },
    })
    await expect(c.queryByRole('status', { name: 'Build result' })).toBeNull()
  },
}

export const VisitCardsShowTheirOwner: Story = {
  args: {
    available: [
      V.oliver,
      { ...V.noah, preferredCrewName: 'South crew' },
      V.grace,
      V.hannah,
    ],
  },
  play: async ({ canvasElement }) => {
    const pool = region(canvasElement, 'Available jobs')
    const card = (name: string) =>
      within(pool.getByRole('article', { name: `Visit ${name}` }))
    await expect(card('Oliver Bennett').getByText('Northwest')).toBeVisible()
    await expect(
      card('Oliver Bennett').getByText(/crew North crew/),
    ).toBeVisible()
    await expect(card('Noah Wilson').getByText('South crew')).toBeVisible()
    await expect(
      card('Noah Wilson').getByText('Outside every service area'),
    ).toBeVisible()
    await expect(card('Grace Kim').getByText('No map location')).toBeVisible()
    await expect(
      card('Hannah Brooks').getByText('Outside every service area'),
    ).toBeVisible()
    // Stops already on a route don't repeat it.
    await expect(
      region(canvasElement, 'North crew').queryByText(
        'Outside every service area',
      ),
    ).toBeNull()
  },
}

export const LiveBuildRoutesRefreshesTheBoard = liveStory(
  [],
  async ({ canvasElement }, server) => {
    const c = within(canvasElement)
    await loaded(c)
    await userEvent.click(buildButton(c))
    const result = await c.findByRole('status', { name: 'Build result' })
    await expect(
      within(result).getByText('1 visit placed on 0 new routes'),
    ).toBeVisible()
    await expect(within(result).getByText(/Grace Kim/)).toBeVisible()
    // The board refetched: Oliver left the pool and is on North crew's route.
    await waitFor(() =>
      expect(
        region(canvasElement, 'North crew').getByRole('article', {
          name: 'Visit Oliver Bennett',
        }),
      ).toBeVisible(),
    )
    await expect(
      region(canvasElement, 'Available jobs').queryByRole('article', {
        name: 'Visit Oliver Bennett',
      }),
    ).toBeNull()
    await expect(countOf(server(), 'routes.generateDrafts')).toBe(1)
    await expect(countOf(server(), 'routes.list')).toBeGreaterThan(1)
  },
)

export const LiveBuildRoutesFailureShowsAnError = liveStory(
  ['routes.generateDrafts'],
  async ({ canvasElement }) => {
    const c = within(canvasElement)
    await loaded(c)
    await userEvent.click(buildButton(c))
    const alert = await c.findByRole('alert')
    await expect(alert).toHaveTextContent('Routes were not built')
    await expect(alert).toHaveTextContent('The database said no')
  },
)
