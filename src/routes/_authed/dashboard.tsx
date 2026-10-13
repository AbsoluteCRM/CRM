import { useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  HardHat,
  Handshake,
  MessageSquareDiff,
  Receipt,
  UserPlus,
  Users,
} from 'lucide-react'

import PageShell from '#/components/crm/PageShell'
import {
  BarChart,
  CATEGORICAL,
  DonutChart,
  LineChart,
  OTHER_COLOR,
} from '#/components/crm/charts'
import {
  Badge,
  btnClass,
  Card,
  CardHeader,
  ColorDot,
  EmptyState,
  Progress,
  StatusBadge,
} from '#/components/crm/ui'
import {
  WEATHER_LABEL,
  can,
  forecastFor,
  jobEnd,
  useTenant,
} from '#/components/crm/store'
import {
  addDays,
  compactMoney,
  fmtDate,
  fmtLongDate,
  fmtTime,
  fmtWeekday,
  money,
  relativeTime,
  startOfMonth,
  startOfWeek,
  todayISO,
} from '#/components/crm/format'
import type { Tenant } from '#/components/crm/store'
import { WEATHER_ICON } from '#/components/crm/weatherIcons'
import type { ActivityKind, Job } from '#/components/crm/types'
import type { LucideIcon } from 'lucide-react'

export const Route = createFileRoute('/_authed/dashboard')({
  component: DashboardPage,
})

const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  client_created: UserPlus,
  job_completed: CheckCircle2,
  job_scheduled: CalendarPlus,
  request_submitted: MessageSquareDiff,
  request_approved: CheckCircle2,
  request_rejected: MessageSquareDiff,
  crew_assigned: Users,
  invoice_paid: Receipt,
  invoice_sent: Receipt,
  member_invited: UserPlus,
  settings: ClipboardList,
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function earned(jobs: Array<Job>, from: string, to: string) {
  return jobs
    .filter((j) => j.status === 'completed' && j.date >= from && j.date <= to)
    .reduce((s, j) => s + j.price_cents, 0)
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before)
    return <span className="text-xs text-(--cream)/50">no prior data</span>
  const pct = Math.round(((now - before) / before) * 100)
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-(--lime)' : 'text-[#f4b29a]'}`}
    >
      <Icon className="size-3.5" />
      {Math.abs(pct)}% vs last period
    </span>
  )
}

