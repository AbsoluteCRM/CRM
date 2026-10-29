import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Clock3,
  FlaskConical,
  MapPin,
  Navigation,
  Plus,
  RotateCcw,
  Route,
  Truck,
  Warehouse,
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
import { fmtDate, fmtDuration, fmtTime } from '#/components/crm/format'
import {
  crews,
  EXAMPLE_DATE,
  initialDrafts,
  makeRoute,
  makeStops,
  positions,
  visitDetails,
  visits,
} from './mock-data'
import type { DraftRoute, DraftStop } from './mock-data'

type Drafts = Record<
  string,
  { route: DraftRoute; stops: Array<DraftStop> } | undefined
>

export function RouteBuilder({
  initialDate = EXAMPLE_DATE,
}: {
  initialDate?: string
}) {
  const [date, setDate] = useState(initialDate)
  const [crewId, setCrewId] = useState(crews[0].id)
  const [drafts, setDrafts] = useState<Drafts>(initialDrafts)
  const [query, setQuery] = useState('')
  const [feedback, setFeedback] = useState('')
  const crew = crews.find((c) => c.id === crewId) ?? crews[0]
  const route = makeRoute(crew.id, date)
  const stops = drafts[route.id]?.stops ?? []
  const assigned = new Set(
    Object.values(drafts).flatMap((d) =>
      (d?.stops ?? []).map((s) => s.visit_id),
    ),
  )
  const dayVisits = visits.filter((v) => v.scheduled_date === date)
  const available = dayVisits.filter((v) => !assigned.has(v.id))
  const filtered = available.filter((v) => {
    const { job, client, property } = visitDetails(v.id)
    return `${job?.number ?? ''} ${job?.title ?? ''} ${client?.display_name ?? ''} ${property?.address_line1 ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  })
  const workMinutes = stops.reduce(
    (sum, s) => sum + (visitDetails(s.visit_id).visit?.duration_minutes ?? 0),
    0,
  )

  function updateStops(
    change: (ids: Array<string>, current: Drafts) => Array<string>,
  ) {
    setDrafts((current) => {
      const ids = current[route.id]?.stops.map((s) => s.visit_id) ?? []
      return {
        ...current,
        [route.id]: { route, stops: makeStops(route.id, change(ids, current)) },
      }
    })
  }
  function add(visitId: string) {
    updateStops((ids, current) => {
      if (
        Object.values(current).some((d) =>
          d?.stops.some((s) => s.visit_id === visitId),
        ) ||
        !dayVisits.some((v) => v.id === visitId)
      )
        return ids
      return [...ids, visitId]
    })
    setFeedback('Visit added to this local draft.')
  }
  function move(index: number, direction: number) {
    updateStops((ids) => {
      const next = index + direction
      if (next < 0 || next >= ids.length) return ids
      const reordered = [...ids]
      ;[reordered[index], reordered[next]] = [reordered[next], reordered[index]]
      return reordered
    })
    setFeedback('Stop order updated.')
  }
  function reset() {
    setDrafts(initialDrafts())
    setDate(EXAMPLE_DATE)
    setCrewId(crews[0].id)
    setQuery('')
    setFeedback(
      'Demo reset. The original crews, date, and stops have been restored.',
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-(--leaf-300) bg-(--sage) px-4 py-3">
        <div className="flex items-start gap-3">
          <FlaskConical
            className="mt-0.5 size-4 shrink-0 text-(--leaf-600)"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-(--ink-2)">
            <strong className="font-bold text-(--leaf-800)">
              A little room to experiment.
            </strong>{' '}
            This is a mock builder. Changes stay in this page and reset on
            refresh.
          </p>
        </div>
        <Btn variant="ghost" size="sm" icon={RotateCcw} onClick={reset}>
          Reset demo
        </Btn>
      </div>

      <Card className="flex flex-wrap items-end gap-4 p-4 sm:p-5">
        <label className="min-w-0 flex-1 basis-40 text-xs font-bold text-(--ink-2)">
          Route date
          <TextInput
            aria-label="Route date"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value)
                setFeedback('')
              }
            }}
            className="mt-2 min-w-0"
          />
        </label>
        <label className="min-w-0 flex-1 basis-48 text-xs font-bold text-(--ink-2)">
          Assign to crew
          <SelectInput
            aria-label="Assign to crew"
            value={crewId}
            onChange={(e) => {
              setCrewId(e.target.value)
              setFeedback('')
            }}
            className="mt-2"
          >
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </label>
        <div className="flex min-h-10 items-center gap-2 text-xs text-(--ink-3) sm:ml-auto">
          <span className="size-2 rounded-full bg-(--leaf-500)" />
          Local draft · Nothing published
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]">
        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-(--line) p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="crm-display text-xl font-semibold">
                Available jobs
              </h2>
              <span className="rounded-full bg-(--sage) px-2.5 py-1 text-xs font-bold text-(--leaf-700)">
                {available.length}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-(--ink-3)">
              Each stop is one scheduled job visit.
            </p>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search jobs, customers, addresses"
              className="mt-4"
            />
          </div>
          <section aria-label="Available visits" className="space-y-3 p-4">
            {filtered.map((visit) => {
              const { job, client, property } = visitDetails(visit.id)
              return (
                <article
                  key={visit.id}
                  className="rounded-2xl border border-(--line) bg-(--paper) p-4 transition-colors hover:border-(--leaf-300)"
                >
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-bold tracking-wider text-(--ink-3) uppercase">
                    <span>{job?.number ?? 'Job'}</span>
                    <span className="size-1 rounded-full bg-(--line-2)" />
                    <span>Scheduled</span>
                  </div>
                  <h3 className="text-sm font-bold">
                    {client?.display_name ?? 'Customer unavailable'}
                  </h3>
                  <p className="mt-1 flex items-start gap-1 text-xs text-(--ink-3)">
                    <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
                    {property?.address_line1 ?? 'Address unavailable'}
                  </p>
                  <p className="mt-3 text-xs font-semibold text-(--ink-2)">
                    {job?.title ?? 'Scheduled service'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-(--ink-3)">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3" aria-hidden />
                      {fmtDuration(visit.duration_minutes)}
                    </span>
                    <span>
                      {visit.window_start && visit.window_end
                        ? `${formatWindow(visit.window_start)}–${formatWindow(visit.window_end)}`
                        : 'Flexible arrival'}
                    </span>
                  </div>
                  <Btn
                    variant="outline"
                    size="sm"
                    icon={Plus}
                    className="mt-3 w-full"
                    aria-label={`Add ${client?.display_name ?? 'visit'} to route`}
                    onClick={() => add(visit.id)}
                  >
                    Add to route
                  </Btn>
                </article>
              )
            })}
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
                      : 'Switch crews to review their drafts, or remove a stop to make it available again.'
                }
              />
            )}
          </section>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <div className="border-b border-(--line) p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="crm-display text-xl font-semibold">Your route</h2>
              <Badge>Draft</Badge>
            </div>
            <p className="mt-1 text-xs text-(--ink-3)">
              {fmtDate(date, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-(--cream) p-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: crew.color ?? undefined }}
            >
              <Truck className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{crew.name}</p>
              <p className="mt-0.5 text-[11px] text-(--ink-3)">
                {crew.vehicle ?? 'Vehicle not set'}
              </p>
            </div>
          </div>
          <section aria-label="Route draft" className="p-4">
            <div className="mb-4 flex items-center gap-3 text-xs text-(--ink-3)">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-(--leaf-900) text-(--lime)">
                <Warehouse className="size-4" aria-hidden />
              </span>
              <span>
                <strong className="block text-(--ink-2)">
                  Start at the yard
                </strong>
                {fmtTime(crew.default_start_time)} crew start
              </span>
            </div>
            <ol aria-label="Ordered route stops" className="space-y-3">
              {stops.map((stop, i) => {
                const { visit, job, client, property } = visitDetails(
                  stop.visit_id,
                )
                const name = client?.display_name ?? 'Unknown visit'
                return (
                  <li
                    key={stop.id}
                    className="rounded-2xl border border-(--line) bg-(--paper) p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: crew.color ?? undefined }}
                      >
                        {stop.sequence}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold">{name}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-(--ink-3)">
                          {property?.address_line1 ?? 'Address unavailable'}
                        </p>
                        <p className="mt-2 text-xs text-(--ink-2)">
                          {job?.title ?? 'Scheduled service'}
                        </p>
                        <p className="mt-1 text-[11px] text-(--ink-3)">
                          {fmtDuration(visit?.duration_minutes ?? 0)} on site
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-(--line) pt-2">
                      <span className="text-[10px] font-semibold text-(--ink-3)">
                        {job?.number ?? 'Job'}
                      </span>
                      <div className="flex gap-1">
                        <IconBtn
                          icon={ArrowUp}
                          label={`Move ${name} up`}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        />
                        <IconBtn
                          icon={ArrowDown}
                          label={`Move ${name} down`}
                          disabled={i === stops.length - 1}
                          onClick={() => move(i, 1)}
                        />
                        <IconBtn
                          icon={X}
                          label={`Remove ${name} from route`}
                          onClick={() => {
                            updateStops((ids) =>
                              ids.filter((id) => id !== stop.visit_id),
                            )
                            setFeedback('Visit returned to the available pool.')
                          }}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
            {!stops.length && (
              <EmptyState
                icon={Navigation}
                title="Your route starts here"
                body="Add a visit from the job pool. Build the day in the order that works for your crew."
              />
            )}
            {!!stops.length && (
              <p className="mt-4 flex items-center gap-2 text-[11px] text-(--ink-3)">
                <ArrowUpRight className="size-3.5" aria-hidden />
                Use the arrows to arrange your stops.
              </p>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3 border-t border-(--line) bg-(--cream)/50 p-4">
            <div>
              <p className="text-[11px] text-(--ink-3)">Planned stops</p>
              <p
                className="crm-display mt-1 text-2xl font-semibold"
                aria-label={`${stops.length} planned stops`}
              >
                {stops.length.toString().padStart(2, '0')}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-(--ink-3)">On-site work</p>
              <p
                className="crm-display mt-1 text-2xl font-semibold"
                aria-label={`On-site work ${fmtDuration(workMinutes)}`}
              >
                {fmtDuration(workMinutes)}
              </p>
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <div className="p-5">
              <h2 className="crm-display text-xl font-semibold">
                The lay of the land
              </h2>
              <p className="mt-1 text-xs text-(--ink-3)">
                A sketch of your day, stop by stop.
              </p>
            </div>
            <Schematic stops={stops} color={crew.color ?? '#2f7350'} />
            <div className="flex items-center gap-2 px-5 py-4 text-[11px] text-(--ink-3)">
              <span
                className="size-2 rounded-full"
                style={{ background: crew.color ?? undefined }}
              />
              {crew.name}
              <span className="ml-auto">{stops.length} stops</span>
            </div>
          </Card>
          <div className="rounded-2xl border border-(--line) px-5 py-4">
            <p className="flex items-center gap-2 text-xs font-bold text-(--ink-2)">
              <MapPin className="size-3.5" aria-hidden />
              Illustrative preview
            </p>
            <p className="mt-2 text-xs leading-relaxed text-(--ink-3)">
              Locations are schematic. This preview does not provide road
              directions, travel times, or route optimization.
            </p>
          </div>
        </div>
      </div>
      <p role="status" className="min-h-4 text-xs text-(--leaf-700)">
        {feedback}
      </p>
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
      className="relative mx-4 aspect-[4/5] overflow-hidden rounded-2xl bg-[#e8eedf] sm:aspect-square xl:aspect-[4/5]"
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
