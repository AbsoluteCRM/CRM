import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  CalendarPlus,
  Clock,
  HardHat,
  Navigation,
  Sparkles,
  Timer,
} from 'lucide-react'

import PageShell from '#/components/crm/PageShell'
import JobDrawer from '#/components/crm/JobDrawer'
import JobFormModal from '#/components/crm/JobFormModal'
import RouteMap from '#/components/crm/RouteMap'
import {
  buildRoute,
  driveMinutes,
  DEPOT,
  optimizeOrder,
  totalDrive,
} from '#/components/crm/route'
import {
  Btn,
  Card,
  CardHeader,
  ColorDot,
  EmptyState,
  Field,
  SearchInput,
  Segmented,
  SelectInput,
  StatusBadge,
  Tabs,
  TextInput,
  toast,
} from '#/components/crm/ui'
import {
  actions,
  can,
  detectConflicts,
  jobEnd,
  useTenant,
} from '#/components/crm/store'
import {
  addDays,
  fmtDate,
  fmtDuration,
  fmtTime,
  money,
  startOfWeek,
  todayISO,
} from '#/components/crm/format'
import type { Tenant } from '#/components/crm/store'
import type { JobStatus } from '#/components/crm/types'

export const Route = createFileRoute('/_authed/jobs')({
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
  component: JobsPage,
})

type StatusFilter = 'all' | JobStatus
type RangeFilter = 'today' | 'week' | 'upcoming' | 'past30' | 'all'

function JobsPage() {
  const t = useTenant()
  const { id } = Route.useSearch()
  const navigate = useNavigate()
  const [view, setView] = useState<'list' | 'routes'>('list')
  const [creating, setCreating] = useState(false)

  return (
    <PageShell
      kicker="Operations"
      title="Jobs"
      subtitle={
        can.manageJobs(t.role)
          ? 'Track every job from assignment through completion, and plan each crew’s route.'
          : `Jobs assigned to ${t.myCrew?.name ?? 'your crew'}.`
      }
      actions={
        can.manageJobs(t.role) && (
          <Btn icon={CalendarPlus} onClick={() => setCreating(true)}>
            New job
          </Btn>
        )
      }
    >
      <Tabs
        className="mb-5"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'list', label: 'All jobs' },
          { value: 'routes', label: 'Routes & dispatch' },
        ]}
      />
      {view === 'list' ? (
        <JobsList
          t={t}
          onOpen={(jid) => navigate({ to: '/jobs', search: { id: jid } })}
        />
      ) : (
        <Routes
          t={t}
          onOpen={(jid) => navigate({ to: '/jobs', search: { id: jid } })}
        />
      )}
      {id && (
        <JobDrawer
          jobId={id}
          onClose={() => navigate({ to: '/jobs', search: {} })}
        />
      )}
      {creating && <JobFormModal open onClose={() => setCreating(false)} />}
    </PageShell>
  )
}