function DashboardPage() {
  const t = useTenant()
  const firstName = t.me?.display_name.split(' ')[0] ?? 'there'
  const today = todayISO()
  const wx = forecastFor(today, t.org.city)
  const WxIcon = WEATHER_ICON[wx.condition]

  return (
    <PageShell
      kicker={fmtLongDate(today)}
      title={`${greeting()}, ${firstName}`}
      subtitle={
        t.role === 'worker'
          ? `Here’s what ${t.myCrew?.name ?? 'your crew'} has on today.`
          : `Here’s how ${t.org.name} is doing today.`
      }
      actions={
        <>
          <span className="hidden items-center gap-2 rounded-full border border-(--line) bg-(--paper) px-3 py-2 text-[13px] font-semibold text-(--ink-2) sm:inline-flex">
            <WxIcon className="size-4 text-(--sky)" /> {wx.high}° ·{' '}
            {WEATHER_LABEL[wx.condition]}
          </span>
          {can.manageRequests(t.role) && (
            <Link
              to="/requests"
              search={{ new: true }}
              className={btnClass('outline')}
            >
              <MessageSquareDiff className="size-4" /> New request
            </Link>
          )}
          {can.manageJobs(t.role) && (
            <Link to="/calendar" search={{ new: true }} className={btnClass()}>
              <CalendarPlus className="size-4" /> Schedule job
            </Link>
          )}
        </>
      }
    >
      {t.role === 'worker' ? <WorkerDay t={t} /> : <OwnerDashboard t={t} />}
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Owner / manager dashboard
// ---------------------------------------------------------------------------

function OwnerDashboard({ t }: { t: Tenant }) {
  const today = todayISO()
  const [range, setRange] = useState<'30d' | '12w'>('30d')
  const showRevenue = can.viewRevenue(t.role)

  const stats = useMemo(() => {
    const jobs = t.jobs
    const weekStart = startOfWeek(today)
    const monthStart = startOfMonth(today)
    const daysIntoWeek = Math.round(
      (Date.parse(today) - Date.parse(weekStart)) / 86_400_000,
    )
    const daysIntoMonth = Number(today.slice(8, 10)) - 1
    const prevMonthStart = startOfMonth(addDays(monthStart, -1))

    const todays = jobs.filter(
      (j) => j.date === today && j.status !== 'cancelled',
    )
    const last30 = addDays(today, -30)
    const recentRequests = t.requests.filter(
      (r) => r.submittedAt.slice(0, 10) >= last30,
    )

    const crewsWithMembers = t.crews.filter((c) => c.memberIds.length > 0)
    const activeCrews = crewsWithMembers.filter((c) =>
      todays.some((j) => j.crew_id === c.id),
    )
    const availableCrews = crewsWithMembers.filter(
      (c) =>
        !todays.some((j) => j.crew_id === c.id && j.status !== 'completed'),
    )

    return {
      revenue: {
        today: earned(jobs, today, today),
        yesterday: earned(jobs, addDays(today, -1), addDays(today, -1)),
        week: earned(jobs, weekStart, today),
        prevWeek: earned(
          jobs,
          addDays(weekStart, -7),
          addDays(weekStart, -7 + daysIntoWeek),
        ),
        month: earned(jobs, monthStart, today),
        prevMonth: earned(
          jobs,
          prevMonthStart,
          addDays(prevMonthStart, daysIntoMonth),
        ),
      },
      jobs: {
        today: todays.length,
        completed: todays.filter((j) => j.status === 'completed').length,
        pending: todays.filter((j) => j.status !== 'completed').length,
        unassigned: jobs.filter(
          (j) => j.date >= today && j.status === 'scheduled',
        ).length,
      },
      requests: {
        new: t.requests.filter((r) => r.status === 'submitted').length,
        approved: recentRequests.filter((r) =>
          ['approved', 'scheduled', 'converted'].includes(r.status),
        ).length,
        rejected: recentRequests.filter((r) => r.status === 'rejected').length,
        open: t.requests.filter((r) =>
          ['submitted', 'reviewing', 'estimated'].includes(r.status),
        ).length,
      },
      clients: {
        total: t.clients.filter((c) => c.status !== 'lead').length,
        newThisMonth: t.clients.filter(
          (c) => c.createdAt.slice(0, 10) >= monthStart,
        ).length,
        leads: t.clients.filter((c) => c.status === 'lead').length,
      },
      teams: {
        active: activeCrews.length,
        available: availableCrews.length,
        total: crewsWithMembers.length,
        people: t.members.filter(
          (m) => m.status === 'active' && m.role === 'worker',
        ).length,
      },
    }
  }, [t, today])

  const trend = useMemo(() => {
    if (range === '30d') {
      return Array.from({ length: 30 }, (_, i) => {
        const d = addDays(today, i - 29)
        return {
          label: fmtDate(d, { month: 'short', day: 'numeric' }),
          value: earned(t.jobs, d, d),
          detail: fmtDate(d, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
        }
      })
    }
    const ws = startOfWeek(today)
    return Array.from({ length: 12 }, (_, i) => {
      const s = addDays(ws, (i - 11) * 7)
      return {
        label: fmtDate(s),
        value: earned(t.jobs, s, addDays(s, 6)),
        detail: `Week of ${fmtDate(s)}`,
      }
    })
  }, [t.jobs, range, today])

  const completedWeekly = useMemo(() => {
    const ws = startOfWeek(today)
    return Array.from({ length: 8 }, (_, i) => {
      const s = addDays(ws, (i - 7) * 7)
      const e = addDays(s, 6)
      return {
        label: i === 7 ? 'This wk' : fmtDate(s),
        value: t.jobs.filter(
          (j) => j.status === 'completed' && j.date >= s && j.date <= e,
        ).length,
        detail: `Week of ${fmtDate(s)}`,
      }
    })
  }, [t.jobs, today])

  const breakdown = useMemo(() => {
    const since = addDays(today, -30)
    const totals = new Map<string, number>()
    t.jobs
      .filter((j) => j.status === 'completed' && j.date >= since)
      .forEach((j) => {
        const share = j.price_cents / j.service_ids.length
        j.service_ids.forEach((id) =>
          totals.set(id, (totals.get(id) ?? 0) + share),
        )
      })
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 4).map(([id, value], i) => ({
      label: t.service(id)?.name ?? 'Service',
      value: Math.round(value),
      color: CATEGORICAL[i],
    }))
    const rest = sorted.slice(4).reduce((s, [, v]) => s + v, 0)
    if (rest > 0)
      top.push({
        label: 'Other services',
        value: Math.round(rest),
        color: OTHER_COLOR,
      })
    return top
  }, [t, today])

  const r = stats.revenue

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* Revenue hero */}
      <section className="crm-rise relative overflow-hidden rounded-[26px] bg-(--leaf-900) p-6 text-(--cream) lg:col-span-8">
        <div
          className="crm-leaf-pattern pointer-events-none absolute inset-0 opacity-50"
          aria-hidden
        />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold tracking-[0.16em] text-(--lime) uppercase">
                Revenue
              </p>
              <p className="mt-1 text-sm text-(--cream)/60">
                Earned from completed jobs
              </p>
            </div>
            <div className="rounded-full bg-white/10 p-1">
              {(['30d', '12w'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRange(k)}
                  className={`h-7 cursor-pointer rounded-full px-3 text-xs font-semibold ${range === k ? 'bg-(--lime) text-(--leaf-950)' : 'text-(--cream)/70 hover:text-(--cream)'}`}
                >
                  {k === '30d' ? '30 days' : '12 weeks'}
                </button>
              ))}
            </div>
          </div>

          {showRevenue ? (
            <>
              <div className="mt-5 grid grid-cols-3 gap-4">
                {[
                  { label: 'Today', now: r.today, before: r.yesterday },
                  { label: 'This week', now: r.week, before: r.prevWeek },
                  { label: 'This month', now: r.month, before: r.prevMonth },
                ].map((k, i) => (
                  <div
                    key={k.label}
                    className={i ? 'border-l border-white/10 pl-4' : ''}
                  >
                    <p className="text-xs font-semibold text-(--cream)/60">
                      {k.label}
                    </p>
                    <p
                      className={`crm-display mt-1 font-semibold ${i === 2 ? 'text-3xl text-(--lime) sm:text-[40px]' : 'text-2xl sm:text-3xl'}`}
                    >
                      {money(k.now)}
                    </p>
                    <Delta now={k.now} before={k.before} />
                  </div>
                ))}
              </div>
              <div className="mt-5">
                {trend.some((d) => d.value > 0) ? (
                  <LineChart
                    data={trend}
                    height={210}
                    color="#c6ef6a"
                    dark
                    format={compactMoney}
                    ariaLabel={`Revenue trend, ${range === '30d' ? 'last 30 days' : 'last 12 weeks'}`}
                  />
                ) : (
                  <div className="flex h-[210px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 text-center">
                    <p className="text-sm font-semibold">No revenue yet</p>
                    <p className="mt-1 max-w-xs text-xs text-(--cream)/60">
                      Your trend appears here as soon as the first jobs are
                      marked complete.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="mt-6 text-sm text-(--cream)/70">
              Revenue is visible to owners and managers.
            </p>
          )}
        </div>
      </section>

      {/* Weather */}
      <WeatherCard t={t} />

      {/* KPI groups */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-12 xl:grid-cols-4">
        <KpiGroup
          icon={HardHat}
          title="Jobs"
          to="/jobs"
          stats={[
            { label: 'Scheduled today', value: stats.jobs.today },
            { label: 'Completed today', value: stats.jobs.completed },
            { label: 'Pending', value: stats.jobs.pending },
          ]}
          footer={
            <div>
              <div className="mb-1.5 flex justify-between text-xs text-(--ink-3)">
                <span>Today’s progress</span>
                <span className="font-semibold text-(--ink)">
                  {stats.jobs.completed}/{stats.jobs.today}
                </span>
              </div>
              <Progress
                value={
                  stats.jobs.today
                    ? (stats.jobs.completed / stats.jobs.today) * 100
                    : 0
                }
              />
            </div>
          }
        />
        <KpiGroup
          icon={MessageSquareDiff}
          title="Requests"
          to="/requests"
          stats={[
            {
              label: 'New',
              value: stats.requests.new,
              highlight: stats.requests.new > 0,
            },
            { label: 'Approved', value: stats.requests.approved },
            { label: 'Rejected', value: stats.requests.rejected },
          ]}
          footer={
            <p className="text-xs text-(--ink-3)">
              {stats.requests.open} open in the pipeline · last 30 days
            </p>
          }
        />
        <KpiGroup
          icon={Handshake}
          title="Clients"
          to="/clients"
          stats={[
            { label: 'Total clients', value: stats.clients.total },
            { label: 'New this month', value: stats.clients.newThisMonth },
          ]}
          footer={
            <p className="text-xs text-(--ink-3)">
              {stats.clients.leads} leads waiting to convert
            </p>
          }
        />
        <KpiGroup
          icon={Users}
          title="Teams"
          to="/teams"
          stats={[
            { label: 'Active crews', value: stats.teams.active },
            { label: 'Available crews', value: stats.teams.available },
          ]}
          footer={
            <p className="text-xs text-(--ink-3)">
              {stats.teams.people} field staff across {stats.teams.total} crews
            </p>
          }
        />
      </div>

      {/* Charts */}
      <Card className="lg:col-span-6">
        <CardHeader title="Jobs completed" subtitle="Per week, last 8 weeks" />
        <div className="px-4 pt-3 pb-4">
          {completedWeekly.some((d) => d.value > 0) ? (
            <BarChart
              data={completedWeekly}
              highlightIndex={7}
              color="#9cc8a8"
              highlightColor="#1f8a4c"
              ariaLabel="Jobs completed per week"
            />
          ) : (
            <EmptyState
              title="No completed jobs yet"
              body="Weekly completions show up here once crews start finishing work."
            />
          )}
        </div>
      </Card>
      <Card className="lg:col-span-6">
        <CardHeader
          title="Services breakdown"
          subtitle="Share of revenue, last 30 days"
        />
        <div className="px-5 pt-4 pb-5">
          {breakdown.length ? (
            <DonutChart
              data={breakdown}
              format={(v) => (showRevenue ? compactMoney(v) : '')}
              centerLabel="30-day total"
              centerValue={
                showRevenue
                  ? compactMoney(breakdown.reduce((s, d) => s + d.value, 0))
                  : '—'
              }
            />
          ) : (
            <EmptyState
              title="No completed jobs yet"
              body="Completed work will show up here by service."
            />
          )}
        </div>
      </Card>

      {/* Today + activity */}
      <TodayByCrew t={t} />
      <ActivityFeed t={t} />
    </div>
  )
}

function KpiGroup({
  icon: Icon,
  title,
  to,
  stats,
  footer,
}: {
  icon: LucideIcon
  title: string
  to: '/jobs' | '/requests' | '/clients' | '/teams'
  stats: Array<{ label: string; value: number; highlight?: boolean }>
  footer?: React.ReactNode
}) {
  return (
    <Card className="crm-rise flex flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-(--lime-100) text-(--leaf-700)">
            <Icon className="size-[18px]" />
          </span>
          <h3 className="text-[15px] font-bold">{title}</h3>
        </div>
        <Link
          to={to}
          aria-label={`Open ${title}`}
          className="flex size-8 items-center justify-center rounded-full text-(--ink-3) no-underline hover:bg-(--sage) hover:text-(--ink)"
        >
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <div
        className={`mt-4 grid gap-3 ${stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
      >
        {stats.map((s) => (
          <div key={s.label}>
            <p
              className={`crm-display text-[28px] leading-none font-semibold ${s.highlight ? 'text-(--leaf-600)' : 'text-(--ink)'}`}
            >
              {s.value}
            </p>
            <p className="mt-1.5 text-xs leading-tight text-(--ink-3)">
              {s.label}
            </p>
          </div>
        ))}
      </div>
      {footer && <div className="mt-auto pt-4">{footer}</div>}
    </Card>
  )
}

function WeatherCard({ t }: { t: Tenant }) {
  const today = todayISO()
  const days = Array.from({ length: 5 }, (_, i) =>
    forecastFor(addDays(today, i), t.org.city),
  )
  const now = days[0]
  const NowIcon = WEATHER_ICON[now.condition]
  return (
    <Card className="crm-rise flex flex-col overflow-hidden lg:col-span-4">
      <div className="bg-gradient-to-br from-(--sky-100) to-(--paper) p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-(--sky) uppercase">
              Weather · {t.org.city}
            </p>
            <p className="crm-display mt-2 text-5xl font-semibold">
              {now.high}°
            </p>
            <p className="mt-1 text-sm text-(--ink-2)">
              {WEATHER_LABEL[now.condition]} · Low {now.low}° · Wind {now.wind}{' '}
              km/h
            </p>
          </div>
          <NowIcon className="size-14 text-(--sky)" strokeWidth={1.4} />
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2">
          {days.slice(1).map((d) => {
            const I = WEATHER_ICON[d.condition]
            const alert = d.condition === 'rain' || d.condition === 'snow'
            return (
              <div
                key={d.date}
                className={`rounded-2xl px-2 py-2.5 text-center ${alert ? 'bg-(--paper) ring-1 ring-(--sky)/30' : 'bg-white/60'}`}
              >
                <p className="text-[11px] font-semibold text-(--ink-3)">
                  {fmtWeekday(d.date)}
                </p>
                <I className="mx-auto my-1.5 size-5 text-(--sky)" />
                <p className="text-[13px] font-bold">{d.high}°</p>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-2 text-[11px] font-bold tracking-wider text-(--ink-3) uppercase">
          Outdoor work ahead
        </p>
        <ul className="space-y-1.5">
          {days.slice(1).map((d) => {
            const I = WEATHER_ICON[d.condition]
            const count = t.jobs.filter(
              (j) =>
                j.date === d.date &&
                (j.status === 'assigned' || j.status === 'scheduled'),
            ).length
            const alert = d.condition === 'rain' || d.condition === 'snow'
            return (
              <li
                key={d.date}
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-(--cream)"
              >
                <I className="size-4 shrink-0 text-(--sky)" />
                <span className="w-10 font-semibold">{fmtWeekday(d.date)}</span>
                <span className="w-12 text-xs text-(--ink-3)">{d.precip}%</span>
                <span className="flex-1 text-(--ink-2)">
                  {count} job{count === 1 ? '' : 's'}
                </span>
                {alert && count > 0 && (
                  <Badge tone="sky">
                    {d.condition === 'snow'
                      ? 'Offer snow removal'
                      : 'Review lawn jobs'}
                  </Badge>
                )}
              </li>
            )
          })}
        </ul>
        <Link
          to="/calendar"
          className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-semibold text-(--leaf-700) no-underline"
        >
          Open weather planner <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  )
}

function TodayByCrew({ t }: { t: Tenant }) {
  const today = todayISO()
  const crews = t.crews.filter((c) => c.memberIds.length > 0)
  const unassigned = t.jobs.filter(
    (j) => j.date === today && !j.crew_id && j.status !== 'cancelled',
  )
  return (
    <Card className="lg:col-span-8">
      <CardHeader
        title="Today’s crews"
        subtitle="Live progress by crew"
        action={
          <Link to="/calendar" className={btnClass('ghost', 'sm')}>
            Dispatch board <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {crews.length === 0 && (
          <EmptyState
            className="sm:col-span-2"
            icon={Users}
            title="No crews yet"
            body="Build your first crew on the Team page."
          />
        )}
        {crews.map((crew) => {
          const jobs = t.jobs
            .filter(
              (j) =>
                j.date === today &&
                j.crew_id === crew.id &&
                j.status !== 'cancelled',
            )
            .sort((a, b) => a.start.localeCompare(b.start))
          const done = jobs.filter((j) => j.status === 'completed').length
          const current =
            jobs.find((j) => j.status === 'in_progress') ??
            jobs.find((j) => j.status !== 'completed')
          return (
            <div
              key={crew.id}
              className="rounded-2xl border border-(--line) bg-(--cream)/50 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ColorDot color={crew.color} />
                  <p className="truncate text-sm font-bold">{crew.name}</p>
                </div>
                <span className="text-xs font-semibold text-(--ink-3)">
                  {done}/{jobs.length} done
                </span>
              </div>
              <Progress
                className="mt-3"
                value={jobs.length ? (done / jobs.length) * 100 : 0}
                color={crew.color}
              />
              {current ? (
                <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {t.client(current.client_id)?.display_name}
                    </p>
                    <p className="truncate text-xs text-(--ink-3)">
                      {fmtTime(current.start)}–{fmtTime(jobEnd(current))} ·{' '}
                      {t
                        .jobServices(current)
                        .map((s) => s.name)
                        .join(', ')}
                    </p>
                  </div>
                  <StatusBadge status={current.status} />
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-(--ink-3)">
                  {jobs.length
                    ? 'All jobs complete for today.'
                    : 'No jobs today. Available for dispatch.'}
                </p>
              )}
            </div>
          )
        })}
        {unassigned.length > 0 && (
          <Link
            to="/calendar"
            className="flex items-center justify-between rounded-2xl border border-dashed border-(--sun) bg-(--sun-100) p-4 text-[13px] font-semibold text-(--ink) no-underline sm:col-span-2"
          >
            {unassigned.length} job{unassigned.length === 1 ? '' : 's'} today
            still need a crew
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </Card>
  )
}

function ActivityFeed({ t }: { t: Tenant }) {
  return (
    <Card className="lg:col-span-4">
      <CardHeader title="Recent activity" subtitle="Across your workspace" />
      <ol className="relative space-y-1 p-3">
        {t.activity.slice(0, 9).map((a) => {
          const Icon = ACTIVITY_ICON[a.kind]
          return (
            <li
              key={a.id}
              className="flex gap-3 rounded-xl px-2 py-2 hover:bg-(--cream)"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--sage) text-(--leaf-700)">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] leading-snug text-(--ink)">
                  {a.text}
                </p>
                <p className="mt-0.5 text-[11px] text-(--ink-3)">
                  {a.actor} · {relativeTime(a.at)}
                </p>
              </div>
            </li>
          )
        })}
        {t.activity.length === 0 && (
          <EmptyState
            title="Nothing yet"
            body="Activity from your team shows up here."
          />
        )}
      </ol>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Contractor view
// ---------------------------------------------------------------------------

function WorkerDay({ t }: { t: Tenant }) {
  const today = todayISO()
  const mine = t.visibleJobs
  const todayJobs = mine
    .filter((j) => j.date === today && j.status !== 'cancelled')
    .sort((a, b) => a.start.localeCompare(b.start))
  const upcoming = mine
    .filter((j) => j.date > today && j.status !== 'cancelled')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, 6)
  const done = todayJobs.filter((j) => j.status === 'completed').length
  const weekDone = mine.filter(
    (j) => j.status === 'completed' && j.date >= startOfWeek(today),
  ).length

  return (
    <div className="grid items-start gap-5 lg:grid-cols-12">
      <section className="relative overflow-hidden rounded-[26px] bg-(--leaf-900) p-6 text-(--cream) lg:col-span-8">
        <div
          className="crm-leaf-pattern pointer-events-none absolute inset-0 opacity-50"
          aria-hidden
        />
        <div className="relative">
          <p className="text-[11px] font-bold tracking-[0.16em] text-(--lime) uppercase">
            My day · {t.myCrew?.name}
          </p>
          <p className="crm-display mt-2 text-4xl font-semibold">
            {done} of {todayJobs.length} jobs done
          </p>
          <Progress
            className="mt-4 bg-white/10"
            value={todayJobs.length ? (done / todayJobs.length) * 100 : 0}
            color="#c6ef6a"
          />
          <ol className="mt-5 space-y-2">
            {todayJobs.map((j, i) => (
              <li key={j.id}>
                <Link
                  to="/jobs"
                  search={{ id: j.id }}
                  className="flex items-center gap-3 rounded-2xl bg-white/6 px-4 py-3 text-(--cream) no-underline hover:bg-white/10"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--lime) text-xs font-bold text-(--leaf-950)">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {t.client(j.client_id)?.display_name}
                    </span>
                    <span className="block truncate text-xs text-(--cream)/60">
                      {fmtTime(j.start)} ·{' '}
                      {t.property(j.property_id)?.address_line1} ·{' '}
                      {t
                        .jobServices(j)
                        .map((s) => s.name)
                        .join(', ')}
                    </span>
                  </span>
                  <StatusBadge status={j.status} />
                </Link>
              </li>
            ))}
            {todayJobs.length === 0 && (
              <p className="text-sm text-(--cream)/70">
                No jobs assigned today.
              </p>
            )}
          </ol>
        </div>
      </section>
      <div className="flex flex-col gap-5 lg:col-span-4">
        <WeatherCard t={t} />
        <Card className="p-5">
          <p className="text-xs font-semibold text-(--ink-3)">
            Completed this week
          </p>
          <p className="crm-display mt-1 text-4xl font-semibold">{weekDone}</p>
          <p className="mt-1 text-xs text-(--ink-3)">
            Rating {t.me?.rating.toFixed(1)} <Badge tone="lime">Top crew</Badge>
          </p>
        </Card>
      </div>
      <Card className="lg:col-span-12">
        <CardHeader title="Coming up" subtitle="Next assigned jobs" />
        <div className="divide-y divide-(--line) px-5 pb-3">
          {upcoming.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {t.client(j.client_id)?.display_name}
                </p>
                <p className="truncate text-xs text-(--ink-3)">
                  {fmtDate(j.date, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  · {fmtTime(j.start)} ·{' '}
                  {t
                    .jobServices(j)
                    .map((s) => s.name)
                    .join(', ')}
                </p>
              </div>
              <StatusBadge status={j.status} />
            </div>
          ))}
          {upcoming.length === 0 && <EmptyState title="Nothing upcoming" />}
        </div>
      </Card>
    </div>
  )
}
