import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Lock,
  Plus,
  Route,
  TriangleAlert,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  IconBtn,
  SearchInput,
  SelectInput,
  TextInput,
} from '#/components/crm/ui'
import { fmtDate, fmtDuration } from '#/components/crm/format'
import { MapView } from '#/components/map/MapView'
import type { MapStop } from '#/components/map/MapView'
import { UnplacedStops } from '#/components/map/UnplacedStops'
import { isPendingStop } from '#/integrations/routes/routes'
import type {
  AvailableVisit,
  DayRoute,
  RouteStop,
} from '#/integrations/routes/routes'
import { cn } from '#/lib/utils'

const DRAG_MIME = 'application/x-crm-route-item'
const DEFAULT_COLOR = '#2f7350'

/** A pooled visit or a stop on a route, carried by a drag. */
type DragItem = { kind: 'visit' | 'stop'; id: string }

export type CrewOption = {
  id: string
  name: string
  color: string | null
  vehicle: string | null
}

export type RouteBuilderActions = {
  /** Resolves with the new route's id. */
  createRoute: (crewId: string) => Promise<string>
  /** Resolves with the id of the route that replaces this one. */
  assignCrew: (routeId: string, crewId: string) => Promise<string>
  deleteRoute: (routeId: string) => Promise<void>
  addStop: (routeId: string, visitId: string, position?: number) => void
  moveStop: (stopId: string, toRouteId: string, position: number) => void
  removeStop: (stopId: string) => void
  reorderStops: (routeId: string, stopIds: Array<string>) => void
}

export type RouteBuilderProps = {
  date: string
  onDateChange: (date: string) => void
  routes: Array<DayRoute>
  available: Array<AvailableVisit>
  crews: Array<CrewOption>
  status: 'loading' | 'error' | 'ready'
  errorMessage?: string
  onRetry?: () => void
  actions: RouteBuilderActions
}

const STATUS_LABEL: Record<DayRoute['status'], string> = {
  draft: 'Draft',
  optimized: 'Optimized',
  published: 'Published',
  in_progress: 'In progress',
  completed: 'Completed',
}

const routeName = (route: DayRoute) => route.crew?.name ?? 'Route'
const customer = (v: { clientName: string | null }) =>
  v.clientName ?? 'Customer unavailable'

function readDrag(e: DragEvent<HTMLElement>): DragItem | null {
  try {
    const raw = JSON.parse(
      e.dataTransfer.getData(DRAG_MIME),
    ) as Partial<DragItem>
    return (raw.kind === 'visit' || raw.kind === 'stop') &&
      typeof raw.id === 'string'
      ? { kind: raw.kind, id: raw.id }
      : null
  } catch {
    return null
  }
}

