import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'

import { toast } from '#/lib/toast'
import type { useOrgScope } from '#/integrations/organization/org-query'
import { useTRPC } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'

type Outputs = inferRouterOutputs<TRPCRouter>['routes']

export type DayRoute = Outputs['list'][number]
export type RouteStop = DayRoute['stops'][number]
export type AvailableVisit = Outputs['availableVisits'][number]
/** What "Build routes from service areas" returns. */
export type DraftResult = Outputs['generateDrafts']

/** The active organization as tRPC input, from `useOrgScope()`. */
export type OrgScope = ReturnType<typeof useOrgScope>

export type Board = {
  routes: Array<DayRoute>
  available: Array<AvailableVisit>
}

const PENDING = 'pending:'

/** A stop added optimistically, before the server has given it an id. */
export const isPendingStop = (stopId: string) => stopId.startsWith(PENDING)

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max)

const renumber = (stops: Array<RouteStop>): Array<RouteStop> =>
  stops.map((s, i) => (s.sequence === i + 1 ? s : { ...s, sequence: i + 1 }))

function withStops(route: DayRoute, stops: Array<RouteStop>): DayRoute {
  const ordered = renumber(stops)
  return {
    ...route,
    stops: ordered,
    totals: {
      stops: ordered.length,
      onSiteMinutes: ordered.reduce((n, s) => n + s.durationMinutes, 0),
    },
  }
}

const toStop = (v: AvailableVisit, id: string): RouteStop => ({
  id,
  sequence: 0,
  isLocked: false,
  ...v,
})

const toVisit = ({
  id: _id,
  sequence: _sequence,
  isLocked: _isLocked,
  ...visit
}: RouteStop): AvailableVisit => visit

const byWindow = (a: AvailableVisit, b: AvailableVisit) =>
  (a.windowStart ?? '￿').localeCompare(b.windowStart ?? '￿')

// The functions below mirror the SQL in 20261103120000_route_builder_rpcs.sql
// on the cached board, for optimistic updates. The refetch after each
// mutation settles on the server's truth.

/** Puts a pooled visit on a route at a 1-based position (default last). */
export function applyAdd(
  board: Board,
  visitId: string,
  routeId: string,
  position?: number,
): Board {
  const visit = board.available.find((v) => v.visitId === visitId)
  const route = board.routes.find((r) => r.id === routeId)
  if (!visit || !route) return board
  const at = clamp(
    position ?? route.stops.length + 1,
    1,
    route.stops.length + 1,
  )
  const stops = [...route.stops]
  stops.splice(at - 1, 0, toStop(visit, `${PENDING}${visitId}`))
  return {
    available: board.available.filter((v) => v.visitId !== visitId),
    routes: board.routes.map((r) =>
      r.id === routeId ? withStops(r, stops) : r,
    ),
  }
}

/** Moves a stop to a 1-based position on a route, which may be its own. */
export function applyMove(
  board: Board,
  stopId: string,
  toRouteId: string,
  position: number,
): Board {
  const from = board.routes.find((r) => r.stops.some((s) => s.id === stopId))
  const to = board.routes.find((r) => r.id === toRouteId)
  const stop = from?.stops.find((s) => s.id === stopId)
  if (!from || !to || !stop) return board
  const rest = from.stops.filter((s) => s.id !== stopId)
  const target = from.id === to.id ? rest : to.stops
  const at = clamp(position, 1, target.length + 1)
  const placed = [...target]
  placed.splice(at - 1, 0, stop)
  return {
    available: board.available,
    routes: board.routes.map((r) => {
      if (r.id === to.id) return withStops(r, placed)
      if (r.id === from.id) return withStops(r, rest)
      return r
    }),
  }
}

/** Takes a stop off its route and returns its visit to the pool. */
export function applyRemove(board: Board, stopId: string): Board {
  const from = board.routes.find((r) => r.stops.some((s) => s.id === stopId))
  const stop = from?.stops.find((s) => s.id === stopId)
  if (!from || !stop) return board
  return {
    available: [...board.available, toVisit(stop)].sort(byWindow),
    routes: board.routes.map((r) =>
      r.id === from.id
        ? withStops(
            r,
            r.stops.filter((s) => s.id !== stopId),
          )
        : r,
    ),
  }
}

/** Applies a full stop order; ids the route doesn't have are ignored. */
export function applyReorder(
  board: Board,
  routeId: string,
  stopIds: Array<string>,
): Board {
  return {
    available: board.available,
    routes: board.routes.map((r) => {
      if (r.id !== routeId) return r
      const byId = new Map(r.stops.map((s) => [s.id, s]))
      const ordered = stopIds.flatMap((id) => byId.get(id) ?? [])
      return ordered.length === r.stops.length ? withStops(r, ordered) : r
    }),
  }
}

