import { useState } from 'react'
import type { DragEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  FlaskConical,
  GripVertical,
  Warehouse,
  Plus,
  RotateCcw,
  Route,
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
import { cn } from '#/lib/utils'
import {
  crews,
  EXAMPLE_DATE,
  initialTemplates,
  makeStops,
  positions,
  visitDetails,
  visits,
} from '#/components/route-builder/mock-data'
import type {
  DraftStop,
  RouteTemplate,
} from '#/components/route-builder/mock-data'

const VISIT_MIME = 'application/x-crm-route-visit'
function initialState(date: string) {
  const templates = initialTemplates()
  return {
    templates,
    date,
    selectedId: templates.find((r) => r.date === date)?.id ?? null,
    nextLabel: 3,
    feedback: '',
  }
}
function duration(route: RouteTemplate) {
  return route.visitIds.reduce(
    (sum, id) => sum + (visitDetails(id).visit?.duration_minutes ?? 0),
    0,
  )
}

export function RouteBuilder({
  initialDate = EXAMPLE_DATE,
}: {
  initialDate?: string
}) {
  const [state, setState] = useState(() => initialState(initialDate))
  const [query, setQuery] = useState('')
  const [over, setOver] = useState<string | null>(null)
  const { templates, date, selectedId, feedback } = state
  const dayRoutes = templates.filter((r) => r.date === date)
  const selected = dayRoutes.find((r) => r.id === selectedId)
  const assigned = new Set(templates.flatMap((r) => r.visitIds))
  const dayVisits = visits.filter((v) => v.scheduled_date === date)
  const available = dayVisits.filter((v) => !assigned.has(v.id))
  const filtered = available.filter((v) => {
    const { job, client, property } = visitDetails(v.id)
    return `${job?.number ?? ''} ${job?.title ?? ''} ${client?.display_name ?? ''} ${property?.address_line1 ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  })

  function transfer(visitId: string, destinationId: string | null) {
    setState((current) => {
      const visit = visits.find((v) => v.id === visitId)
      const target = current.templates.find((r) => r.id === destinationId)
      if (
        !visit ||
        visit.scheduled_date !== current.date ||
        (destinationId !== null &&
          (!target || target.date !== visit.scheduled_date))
      ) {
        return {
          ...current,
          feedback:
            'This visit cannot be moved here. Choose a route on the same date.',
        }
      }
      const source = current.templates.find((r) => r.visitIds.includes(visitId))
      if (source?.id === destinationId || (!source && destinationId === null))
        return current
      return {
        ...current,
        templates: current.templates.map((r) => ({
          ...r,
          visitIds:
            r.id === destinationId
              ? [...r.visitIds.filter((id) => id !== visitId), visitId]
              : r.visitIds.filter((id) => id !== visitId),
        })),
        feedback: `${visitDetails(visitId).client?.display_name ?? 'Visit'} moved to ${target?.label ?? 'Available jobs'}.`,
      }
    })
  }
  function assignCrew(routeId: string, crewId: string) {
    setState((current) => {
      const route = current.templates.find((r) => r.id === routeId)
      if (!route || (crewId && !crews.some((c) => c.id === crewId)))
        return current
      if (
        crewId &&
        current.templates.some(
          (r) =>
            r.id !== routeId && r.date === route.date && r.crewId === crewId,
        )
      )
        return {
          ...current,
          feedback:
            'That crew already has a route on this date. Choose another crew or No crew.',
        }
      return {
        ...current,
        templates: current.templates.map((r) =>
          r.id === routeId ? { ...r, crewId: crewId || null } : r,
        ),
        feedback: `${route.label} crew updated. Visits stay on the route.`,
      }
    })
  }
  function reorder(routeId: string, visitId: string, direction: number) {
    setState((current) => ({
      ...current,
      templates: current.templates.map((r) => {
        if (r.id !== routeId) return r
        const index = r.visitIds.indexOf(visitId)
        const next = index + direction
        if (index < 0 || next < 0 || next >= r.visitIds.length) return r
        const ids = [...r.visitIds]
        ;[ids[index], ids[next]] = [ids[next], ids[index]]
        return { ...r, visitIds: ids }
      }),
      feedback: 'Stop order updated.',
    }))
  }
  function dragStart(e: DragEvent<HTMLElement>, id: string) {
    e.dataTransfer.setData(VISIT_MIME, id)
    e.dataTransfer.effectAllowed = 'move'
  }
  function dropProps(id: string | null) {
    const key = id ?? 'pool'
    return {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!e.dataTransfer.types.includes(VISIT_MIME)) return
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
        if (e.dataTransfer.types.includes(VISIT_MIME))
          transfer(e.dataTransfer.getData(VISIT_MIME), id)
      },
    }
  }

  return (
    <div className="space-y-5" onDragEnd={() => setOver(null)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--leaf-300) bg-(--sage) px-4 py-3">
        <p className="flex max-w-xl items-start gap-2 text-xs leading-relaxed text-(--ink-2)">
          <FlaskConical
            className="mt-0.5 size-4 shrink-0 text-(--leaf-600)"
            aria-hidden
          />
          <span>
            <strong className="text-(--leaf-800)">
              A little room to experiment.
            </strong>{' '}
            This is a mock builder. Changes stay in this page and reset on
            refresh.
          </span>
        </p>
        <Btn
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          onClick={() => {
            setState({
              ...initialState(EXAMPLE_DATE),
              feedback: 'Demo reset. Original routes and visits restored.',
            })
            setQuery('')
            setOver(null)
          }}
        >
          Reset demo
        </Btn>
      </div>
      <section aria-label="Create route">
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="crm-display text-xl font-semibold">Create route</h2>
            <p className="mt-1 text-xs text-(--ink-3)">
              Start with an empty template. Add jobs and choose a crew when
              you’re ready.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
            <label className="min-w-0 flex-1 text-xs font-bold text-(--ink-2)">
              Route date
              <TextInput
                aria-label="Route date"
                type="date"
                value={date}
                className="mt-1.5"
                onChange={(e) => {
                  const value = e.target.value
                  if (value)
                    setState((s) => ({
                      ...s,
                      date: value,
                      selectedId:
                        s.templates.find((r) => r.date === value)?.id ?? null,
                      feedback: '',
                    }))
                  setOver(null)
                }}
              />
            </label>
            <Btn
              icon={Plus}
              onClick={() =>
                setState((s) => {
                  const id = `template-${s.nextLabel}`
                  return {
                    ...s,
                    nextLabel: s.nextLabel + 1,
                    selectedId: id,
                    templates: [
                      ...s.templates,
                      {
                        id,
                        label: `Route ${s.nextLabel}`,
                        date: s.date,
                        crewId: null,
                        visitIds: [],
                      },
                    ],
                    feedback: `Route ${s.nextLabel} created. Empty template ready for jobs and a crew.`,
                  }
                })
              }
            >
              Create route
            </Btn>
          </div>
        </Card>
      </section>
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Existing routes" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="crm-display text-2xl font-semibold">
                Existing routes{' '}
                <span className="text-base text-(--ink-3)">
                  ({dayRoutes.length})
                </span>
              </h2>
              <p className="mt-1 text-xs text-(--ink-3)">
                {fmtDate(date)} · Drag visits between routes, or use the move
                controls.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-(--leaf-700)">
              Local drafts
            </span>
          </div>
          {!dayRoutes.length && (
            <Card>
              <EmptyState
                icon={Route}
                title="A fresh start"
                body="No routes for this date. Create an empty route above to begin."
              />
            </Card>
          )}
          <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
            {dayRoutes.map((route) => {
              const crew = crews.find((c) => c.id === route.crewId)
              const active = selectedId === route.id
              return (
                <section
                  key={route.id}
                  aria-label={route.label}
                  {...dropProps(route.id)}
                  className={cn(
                    'min-w-0 rounded-[22px] border bg-(--paper) p-3 transition-colors',
                    active
                      ? 'border-(--leaf-600) ring-2 ring-(--leaf-600)/10'
                      : 'border-(--line)',
                    over === route.id && 'border-(--leaf-500) bg-(--lime-100)',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-label={`Select ${route.label}`}
                      aria-pressed={active}
                      onClick={() =>
                        setState((s) => ({ ...s, selectedId: route.id }))
                      }
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-(--leaf-500)"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-(--leaf-900) text-(--lime)">
                        <Route className="size-4" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-sm font-bold">
                          {route.label}
                        </span>
                        <span className="text-[11px] text-(--ink-3)">
                          {active ? 'Selected route' : 'Select route'}
                        </span>
                      </span>
                    </button>
                    <Badge>Draft</Badge>
                  </div>
                  <div className="mt-2 rounded-xl bg-(--cream) p-3">
                    <label className="block text-[11px] font-bold text-(--ink-3)">
                      Assign crew
                      <SelectInput
                        className="mt-1"
                        aria-label={`Crew for ${route.label}`}
                        value={route.crewId ?? ''}
                        onChange={(e) => assignCrew(route.id, e.target.value)}
                      >
                        <option value="">No crew</option>
                        {crews.map((c) => (
                          <option
                            key={c.id}
                            value={c.id}
                            disabled={templates.some(
                              (r) =>
                                r.id !== route.id &&
                                r.date === route.date &&
                                r.crewId === c.id,
                            )}
                          >
                            {c.name}
                            {templates.some(
                              (r) =>
                                r.id !== route.id &&
                                r.date === route.date &&
                                r.crewId === c.id,
                            )
                              ? ' · already assigned'
                              : ''}
                          </option>
                        ))}
                      </SelectInput>
                    </label>
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-(--ink-3)">
                      <Truck className="size-3" aria-hidden />
                      {crew?.vehicle ?? 'Unassigned · choose a crew anytime'}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-between gap-1 px-1 py-3 text-[11px] text-(--ink-3)">
                    <span>{fmtDate(route.date)}</span>
                    <span
                      aria-label={`${route.label}: ${route.visitIds.length} stops, ${fmtDuration(duration(route))} on site`}
                    >
                      {route.visitIds.length} stops ·{' '}
                      {fmtDuration(duration(route))} on site
                    </span>
                  </div>
                  <ol
                    aria-label={`Ordered stops for ${route.label}`}
                    className="space-y-2"
                  >
                    {makeStops(route.id, route.visitIds).map((stop, index) => (
                      <li key={stop.id}>
                        <VisitCard
                          visitId={stop.visit_id}
                          sequence={stop.sequence}
                          onDragStart={dragStart}
                        >
                          <div className="flex items-center justify-between border-t border-(--line) pt-2">
                            <span className="text-[10px] text-(--ink-3)">
                              Arrange stops
                            </span>
                            <div className="flex gap-0.5">
                              <IconBtn
                                icon={ArrowUp}
                                label={`Move ${visitDetails(stop.visit_id).client?.display_name} up`}
                                disabled={index === 0}
                                onClick={() =>
                                  reorder(route.id, stop.visit_id, -1)
                                }
                              />
                              <IconBtn
                                icon={ArrowDown}
                                label={`Move ${visitDetails(stop.visit_id).client?.display_name} down`}
                                disabled={index === route.visitIds.length - 1}
                                onClick={() =>
                                  reorder(route.id, stop.visit_id, 1)
                                }
                              />
                              <IconBtn
                                icon={X}
                                label={`Remove ${visitDetails(stop.visit_id).client?.display_name} from route`}
                                onClick={() => transfer(stop.visit_id, null)}
                              />
                            </div>
                          </div>
                          <MoveControl
                            visitId={stop.visit_id}
                            routes={dayRoutes.filter((r) => r.id !== route.id)}
                            onMove={transfer}
                          />
                        </VisitCard>
                      </li>
                    ))}
                  </ol>
                  {!route.visitIds.length && (
                    <div className="rounded-xl border border-dashed border-(--line-2) px-3 py-8 text-center">
                      <p className="text-sm font-bold">Empty template</p>
                      <p className="mt-1 text-xs text-(--ink-3)">
                        Drop visits here or select this route and add available
                        jobs.
                      </p>
                    </div>
                  )}
                  <p className="mt-3 text-center text-[10px] text-(--ink-3)">
                    Drop a job visit onto this route
                  </p>
                </section>
              )
            })}
          </div>
          {selected && (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap justify-between gap-2 p-4">
                <div>
                  <h3 className="text-sm font-bold">
                    {selected.label} · Illustrative preview
                  </h3>
                  <p className="mt-1 text-[11px] text-(--ink-3)">
                    Schematic locations only. No road directions or travel
                    estimates.
                  </p>
                </div>
                <span className="text-xs text-(--leaf-700)">
                  {selected.visitIds.length} stops ·{' '}
                  {fmtDuration(duration(selected))} on site
                </span>
              </div>
              <Schematic
                stops={makeStops(selected.id, selected.visitIds)}
                color={
                  crews.find((c) => c.id === selected.crewId)?.color ??
                  '#2f7350'
                }
              />
              <div className="h-4" />
            </Card>
          )}
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
              Each stop is one scheduled job visit. Drop a route visit here to
              return it to the pool.
            </p>
            <SearchInput
              className="mt-4"
              value={query}
              onChange={setQuery}
              placeholder="Search jobs, customers, addresses"
            />
            <p className="mt-3 text-[11px] font-semibold text-(--leaf-700)">
              {selected
                ? `Adding to ${selected.label}`
                : 'Create or select a route to add jobs.'}
            </p>
          </div>
          <div className="min-h-24 space-y-3 p-3">
            {filtered.map((visit) => (
              <VisitCard
                key={visit.id}
                visitId={visit.id}
                onDragStart={dragStart}
              >
                <Btn
                  variant="outline"
                  size="sm"
                  icon={Plus}
                  className="w-full"
                  aria-label={`Add ${visitDetails(visit.id).client?.display_name} to route`}
                  disabled={!selected}
                  onClick={() => {
                    if (selected) transfer(visit.id, selected.id)
                  }}
                >
                  Add to {selected?.label ?? 'route'}
                </Btn>
              </VisitCard>
            ))}
            {!filtered.length && (
              <EmptyState
                icon={dayVisits.length ? Check : Route}
                title={
                  query.trim() && available.length
                    ? 'No matching visits'
                    : !dayVisits.length
                      ? 'A clear day'
                      : 'All visits are on a route'
                }
                body={
                  query.trim() && available.length
                    ? 'Try another customer, address, job number, or service.'
                    : !dayVisits.length
                      ? 'There are no mock visits for this date. Try October 29, 2026.'
                      : 'Remove a stop or drag a visit here to make it available again.'
                }
              />
            )}
          </div>
        </section>
      </div>
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

function VisitCard({
  visitId,
  sequence,
  onDragStart,
  children,
}: {
  visitId: string
  sequence?: number
  onDragStart: (e: DragEvent<HTMLElement>, id: string) => void
  children: React.ReactNode
}) {
  const { visit, job, client, property } = visitDetails(visitId)
  const name = client?.display_name ?? 'Customer unavailable'
  return (
    <article
      draggable
      aria-label={`Visit ${name}`}
      onDragStart={(e) => onDragStart(e, visitId)}
      className="cursor-grab space-y-2 rounded-xl border border-(--line) bg-(--paper) p-3 active:cursor-grabbing"
    >
      <div className="flex items-center gap-2 text-[10px] font-bold tracking-wide text-(--ink-3)">
        <GripVertical className="size-3.5" aria-hidden />
        {sequence !== undefined && (
          <span
            aria-label={`Stop ${sequence}`}
            className="flex size-5 items-center justify-center rounded-full bg-(--leaf-900) text-white"
          >
            {sequence}
          </span>
        )}
        <span>{job?.number ?? 'Job'}</span>
        <span className="ml-auto">
          {fmtDuration(visit?.duration_minutes ?? 0)}
        </span>
      </div>
      <h3 className="text-[13px] font-bold">{name}</h3>
      <p className="text-xs text-(--ink-3)">
        {property?.address_line1 ?? 'Address unavailable'}
      </p>
      <p className="text-xs font-semibold text-(--ink-2)">
        {job?.title ?? 'Scheduled service'}
      </p>
      <p className="text-[10px] text-(--ink-3)">
        {visit?.window_start && visit.window_end
          ? `${formatWindow(visit.window_start)}–${formatWindow(visit.window_end)}`
          : 'Flexible arrival'}
      </p>
      {children}
    </article>
  )
}
function MoveControl({
  visitId,
  routes,
  onMove,
}: {
  visitId: string
  routes: Array<RouteTemplate>
  onMove: (visitId: string, routeId: string | null) => void
}) {
  const [target, setTarget] = useState('')
  const name = visitDetails(visitId).client?.display_name ?? 'visit'
  return (
    <div className="flex min-w-0 items-center gap-2">
      <SelectInput
        className="min-w-0 flex-1"
        aria-label={`Move ${name} to route`}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="">Choose route…</option>
        {routes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </SelectInput>
      <Btn
        size="sm"
        variant="ghost"
        disabled={!routes.some((r) => r.id === target)}
        aria-label={`Move ${name} to selected route`}
        onClick={() => onMove(visitId, target)}
      >
        Move
      </Btn>
    </div>
  )
}
function Schematic({
  stops,
  color,
}: {
  stops: Array<DraftStop>
  color: string
}) {
  const points = stops.flatMap((s) => {
    const propertyId = visitDetails(s.visit_id).property?.id
    const position = propertyId ? positions[propertyId] : undefined
    return position ? [{ ...position, sequence: s.sequence, id: s.id }] : []
  })
  return (
    <div
      role="img"
      aria-label={`Illustrative route preview with ${points.length} numbered stops`}
      className="relative mx-4 aspect-[2/1] overflow-hidden rounded-2xl bg-[#e8eedf] "
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <ellipse cx="18" cy="24" rx="17" ry="11" fill="#d3e3c2" />
        <ellipse cx="83" cy="78" rx="19" ry="13" fill="#d3e3c2" />
        <ellipse cx="79" cy="15" rx="10" ry="8" fill="#d3e3c2" />
        <path
          d="M-5 68 C20 56 29 85 53 67 S89 49 105 58"
          fill="none"
          stroke="#c4dceb"
          strokeWidth="6"
        />
        {[15, 35, 55, 75, 92].map((x) => (
          <line
            key={`x${x}`}
            x1={x}
            x2={x}
            y1="0"
            y2="100"
            stroke="#fff"
            strokeWidth="1.4"
          />
        ))}
        {[12, 32, 50, 86].map((y) => (
          <line
            key={`y${y}`}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            stroke="#fff"
            strokeWidth="1.4"
          />
        ))}
        <path d="M0 95 L100 5" stroke="#f6f1df" strokeWidth="4" />
        {!!points.length && (
          <>
            <polyline
              points={`14,49 ${points.map((p) => `${p.x},${p.y}`).join(' ')}`}
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <polyline
              points={`14,49 ${points.map((p) => `${p.x},${p.y}`).join(' ')}`}
              fill="none"
              stroke={color}
              strokeWidth="1"
              strokeLinejoin="round"
              strokeDasharray="2 1"
            />
          </>
        )}
      </svg>
      <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-bold tracking-widest text-(--ink-3) uppercase">
        Schematic · Calgary
      </span>
      <span
        style={{ left: '14%', top: '49%' }}
        className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-(--leaf-900) text-(--lime) shadow-md"
      >
        <Warehouse className="size-4" aria-hidden />
      </span>
      {points.map((p) => (
        <span
          key={p.id}
          style={{ left: `${p.x}%`, top: `${p.y}%`, background: color }}
          className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md"
        >
          {p.sequence}
        </span>
      ))}
      {!points.length && (
        <span className="absolute right-4 bottom-4 left-4 rounded-xl bg-white/90 p-3 text-center text-xs text-(--ink-2)">
          Add stops to sketch your route.
        </span>
      )}
    </div>
  )
}

function formatWindow(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