export function RouteBuilder({
  date,
  onDateChange,
  routes,
  available,
  crews,
  status,
  errorMessage,
  onRetry,
  actions,
}: RouteBuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [over, setOver] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [newCrewId, setNewCrewId] = useState('')
  const [busy, setBusy] = useState(false)

  const selected =
    routes.find((r) => r.id === selectedId) ??
    routes.find((r) => r.editable) ??
    routes.at(0)
  const editableRoutes = routes.filter((r) => r.editable)
  const usedCrewIds = new Set(routes.map((r) => r.crew?.id))
  const freeCrews = crews.filter((c) => !usedCrewIds.has(c.id))
  const newCrew = freeCrews.find((c) => c.id === newCrewId) ?? freeCrews.at(0)
  const needle = query.trim().toLowerCase()
  const filtered = available.filter(
    (v) =>
      !needle ||
      `${v.jobNumber ?? ''} ${v.jobTitle ?? ''} ${v.clientName ?? ''} ${v.address ?? ''} ${v.city ?? ''}`
        .toLowerCase()
        .includes(needle),
  )

  function say(message: string) {
    setFeedback(message)
  }

  function addToRoute(visit: AvailableVisit, route: DayRoute) {
    if (!route.editable) return say(`${routeName(route)} is locked.`)
    actions.addStop(route.id, visit.visitId)
    say(`${customer(visit)} added to ${routeName(route)}.`)
  }

  function moveToRoute(stop: RouteStop, from: DayRoute, to: DayRoute) {
    if (!to.editable || !from.editable)
      return say('A locked route cannot be changed.')
    if (from.id === to.id) return
    actions.moveStop(stop.id, to.id, to.stops.length + 1)
    say(`${customer(stop)} moved to ${routeName(to)}.`)
  }

  function returnToPool(stop: RouteStop, from: DayRoute) {
    if (!from.editable) return say('A locked route cannot be changed.')
    actions.removeStop(stop.id)
    say(`${customer(stop)} returned to Available jobs.`)
  }

  function nudge(route: DayRoute, stop: RouteStop, direction: -1 | 1) {
    const ids = route.stops.map((s) => s.id)
    const index = ids.indexOf(stop.id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= ids.length) return
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    actions.reorderStops(route.id, ids)
    say('Stop order updated.')
  }

  // Resolves a drag against the current board, so a stale or foreign payload
  // changes nothing.
  function drop(item: DragItem, destination: DayRoute | null) {
    if (item.kind === 'visit') {
      const visit = available.find((v) => v.visitId === item.id)
      if (!visit || !destination) return
      return addToRoute(visit, destination)
    }
    const from = routes.find((r) => r.stops.some((s) => s.id === item.id))
    const stop = from?.stops.find((s) => s.id === item.id)
    if (!from || !stop) return say('That stop is no longer on a route.')
    if (destination) moveToRoute(stop, from, destination)
    else returnToPool(stop, from)
  }

  function dragStart(e: DragEvent<HTMLElement>, item: DragItem) {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(item))
    e.dataTransfer.effectAllowed = 'move'
  }

  function dropProps(route: DayRoute | null) {
    const key = route?.id ?? 'pool'
    const accepts = route === null || route.editable
    return {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!accepts || !e.dataTransfer.types.includes(DRAG_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(key)
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOver(null)
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault()
        setOver(null)
        if (!accepts) return
        const item = readDrag(e)
        if (item) drop(item, route)
      },
    }
  }

  async function createRoute() {
    if (!newCrew || busy) return
    setBusy(true)
    try {
      const id = await actions.createRoute(newCrew.id)
      setSelectedId(id)
      setNewCrewId('')
      say(`${newCrew.name} route created for ${fmtDate(date)}.`)
    } catch {
      say('The route could not be created.')
    } finally {
      setBusy(false)
    }
  }

  async function changeCrew(route: DayRoute, crewId: string) {
    const crew = crews.find((c) => c.id === crewId)
    if (!crew || crew.id === route.crew?.id) return
    try {
      const id = await actions.assignCrew(route.id, crew.id)
      setSelectedId(id)
      say(`${crew.name} now runs this route. Stops stay on it.`)
    } catch {
      say('The crew could not be changed.')
    }
  }

  async function deleteRoute(route: DayRoute) {
    try {
      await actions.deleteRoute(route.id)
      say(`${routeName(route)} route deleted.`)
    } catch {
      say('The route could not be deleted.')
    }
  }

  return (
    <div className="space-y-5" onDragEnd={() => setOver(null)}>
      <section aria-label="Create route">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="crm-display text-xl font-semibold">Create route</h2>
            <p className="mt-1 max-w-md text-xs text-(--ink-3)">
              Pick the day and a crew. Each crew has one route a day. Then add
              the day’s scheduled visits to it.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
            <label className="min-w-0 flex-1 basis-40 text-xs font-bold text-(--ink-2)">
              Route date
              <TextInput
                aria-label="Route date"
                type="date"
                value={date}
                className="mt-1.5"
                onChange={(e) => {
                  if (e.target.value) {
                    onDateChange(e.target.value)
                    setOver(null)
                    setFeedback('')
                  }
                }}
              />
            </label>
            <label className="min-w-0 flex-1 basis-44 text-xs font-bold text-(--ink-2)">
              Crew for new route
              <SelectInput
                aria-label="Crew for new route"
                className="mt-1.5"
                value={newCrew?.id ?? ''}
                disabled={!freeCrews.length}
                onChange={(e) => setNewCrewId(e.target.value)}
              >
                {!freeCrews.length && <option value="">No free crew</option>}
                {freeCrews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
            </label>
            <Btn
              icon={Plus}
              disabled={!newCrew || busy || status !== 'ready'}
              onClick={createRoute}
            >
              Create route
            </Btn>
          </div>
          {status === 'ready' && !freeCrews.length && (
            <p className="w-full text-xs text-(--ink-3)">
              {crews.length
                ? 'Every crew already has a route on this date.'
                : 'There are no crews yet. Add one in Teams to build routes.'}
            </p>
          )}
        </Card>
      </section>
      {status === 'loading' && <BoardSkeleton />}
      {status === 'error' && (
        <Card role="alert" className="p-2">
          <EmptyState
            icon={TriangleAlert}
            title="Routes didn’t load"
            body={errorMessage ?? 'Something went wrong. Try again.'}
            action={
              onRetry && (
                <Btn variant="outline" size="sm" onClick={onRetry}>
                  Try again
                </Btn>
              )
            }
          />
        </Card>
      )}
      {status === 'ready' && (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section aria-label="Existing routes" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="crm-display text-2xl font-semibold">
                  Existing routes{' '}
                  <span className="text-base text-(--ink-3)">
                    ({routes.length})
                  </span>
                </h2>
                <p className="mt-1 text-xs text-(--ink-3)">
                  {fmtDate(date)} · Drag visits between routes, or use the move
                  controls.
                </p>
              </div>
            </div>
            {!routes.length && (
              <Card>
                <EmptyState
                  icon={Route}
                  title="A fresh start"
                  body="No routes for this date. Choose a crew above and create the first one."
                />
              </Card>
            )}
            <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
              {routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  crews={crews}
                  routes={routes}
                  editableRoutes={editableRoutes}
                  active={selected?.id === route.id}
                  highlighted={over === route.id}
                  dropProps={dropProps(route)}
                  onSelect={() => setSelectedId(route.id)}
                  onChangeCrew={(crewId) => changeCrew(route, crewId)}
                  onDelete={() => deleteRoute(route)}
                  onNudge={(stop, direction) => nudge(route, stop, direction)}
                  onReturn={(stop) => returnToPool(stop, route)}
                  onMove={(stop, to) => moveToRoute(stop, route, to)}
                  onDragStart={dragStart}
                />
              ))}
            </div>
            {selected && <RoutePreview route={selected} />}
          </section>
          <section
            aria-label="Available jobs"
            {...dropProps(null)}
            className={cn(
              'min-w-0 rounded-[22px] border bg-(--paper) transition-colors',
              over === 'pool'
                ? 'border-(--leaf-500) bg-(--lime-100)'
                : 'border-(--line)',
            )}
          >
            <div className="border-b border-(--line) p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="crm-display text-xl font-semibold">
                  Available jobs
                </h2>
                <Badge>{available.length}</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-(--ink-3)">
                Scheduled visits on this date that are not on a route. Each stop
                is one visit. Drop a route stop here to return it.
              </p>
              <SearchInput
                className="mt-4"
                value={query}
                onChange={setQuery}
                placeholder="Search jobs, customers, addresses"
              />
              <p className="mt-3 text-[11px] font-semibold text-(--leaf-700)">
                {selected?.editable
                  ? `Adding to ${routeName(selected)}`
                  : selected
                    ? `${routeName(selected)} is locked. Select a draft route to add jobs.`
                    : 'Create or select a route to add jobs.'}
              </p>
            </div>
            <div className="min-h-24 space-y-3 p-3">
              {filtered.map((visit) => (
                <VisitCard
                  key={visit.visitId}
                  visit={visit}
                  onDragStart={(e) =>
                    dragStart(e, { kind: 'visit', id: visit.visitId })
                  }
                >
                  <Btn
                    variant="outline"
                    size="sm"
                    icon={Plus}
                    className="w-full"
                    aria-label={`Add ${customer(visit)} to route`}
                    disabled={!selected?.editable}
                    onClick={() => selected && addToRoute(visit, selected)}
                  >
                    Add to {selected ? routeName(selected) : 'route'}
                  </Btn>
                </VisitCard>
              ))}
              {!filtered.length && (
                <EmptyState
                  icon={available.length ? Route : Check}
                  title={
                    needle && available.length
                      ? 'No matching visits'
                      : 'Everything is routed'
                  }
                  body={
                    needle && available.length
                      ? 'Try another customer, address, job number, or service.'
                      : 'No scheduled visits are waiting on this date. Remove a stop or drag it here to make it available again.'
                  }
                />
              )}
            </div>
          </section>
        </div>
      )}
      <p
        role="status"
        aria-live="polite"
        className="min-h-4 text-xs text-(--leaf-700)"
      >
        {feedback}
      </p>
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading routes"
      className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-72 animate-pulse rounded-[22px] border border-(--line) bg-(--sage)"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[22px] border border-(--line) bg-(--sage)" />
    </div>
  )
}