function JobsList({ t, onOpen }: { t: Tenant; onOpen: (id: string) => void }) {
  const today = todayISO()
  const [status, setStatus] = useState<StatusFilter>('all')
  const [range, setRange] = useState<RangeFilter>('week')
  const [crew, setCrew] = useState('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(60)
  const conflicts = useMemo(
    () => detectConflicts(t.jobs, t.crews, t.members),
    [t.jobs, t.crews, t.members],
  )

  const inRange = (d: string) => {
    if (range === 'today') return d === today
    if (range === 'week')
      return d >= startOfWeek(today) && d <= addDays(startOfWeek(today), 6)
    if (range === 'upcoming') return d >= today
    if (range === 'past30') return d >= addDays(today, -30) && d <= today
    return true
  }

  const base = t.visibleJobs.filter((j) => {
    if (!inRange(j.date)) return false
    if (crew !== 'all' && (crew === 'none' ? j.crew_id : j.crew_id !== crew))
      return false
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return `${j.number} ${t.client(j.client_id)?.display_name} ${t.property(j.property_id)?.address_line1}`
      .toLowerCase()
      .includes(needle)
  })
  const counts: Partial<Record<string, number>> = { all: base.length }
  base.forEach((j) => (counts[j.status] = (counts[j.status] ?? 0) + 1))
  const rows = base
    .filter((j) => status === 'all' || j.status === status)
    .sort((a, b) =>
      range === 'past30'
        ? (b.date + b.start).localeCompare(a.date + a.start)
        : (a.date + a.start).localeCompare(b.date + b.start),
    )

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-(--line) p-4">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search job ID, customer, address"
          className="w-full sm:w-72"
        />
        <SelectInput
          value={range}
          onChange={(e) => setRange(e.target.value as RangeFilter)}
          className="w-40"
          aria-label="Date range"
        >
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="upcoming">Upcoming</option>
          <option value="past30">Last 30 days</option>
          <option value="all">All dates</option>
        </SelectInput>
        {t.role !== 'worker' && (
          <SelectInput
            value={crew}
            onChange={(e) => setCrew(e.target.value)}
            className="w-48"
            aria-label="Crew"
          >
            <option value="all">All crews</option>
            {t.crews
              .filter((c) => c.memberIds.length)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            <option value="none">Unassigned</option>
          </SelectInput>
        )}
      </div>
      <Tabs
        className="px-4 pt-2"
        value={status}
        onChange={setStatus}
        tabs={[
          { value: 'all', label: 'All', count: counts.all ?? 0 },
          {
            value: 'scheduled',
            label: 'Scheduled',
            count: counts.scheduled ?? 0,
          },
          { value: 'assigned', label: 'Assigned', count: counts.assigned ?? 0 },
          {
            value: 'in_progress',
            label: 'In progress',
            count: counts.in_progress ?? 0,
          },
          {
            value: 'completed',
            label: 'Completed',
            count: counts.completed ?? 0,
          },
          {
            value: 'cancelled',
            label: 'Cancelled',
            count: counts.cancelled ?? 0,
          },
        ]}
      />
      <div className="crm-scroll overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
              <th className="px-5 py-3">Job ID</th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Team</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Service</th>
              <th className="px-3 py-3">Status</th>
              {can.viewRevenue(t.role) && (
                <th className="px-5 py-3 text-right">Price</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((j) => {
              const c = t.crew(j.crew_id)
              const conflict = conflicts.get(j.id)
              return (
                <tr
                  key={j.id}
                  onClick={() => onOpen(j.id)}
                  className="cursor-pointer border-t border-(--line) hover:bg-(--cream)"
                >
                  <td className="px-5 py-3 font-bold">
                    <span className="flex items-center gap-1.5">
                      {j.number}
                      {conflict && (
                        <AlertTriangle
                          className="size-3.5 text-(--clay)"
                          aria-label={conflict[0].message}
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold">
                      {t.client(j.client_id)?.display_name}
                    </p>
                    <p className="max-w-[220px] truncate text-xs text-(--ink-3)">
                      {t.property(j.property_id)?.address_line1}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    {c ? (
                      <span className="flex items-center gap-2">
                        <ColorDot color={c.color} /> {c.name}
                      </span>
                    ) : (
                      <span className="text-(--ink-3)">Unassigned</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {j.date === today
                      ? 'Today'
                      : fmtDate(j.date, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                    <span className="block text-xs text-(--ink-3)">
                      {fmtTime(j.start)}–{fmtTime(jobEnd(j))}
                    </span>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-3">
                    {t
                      .jobServices(j)
                      .map((s) => s.name)
                      .join(', ')}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={j.status} />
                  </td>
                  {can.viewRevenue(t.role) && (
                    <td className="px-5 py-3 text-right font-semibold">
                      {money(j.price_cents)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <EmptyState
            icon={HardHat}
            title="No jobs match"
            body="Try another date range or status."
          />
        )}
        {rows.length > limit && (
          <div className="border-t border-(--line) p-4 text-center">
            <Btn
              variant="outline"
              size="sm"
              onClick={() => setLimit((l) => l + 60)}
            >
              Show more ({rows.length - limit} remaining)
            </Btn>
          </div>
        )}
      </div>
    </Card>
  )
}

function Routes({ t, onOpen }: { t: Tenant; onOpen: (id: string) => void }) {
  const crews = t.crews.filter(
    (c) =>
      c.memberIds.length > 0 && (t.role !== 'worker' || c.id === t.myCrew?.id),
  )
  const [crewId, setCrewId] = useState(crews.at(0)?.id ?? '')
  const [date, setDate] = useState(todayISO())
  const crew = t.crew(crewId)
  const dayJobs = t.jobs.filter(
    (j) => j.date === date && j.crew_id === crewId && j.status !== 'cancelled',
  )
  const stops = buildRoute(dayJobs, t.property)
  const drive = totalDrive(stops)
  const work = dayJobs.reduce((s, j) => s + j.durationMinutes, 0)
  const lastStop = stops.at(-1)
  const finish = lastStop ? jobEnd(lastStop.job) : null
  const canOptimize =
    can.manageJobs(t.role) &&
    dayJobs.length > 1 &&
    dayJobs.every((j) => j.status === 'assigned' || j.status === 'scheduled')

  if (!crews.length)
    return (
      <EmptyState
        title="No crews yet"
        body="Create a crew on the Team page to plan routes."
      />
    )

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          {crews.length > 1 && (
            <Segmented
              value={crewId}
              onChange={setCrewId}
              size="sm"
              options={crews.map((c) => ({
                value: c.id,
                label: (
                  <span className="flex items-center gap-1.5">
                    <ColorDot color={c.color} />
                    {c.name.split('·').pop()?.trim()}
                  </span>
                ),
              }))}
            />
          )}
          <Field label="Date" className="ml-auto w-44">
            <TextInput
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </Field>
        </div>
        {stops.length ? (
          <RouteMap stops={stops} color={crew?.color} onSelect={onOpen} />
        ) : (
          <EmptyState
            icon={Navigation}
            title="No stops on this day"
            body="Pick another day, or assign jobs to this crew from the calendar."
          />
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Navigation, label: 'Stops', value: String(stops.length) },
            { icon: Timer, label: 'Drive time', value: fmtDuration(drive) },
            { icon: Clock, label: 'On-site work', value: fmtDuration(work) },
            {
              icon: HardHat,
              label: 'Est. finish',
              value: finish ? fmtTime(finish) : '—',
            },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl bg-(--cream) px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-(--ink-3)">
                <k.icon className="size-3.5" /> {k.label}
              </p>
              <p className="crm-display mt-1 text-xl font-semibold">
                {k.value}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader
          title={crew?.name ?? 'Route'}
          subtitle={fmtDate(date, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          action={
            canOptimize && (
              <Btn
                variant="accent"
                size="sm"
                icon={Sparkles}
                onClick={() => {
                  optimizeOrder(dayJobs, t.property).forEach((o) =>
                    actions.moveJob(o.id, { start: o.start }),
                  )
                  toast('Route re-ordered by shortest drive')
                }}
              >
                Optimize
              </Btn>
            )
          }
        />
        <ol className="flex-1 space-y-0 p-4">
          <li className="flex items-center gap-3 pb-3 text-[13px] text-(--ink-3)">
            <span className="flex size-7 items-center justify-center rounded-lg bg-(--leaf-900) text-[10px] font-bold text-(--lime)">
              YARD
            </span>
            Depart from the yard
          </li>
          {stops.map((s, i) => (
            <li key={s.job.id} className="relative pl-10">
              <span
                className="absolute top-0 bottom-0 left-[13px] w-0.5 bg-(--line)"
                aria-hidden
              />
              <p className="py-1.5 text-[11px] font-semibold text-(--ink-3)">
                ↓ {s.driveFromPrev} min drive
              </p>
              <button
                type="button"
                onClick={() => onOpen(s.job.id)}
                className="relative -ml-10 flex w-[calc(100%+2.5rem)] cursor-pointer items-center gap-3 rounded-2xl border border-(--line) bg-(--paper) p-3 text-left hover:border-(--leaf-500)"
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: crew?.color }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {t.client(s.job.client_id)?.display_name}
                  </span>
                  <span className="block truncate text-xs text-(--ink-3)">
                    {s.property.address_line1}
                  </span>
                  <span className="block truncate text-xs text-(--ink-2)">
                    {t
                      .jobServices(s.job)
                      .map((x) => x.name)
                      .join(', ')}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-xs font-bold">
                    ETA {fmtTime(s.eta)}
                  </span>
                  <StatusBadge status={s.job.status} className="mt-1" />
                </span>
              </button>
            </li>
          ))}
          {lastStop && (
            <li className="pl-10">
              <p className="py-1.5 text-[11px] font-semibold text-(--ink-3)">
                ↓ {driveMinutes(lastStop.property, DEPOT)} min back to the yard
              </p>
            </li>
          )}
        </ol>
      </Card>
    </div>
  )
}