export function useDayRoutes(scope: OrgScope, date: string) {
  const trpc = useTRPC()
  const { input, enabled } = scope
  return useQuery({
    ...trpc.routes.list.queryOptions({ ...input, date }),
    enabled,
  })
}

export function useAvailableVisits(scope: OrgScope, date: string) {
  const trpc = useTRPC()
  const { input, enabled } = scope
  return useQuery({
    ...trpc.routes.availableVisits.queryOptions({ ...input, date }),
    enabled,
  })
}

/**
 * Route edits for one date. Drags, adds, removes and reorders update the
 * cached board first; a failure restores the snapshot and toasts, and every
 * settle refetches. Create, crew change and delete wait for the server.
 * Mutations run one at a time so the server sees them in the order made.
 */
export function useRouteMutations(scope: OrgScope, date: string) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { input: base } = scope
  const listKey = trpc.routes.list.queryKey({ ...base, date })
  const poolKey = trpc.routes.availableVisits.queryKey({ ...base, date })
  const serial = { id: 'routes' }

  const read = (): Board | null => {
    const routes = queryClient.getQueryData<Array<DayRoute>>(listKey)
    const available = queryClient.getQueryData<Array<AvailableVisit>>(poolKey)
    return routes && available ? { routes, available } : null
  }
  const write = (board: Board) => {
    queryClient.setQueryData(listKey, board.routes)
    queryClient.setQueryData(poolKey, board.available)
  }
  const settle = {
    scope: serial,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({ queryKey: poolKey }),
      ]),
  }
  const optimistic = <TVars>(patch: (board: Board, vars: TVars) => Board) => ({
    ...settle,
    onMutate: async (vars: TVars) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: poolKey }),
      ])
      const snapshot = read()
      if (snapshot) write(patch(snapshot, vars))
      return { snapshot }
    },
    onError: (
      e: { message: string },
      _vars: TVars,
      context: { snapshot: Board | null } | undefined,
    ) => {
      if (context?.snapshot) write(context.snapshot)
      toast(`Couldn't save: ${e.message}`, 'warning')
    },
  })
  const failed = (what: string) => ({
    ...settle,
    onError: (e: { message: string }) =>
      toast(`Couldn't ${what}: ${e.message}`, 'warning'),
  })

  const generate = useMutation(
    trpc.routes.generateDrafts.mutationOptions({
      ...settle,
    }),
  )
  const create = useMutation(
    trpc.routes.create.mutationOptions(failed('create the route')),
  )
  const assign = useMutation(
    trpc.routes.assignCrew.mutationOptions(failed('change the crew')),
  )
  const remove = useMutation(
    trpc.routes.delete.mutationOptions(failed('delete the route')),
  )
  const add = useMutation(
    trpc.routes.addStop.mutationOptions(
      optimistic((board, v) =>
        applyAdd(board, v.visitId, v.routeId, v.position),
      ),
    ),
  )
  const move = useMutation(
    trpc.routes.moveStop.mutationOptions(
      optimistic((board, v) =>
        applyMove(board, v.stopId, v.toRouteId, v.position),
      ),
    ),
  )
  const unroute = useMutation(
    trpc.routes.removeStop.mutationOptions(
      optimistic((board, v) => applyRemove(board, v.stopId)),
    ),
  )
  const reorder = useMutation(
    trpc.routes.reorderStops.mutationOptions(
      optimistic((board, v) => applyReorder(board, v.routeId, v.stopIds)),
    ),
  )

  return {
    createRoute: async (crewId: string) =>
      (await create.mutateAsync({ ...base, date, crewId })).id,
    assignCrew: async (routeId: string, crewId: string) =>
      (await assign.mutateAsync({ ...base, routeId, crewId })).id,
    /** Rejects with the server's message; the caller shows it. */
    generateDrafts: (): Promise<DraftResult> =>
      generate.mutateAsync({ ...base, date }),
    deleteRoute: async (routeId: string) => {
      await remove.mutateAsync({ ...base, routeId })
    },
    addStop: (routeId: string, visitId: string, position?: number) =>
      add.mutate({ ...base, routeId, visitId, position }),
    moveStop: (stopId: string, toRouteId: string, position: number) =>
      move.mutate({ ...base, stopId, toRouteId, position }),
    removeStop: (stopId: string) => unroute.mutate({ ...base, stopId }),
    reorderStops: (routeId: string, stopIds: Array<string>) =>
      reorder.mutate({ ...base, routeId, stopIds }),
  }
}