function RouteCard({
  route,
  crews,
  routes,
  editableRoutes,
  active,
  highlighted,
  dropProps,
  onSelect,
  onChangeCrew,
  onDelete,
  onNudge,
  onReturn,
  onMove,
  onDragStart,
}: {
  route: DayRoute
  crews: Array<CrewOption>
  routes: Array<DayRoute>
  editableRoutes: Array<DayRoute>
  active: boolean
  highlighted: boolean
  dropProps: object
  onSelect: () => void
  onChangeCrew: (crewId: string) => void
  onDelete: () => void
  onNudge: (stop: RouteStop, direction: -1 | 1) => void
  onReturn: (stop: RouteStop) => void
  onMove: (stop: RouteStop, to: DayRoute) => void
  onDragStart: (e: DragEvent<HTMLElement>, item: DragItem) => void
}) {
  const name = routeName(route)
  const taken = new Set(
    routes.filter((r) => r.id !== route.id).map((r) => r.crew?.id),
  )
  const canDelete = route.status === 'draft' && route.stops.length === 0
  return (
    <section
      aria-label={name}
      {...dropProps}
      className={cn(
        'min-w-0 rounded-[22px] border bg-(--paper) p-3 transition-colors',
        active
          ? 'border-(--leaf-600) ring-2 ring-(--leaf-600)/10'
          : 'border-(--line)',
        highlighted && 'border-(--leaf-500) bg-(--lime-100)',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Select ${name}`}
          aria-pressed={active}
          onClick={onSelect}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-(--leaf-500)"
        >
          <span
            style={{ background: route.crew?.color ?? undefined }}
            className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-(--leaf-900) text-(--lime)"
          >
            <Route className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{name}</span>
            <span className="text-[11px] text-(--ink-3)">
              {active ? 'Selected route' : 'Select route'}
            </span>
          </span>
        </button>
        {!route.editable && (
          <Lock className="size-3.5 text-(--ink-3)" aria-hidden />
        )}
        <Badge tone={route.editable ? 'gray' : 'green'}>
          {STATUS_LABEL[route.status]}
        </Badge>
        {canDelete && (
          <IconBtn
            icon={Trash2}
            label={`Delete ${name} route`}
            onClick={onDelete}
          />
        )}
      </div>
      <div className="mt-2 rounded-xl bg-(--cream) p-3">
        <label className="block text-[11px] font-bold text-(--ink-3)">
          Crew
          <SelectInput
            className="mt-1"
            aria-label={`Crew for ${name}`}
            value={route.crew?.id ?? ''}
            disabled={!route.editable}
            onChange={(e) => onChangeCrew(e.target.value)}
          >
            {crews.map((c) => (
              <option key={c.id} value={c.id} disabled={taken.has(c.id)}>
                {c.name}
                {taken.has(c.id) ? ' · already has a route' : ''}
              </option>
            ))}
          </SelectInput>
        </label>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-(--ink-3)">
          <Truck className="size-3" aria-hidden />
          {route.crew?.vehicle ?? 'No vehicle recorded'}
        </p>
      </div>
      <div className="flex flex-wrap justify-between gap-1 px-1 py-3 text-[11px] text-(--ink-3)">
        <span>{fmtDate(route.date)}</span>
        <span
          aria-label={`${name}: ${route.totals.stops} stops, ${fmtDuration(route.totals.onSiteMinutes)} on site`}
        >
          {route.totals.stops} stops · {fmtDuration(route.totals.onSiteMinutes)}{' '}
          on site
        </span>
      </div>
      <ol aria-label={`Ordered stops for ${name}`} className="space-y-2">
        {route.stops.map((stop, index) => {
          const pending = isPendingStop(stop.id)
          const frozen = !route.editable || pending
          const who = customer(stop)
          return (
            <li key={stop.id}>
              <VisitCard
                visit={stop}
                sequence={stop.sequence}
                draggable={!frozen}
                onDragStart={(e) =>
                  onDragStart(e, { kind: 'stop', id: stop.id })
                }
              >
                <div className="flex items-center justify-between border-t border-(--line) pt-2">
                  <span className="text-[10px] text-(--ink-3)">
                    {route.editable ? 'Arrange stops' : 'Route is locked'}
                  </span>
                  <div className="flex gap-0.5">
                    <IconBtn
                      icon={ArrowUp}
                      label={`Move ${who} up`}
                      disabled={frozen || index === 0}
                      onClick={() => onNudge(stop, -1)}
                    />
                    <IconBtn
                      icon={ArrowDown}
                      label={`Move ${who} down`}
                      disabled={frozen || index === route.stops.length - 1}
                      onClick={() => onNudge(stop, 1)}
                    />
                    <IconBtn
                      icon={X}
                      label={`Remove ${who} from route`}
                      disabled={frozen}
                      onClick={() => onReturn(stop)}
                    />
                  </div>
                </div>
                <MoveControl
                  who={who}
                  disabled={frozen}
                  routes={editableRoutes.filter((r) => r.id !== route.id)}
                  onMove={(to) => onMove(stop, to)}
                />
              </VisitCard>
            </li>
          )
        })}
      </ol>
      {!route.stops.length && (
        <div className="rounded-xl border border-dashed border-(--line-2) px-3 py-8 text-center">
          <p className="text-sm font-bold">Empty route</p>
          <p className="mt-1 text-xs text-(--ink-3)">
            {route.editable
              ? 'Drop visits here or select this route and add available jobs.'
              : 'This route has no stops.'}
          </p>
        </div>
      )}
      {route.editable && (
        <p className="mt-3 text-center text-[10px] text-(--ink-3)">
          Drop a job visit onto this route
        </p>
      )}
    </section>
  )
}

function VisitCard({
  visit,
  sequence,
  draggable = true,
  onDragStart,
  children,
}: {
  visit: AvailableVisit
  sequence?: number
  draggable?: boolean
  onDragStart: (e: DragEvent<HTMLElement>) => void
  children: ReactNode
}) {
  const name = customer(visit)
  return (
    <article
      draggable={draggable}
      aria-label={`Visit ${name}`}
      onDragStart={onDragStart}
      className={cn(
        'space-y-2 rounded-xl border border-(--line) bg-(--paper) p-3',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-wide text-(--ink-3)">
        {draggable && <GripVertical className="size-3.5" aria-hidden />}
        {sequence !== undefined && (
          <span
            aria-label={`Stop ${sequence}`}
            className="flex size-5 items-center justify-center rounded-full bg-(--leaf-900) text-white"
          >
            {sequence}
          </span>
        )}
        <span>{visit.jobNumber ?? 'Job'}</span>
        <span className="ml-auto">{fmtDuration(visit.durationMinutes)}</span>
      </div>
      <h3 className="text-[13px] font-bold">{name}</h3>
      <p className="text-xs text-(--ink-3)">
        {visit.address
          ? `${visit.address}${visit.city ? `, ${visit.city}` : ''}`
          : 'Address unavailable'}
      </p>
      <p className="text-xs font-semibold text-(--ink-2)">
        {visit.jobTitle ?? 'Scheduled service'}
      </p>
      <p className="text-[10px] text-(--ink-3)">
        {visit.windowStart && visit.windowEnd
          ? `${formatTime(visit.windowStart)}–${formatTime(visit.windowEnd)}`
          : 'Flexible arrival'}
      </p>
      {children}
    </article>
  )
}

function MoveControl({
  who,
  routes,
  disabled,
  onMove,
}: {
  who: string
  routes: Array<DayRoute>
  disabled: boolean
  onMove: (to: DayRoute) => void
}) {
  const [target, setTarget] = useState('')
  const to = routes.find((r) => r.id === target)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <SelectInput
        className="min-w-0 flex-1"
        aria-label={`Move ${who} to route`}
        value={to?.id ?? ''}
        disabled={disabled || !routes.length}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">
          {routes.length ? 'Choose route…' : 'No other open route'}
        </option>
        {routes.map((r) => (
          <option key={r.id} value={r.id}>
            {routeName(r)}
          </option>
        ))}
      </SelectInput>
      <Btn
        size="sm"
        variant="ghost"
        disabled={disabled || !to}
        aria-label={`Move ${who} to selected route`}
        onClick={() => {
          if (to) {
            onMove(to)
            setTarget('')
          }
        }}
      >
        Move
      </Btn>
    </div>
  )
}

/** The selected route on the map: numbered stops joined in order. */
function RoutePreview({ route }: { route: DayRoute }) {
  const name = routeName(route)
  const color = route.crew?.color ?? DEFAULT_COLOR
  const located = route.stops.filter(
    (s) => s.latitude !== null && s.longitude !== null,
  )
  const unplaced = route.stops.filter(
    (s) => s.latitude === null || s.longitude === null,
  )
  const mapStops: Array<MapStop> = located.map((s) => ({
    id: s.id,
    position: { lon: s.longitude!, lat: s.latitude! },
    label: String(s.sequence),
    title: `${s.sequence}. ${customer(s)}, ${s.address ?? 'no address'}`,
    color,
  }))
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap justify-between gap-2 p-4">
        <div>
          <h3 className="text-sm font-bold">{name} · Map preview</h3>
          <p className="mt-1 text-[11px] text-(--ink-3)">
            Stops in order, joined by straight lines. No road directions or
            travel estimates.
          </p>
        </div>
        <span className="text-xs text-(--leaf-700)">
          {route.totals.stops} stops · {fmtDuration(route.totals.onSiteMinutes)}{' '}
          on site
        </span>
      </div>
      {route.stops.length ? (
        <div className="space-y-3 px-4 pb-4">
          <MapView
            label={`Map of ${name}`}
            className="w-full border border-(--line)"
            style={{ height: 320 }}
            stops={mapStops}
            route={{ path: mapStops.map((s) => s.position), color }}
          />
          <UnplacedStops
            stops={unplaced.map((s) => ({
              id: s.id,
              label: String(s.sequence),
              title: customer(s),
              detail: s.address ?? undefined,
            }))}
          />
        </div>
      ) : (
        <p className="px-4 pb-4 text-xs text-(--ink-2)">
          Add stops to see this route on the map.
        </p>
      )}
    </Card>
  )
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
