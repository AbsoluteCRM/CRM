import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Award,
  BadgeCheck,
  CalendarOff,
  Clock,
  Crown,
  GripVertical,
  Mail,
  Phone,
  Plus,
  Star,
  Truck,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

import PageShell from '#/components/crm/PageShell'
import {
  Avatar,
  Badge,
  Btn,
  Card,
  CardHeader,
  CheckPill,
  ColorDot,
  Drawer,
  EmptyState,
  Field,
  IconBtn,
  Modal,
  Progress,
  SearchInput,
  SelectInput,
  StatusBadge,
  Tabs,
  TextInput,
  toast,
} from '#/components/crm/ui'
import {
  AVAILABILITY_LABEL,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  actions,
  can,
  memberAvailability,
  useTenant,
} from '#/components/crm/store'
import {
  addDays,
  fmtDate,
  fmtTime,
  fmtWeekday,
  isWeekend,
  todayISO,
} from '#/components/crm/format'
import { cn } from '#/lib/utils'
import type { Availability, Tenant } from '#/components/crm/store'
import type { Member, OrgRole, TimeOff, Weekday } from '#/components/crm/types'

export const Route = createFileRoute('/_authed/teams')({
  component: TeamsPage,
})

type Tab = 'members' | 'crews' | 'availability' | 'performance'
const WEEKDAYS: Array<[Weekday, string]> = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
]
const CREW_COLORS = [
  '#7fb547',
  '#5b9bc4',
  '#e0a03c',
  '#b0759c',
  '#8a8f6a',
  '#4fa3a5',
  '#d9734e',
]

const AVAIL_STYLE: Record<Availability, string> = {
  available: 'bg-(--lime-200) text-(--leaf-900)',
  off_day: 'bg-(--cream-2) text-(--ink-3)',
  vacation: 'bg-(--sky-100) text-(--sky)',
  sick: 'bg-(--clay-100) text-(--clay)',
  personal: 'bg-(--violet-100) text-(--violet)',
}

function useMetrics(t: Tenant) {
  return useMemo(() => {
    const since = addDays(todayISO(), -90)
    const map = new Map<string, { jobs: number; hours: number }>()
    t.members.forEach((m) => {
      const crew = t.crews.find((c) => c.memberIds.includes(m.id))
      const jobs = crew
        ? t.jobs.filter(
            (j) =>
              j.crew_id === crew.id &&
              j.status === 'completed' &&
              j.date >= since,
          )
        : []
      map.set(m.id, {
        jobs: jobs.length,
        hours: Math.round(jobs.reduce((s, j) => s + j.durationMinutes, 0) / 60),
      })
    })
    return map
  }, [t])
}

function TeamsPage() {
  const t = useTenant()
  const [tab, setTab] = useState<Tab>('members')
  const [inviting, setInviting] = useState(false)
  const [profile, setProfile] = useState<string | null>(null)
  const [timeOffFor, setTimeOffFor] = useState<{
    memberId?: string
    date?: string
  } | null>(null)
  const editable = can.manageTeam(t.role)
  const active = t.members.filter((m) => m.status === 'active')

  return (
    <PageShell
      kicker="Workforce"
      title="Team"
      subtitle="Manage employees, build crews, track availability, and see how everyone is performing."
      allowed={can.viewTeam(t.role)}
      section="Team"
      actions={
        editable && (
          <>
            <Btn
              variant="outline"
              icon={CalendarOff}
              onClick={() => setTimeOffFor({})}
            >
              Add time off
            </Btn>
            <Btn icon={UserPlus} onClick={() => setInviting(true)}>
              Invite member
            </Btn>
          </>
        )
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Team members',
            value: active.length,
            sub: `${t.members.filter((m) => m.status === 'invited').length} invited`,
          },
          {
            label: 'Crews',
            value: t.crews.filter((c) => c.memberIds.length).length,
            sub: `${t.crews.filter((c) => !c.memberIds.length).length} without members`,
          },
          {
            label: 'Out today',
            value: active.filter(
              (m) =>
                !['available', 'off_day'].includes(
                  memberAvailability(m, todayISO()),
                ),
            ).length,
            sub: 'Vacation, sick, or time off',
          },
          {
            label: 'Avg. rating',
            value: (
              active.filter((m) => m.rating).reduce((s, m) => s + m.rating, 0) /
              Math.max(1, active.filter((m) => m.rating).length)
            ).toFixed(1),
            sub: 'Customer feedback',
          },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs font-semibold text-(--ink-3)">{k.label}</p>
            <p className="crm-display mt-1 text-2xl font-semibold">{k.value}</p>
            <p className="mt-0.5 text-xs text-(--ink-3)">{k.sub}</p>
          </Card>
        ))}
      </div>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'members', label: 'Team list', count: t.members.length },
          { value: 'crews', label: 'Crew builder', count: t.crews.length },
          { value: 'availability', label: 'Availability' },
          { value: 'performance', label: 'Performance' },
        ]}
      />

      {tab === 'members' && <MembersTab t={t} onOpen={setProfile} />}
      {tab === 'crews' && (
        <CrewBuilder t={t} editable={editable} onOpen={setProfile} />
      )}
      {tab === 'availability' && (
        <AvailabilityTab t={t} editable={editable} onAdd={setTimeOffFor} />
      )}
      {tab === 'performance' && <PerformanceTab t={t} onOpen={setProfile} />}

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {profile && t.member(profile) && (
        <MemberProfile
          t={t}
          member={t.member(profile)!}
          editable={editable}
          onClose={() => setProfile(null)}
          onAddTimeOff={() => setTimeOffFor({ memberId: profile })}
        />
      )}
      {timeOffFor && (
        <TimeOffModal
          t={t}
          defaults={timeOffFor}
          onClose={() => setTimeOffFor(null)}
        />
      )}
    </PageShell>
  )
}

// ---------------------------------------------------------------------------

function currentAssignment(t: Tenant, m: Member) {
  const today = todayISO()
  const avail = memberAvailability(m, today)
  if (m.status === 'invited')
    return { text: 'Invitation pending', sub: m.email }
  if (avail !== 'available')
    return {
      text: AVAILABILITY_LABEL[avail],
      sub:
        m.timeOff.find((x) => x.start <= today && x.end >= today)?.note ??
        (avail === 'off_day' ? 'Not a scheduled work day' : ''),
    }
  const crew = t.crews.find((c) => c.memberIds.includes(m.id))
  if (!crew)
    return {
      text: m.role === 'worker' ? 'Not on a crew' : ROLE_LABEL[m.role],
      sub: m.role === 'worker' ? 'Add them in the crew builder' : 'Office',
    }
  const jobs = t.jobs
    .filter(
      (j) =>
        j.crew_id === crew.id && j.date === today && j.status !== 'cancelled',
    )
    .sort((a, b) => a.start.localeCompare(b.start))
  const now =
    jobs.find((j) => j.status === 'in_progress') ??
    jobs.find((j) => j.status === 'assigned')
  if (now)
    return {
      text: `${now.status === 'in_progress' ? 'On site' : 'Next'}: ${t.client(now.client_id)?.display_name}`,
      sub: `${crew.name} · ${fmtTime(now.start)}`,
    }
  return {
    text: crew.name,
    sub: jobs.length ? 'Done for today' : 'No jobs today',
  }
}

function MembersTab({
  t,
  onOpen,
}: {
  t: Tenant
  onOpen: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all' | OrgRole>('all')
  const rows = t.members
    .filter(
      (m) =>
        (role === 'all' || m.role === role) &&
        `${m.display_name} ${m.email} ${m.title}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    )
    .sort(
      (a, b) =>
        ['owner', 'admin', 'dispatcher', 'worker'].indexOf(a.role) -
          ['owner', 'admin', 'dispatcher', 'worker'].indexOf(b.role) ||
        a.display_name.localeCompare(b.display_name),
    )
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-(--line) p-4">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search team"
          className="w-full sm:w-72"
        />
        <SelectInput
          value={role}
          onChange={(e) => setRole(e.target.value as 'all' | OrgRole)}
          className="w-44"
          aria-label="Role"
        >
          <option value="all">All roles</option>
          {(Object.keys(ROLE_LABEL) as Array<OrgRole>).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </SelectInput>
      </div>
      <div className="crm-scroll overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
              <th className="px-5 py-3">Name</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-5 py-3">Current assignment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const crew = t.crews.find((c) => c.memberIds.includes(m.id))
              const a = currentAssignment(t, m)
              return (
                <tr
                  key={m.id}
                  onClick={() => onOpen(m.id)}
                  className="cursor-pointer border-t border-(--line) hover:bg-(--cream)"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={m.display_name}
                        color={
                          crew?.color
                            ? `color-mix(in oklab, ${crew.color} 45%, white)`
                            : undefined
                        }
                        size={36}
                      />
                      <div>
                        <p className="font-bold">{m.display_name}</p>
                        <p className="text-xs text-(--ink-3)">{m.title}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      tone={
                        m.role === 'owner'
                          ? 'dark'
                          : m.role === 'worker'
                            ? 'gray'
                            : 'lime'
                      }
                    >
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-semibold">{a.text}</p>
                    <p className="text-xs text-(--ink-3)">{a.sub}</p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Crew builder
// ---------------------------------------------------------------------------

function MemberCard({
  m,
  crewLead,
  editable,
  onOpen,
}: {
  m: Member
  crewLead?: boolean
  editable: boolean
  onOpen: (id: string) => void
}) {
  const avail = memberAvailability(m, todayISO())
  return (
    <div
      draggable={editable}
      onDragStart={(e) => e.dataTransfer.setData('text/member-id', m.id)}
      onClick={() => onOpen(m.id)}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-xl border border-(--line) bg-(--paper) p-2 hover:border-(--leaf-500)',
        editable && 'active:cursor-grabbing',
      )}
    >
      {editable && <GripVertical className="size-4 shrink-0 text-(--ink-3)" />}
      <Avatar name={m.display_name} size={30} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-[13px] font-bold">
          {m.display_name}
          {crewLead && (
            <Crown className="size-3.5 text-(--sun)" aria-label="Crew lead" />
          )}
        </p>
        <p className="truncate text-[11px] text-(--ink-3)">
          {m.status === 'invited' ? 'Invited' : m.title}
        </p>
      </div>
      {avail !== 'available' && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            AVAIL_STYLE[avail],
          )}
        >
          {AVAILABILITY_LABEL[avail]}
        </span>
      )}
    </div>
  )
}

function CrewColumn({
  t,
  crew,
  editable,
  onOpen,
}: {
  t: Tenant
  crew: Tenant['crews'][number] | null
  editable: boolean
  onOpen: (id: string) => void
}) {
  const [over, setOver] = useState(false)
  const workers = t.members.filter(
    (m) => m.role === 'worker' && m.status !== 'disabled',
  )
  const members = crew
    ? crew.memberIds.map((id) => t.member(id)).filter((m): m is Member => !!m)
    : workers.filter((m) => !t.crews.some((c) => c.memberIds.includes(m.id)))
  const todayJobs = crew
    ? t.jobs.filter(
        (j) =>
          j.crew_id === crew.id &&
          j.date === todayISO() &&
          j.status !== 'cancelled',
      ).length
    : 0

  return (
    <div
      onDragOver={(e) => {
        if (editable && e.dataTransfer.types.includes('text/member-id')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData('text/member-id')
        if (!id) return
        actions.moveMemberToCrew(id, crew?.id ?? null)
        toast(`${t.member(id)?.display_name} → ${crew?.name ?? 'Unassigned'}`)
      }}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-[22px] border p-3 transition-colors',
        crew
          ? 'border-(--line) bg-(--paper)'
          : 'border-dashed border-(--line-2) bg-(--cream)',
        over && 'border-(--leaf-500) bg-(--lime-100)',
      )}
    >
      <div className="mb-3 px-1">
        {crew ? (
          <>
            <div className="flex items-center gap-2">
              <ColorDot color={crew.color} className="size-3" />
              {editable ? (
                <input
                  defaultValue={crew.name}
                  aria-label="Crew name"
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value !== crew.name &&
                    actions.updateCrew(crew.id, { name: e.target.value.trim() })
                  }
                  className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-[15px] font-bold outline-none focus:bg-(--cream)"
                />
              ) : (
                <p className="text-[15px] font-bold">{crew.name}</p>
              )}
            </div>
            <p className="mt-1 flex items-center gap-3 px-1 text-xs text-(--ink-3)">
              <span className="flex items-center gap-1">
                <Users className="size-3" /> {members.length}
              </span>
              <span>{todayJobs} jobs today</span>
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold">Unassigned</p>
            <p className="mt-1 text-xs text-(--ink-3)">
              Drag people onto a crew
            </p>
          </>
        )}
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {members.map((m) => (
          <MemberCard
            key={m.id}
            m={m}
            crewLead={crew?.leadId === m.id}
            editable={editable}
            onOpen={onOpen}
          />
        ))}
        {members.length === 0 && (
          <p className="rounded-xl border border-dashed border-(--line-2) px-3 py-6 text-center text-xs text-(--ink-3)">
            Drop team members here
          </p>
        )}
      </div>
      {crew && editable && (
        <div className="mt-3 space-y-2 border-t border-(--line) pt-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-(--ink-3)">
            <Crown className="size-3.5" />
            <select
              value={crew.leadId ?? ''}
              onChange={(e) =>
                actions.updateCrew(crew.id, { leadId: e.target.value || null })
              }
              className="flex-1 cursor-pointer rounded-lg bg-(--cream) px-2 py-1.5 text-[13px] text-(--ink) outline-none"
              aria-label="Crew lead"
            >
              <option value="">No lead</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-(--ink-3)">
            <Truck className="size-3.5" />
            <input
              defaultValue={crew.vehicle ?? ''}
              placeholder="Assign a vehicle"
              aria-label="Crew vehicle"
              onBlur={(e) =>
                e.target.value !== (crew.vehicle ?? '') &&
                actions.updateCrew(crew.id, { vehicle: e.target.value || null })
              }
              className="flex-1 rounded-lg bg-(--cream) px-2 py-1.5 text-[13px] text-(--ink) outline-none"
            />
          </label>
        </div>
      )}
    </div>
  )
}

function CrewBuilder({
  t,
  editable,
  onOpen,
}: {
  t: Tenant
  editable: boolean
  onOpen: (id: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <div>
      {editable && (
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            actions.addCrew(
              name.trim(),
              CREW_COLORS[t.crews.length % CREW_COLORS.length],
            )
            toast(`${name.trim()} created`)
            setName('')
          }}
        >
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New crew name, e.g. Crew F"
            className="w-64"
            aria-label="New crew name"
          />
          <Btn
            type="submit"
            variant="outline"
            icon={Plus}
            disabled={!name.trim()}
          >
            Create crew
          </Btn>
          <p className="text-xs text-(--ink-3)">
            Drag people between columns to build crews. Each crew gets a lead
            and a vehicle.
          </p>
        </form>
      )}
      <div className="crm-scroll flex gap-4 overflow-x-auto pb-3">
        <CrewColumn t={t} crew={null} editable={editable} onOpen={onOpen} />
        {t.crews.map((c) => (
          <CrewColumn
            key={c.id}
            t={t}
            crew={c}
            editable={editable}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

function AvailabilityTab({
  t,
  editable,
  onAdd,
}: {
  t: Tenant
  editable: boolean
  onAdd: (d: { memberId?: string; date?: string }) => void
}) {
  const today = todayISO()
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  const people = t.members.filter((m) => m.status === 'active')
  const upcoming = people
    .flatMap((m) =>
      m.timeOff.filter((x) => x.end >= today).map((x) => ({ m, x })),
    )
    .sort((a, b) => a.x.start.localeCompare(b.x.start))

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          title="Next 14 days"
          subtitle={editable ? 'Click a day to record time off.' : undefined}
        />
        <div className="crm-scroll overflow-x-auto p-4">
          <table className="w-full min-w-[860px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="w-44" />
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      'rounded-lg py-1 font-semibold',
                      d === today
                        ? 'bg-(--leaf-900) text-(--lime)'
                        : 'text-(--ink-3)',
                    )}
                  >
                    {fmtWeekday(d).slice(0, 2)}
                    <span className="block text-[13px] font-bold">
                      {fmtDate(d, { day: 'numeric' })}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((m) => (
                <tr key={m.id}>
                  <td className="truncate pr-2 text-[13px] font-semibold">
                    {m.display_name}
                  </td>
                  {days.map((d) => {
                    const a = memberAvailability(m, d)
                    return (
                      <td key={d}>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => onAdd({ memberId: m.id, date: d })}
                          title={`${m.display_name}: ${AVAILABILITY_LABEL[a]} on ${fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                          className={cn(
                            'h-8 w-full rounded-lg text-[10px] font-bold',
                            AVAIL_STYLE[a],
                            editable &&
                              'cursor-pointer hover:ring-2 hover:ring-(--leaf-500)',
                            isWeekend(d) && a === 'off_day' && 'opacity-60',
                          )}
                        >
                          {a === 'available'
                            ? ''
                            : a === 'off_day'
                              ? '–'
                              : AVAILABILITY_LABEL[a].slice(0, 3)}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-(--ink-2)">
            {(Object.keys(AVAIL_STYLE) as Array<Availability>).map((a) => (
              <span key={a} className="flex items-center gap-1.5">
                <span className={cn('size-3 rounded', AVAIL_STYLE[a])} />{' '}
                {AVAILABILITY_LABEL[a]}
              </span>
            ))}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Upcoming time off"
          subtitle="Vacation, sick days, and personal time"
        />
        <ul className="space-y-2 p-4">
          {upcoming.length === 0 && (
            <EmptyState icon={CalendarOff} title="Nobody is away" />
          )}
          {upcoming.map(({ m, x }) => (
            <li
              key={x.id}
              className="flex items-center gap-3 rounded-2xl border border-(--line) p-3"
            >
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-bold',
                  AVAIL_STYLE[x.kind],
                )}
              >
                {AVAILABILITY_LABEL[x.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">
                  {m.display_name}
                </p>
                <p className="text-xs text-(--ink-3)">
                  {fmtDate(x.start)}
                  {x.end !== x.start && ` – ${fmtDate(x.end)}`}
                  {x.note && ` · ${x.note}`}
                </p>
              </div>
              {editable && (
                <IconBtn
                  icon={X}
                  label="Remove time off"
                  onClick={() => actions.removeTimeOff(m.id, x.id)}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function TimeOffModal({
  t,
  defaults,
  onClose,
}: {
  t: Tenant
  defaults: { memberId?: string; date?: string }
  onClose: () => void
}) {
  const people = t.members.filter((m) => m.status === 'active')
  const [memberId, setMemberId] = useState(
    defaults.memberId ?? people.at(0)?.id ?? '',
  )
  const [kind, setKind] = useState<TimeOff['kind']>('vacation')
  const [start, setStart] = useState(defaults.date ?? todayISO())
  const [end, setEnd] = useState(defaults.date ?? todayISO())
  const [note, setNote] = useState('')
  const affected = t.jobs.filter((j) => {
    const crew = t.crews.find((c) => c.memberIds.includes(memberId))
    return (
      crew &&
      j.crew_id === crew.id &&
      j.date >= start &&
      j.date <= end &&
      (j.status === 'assigned' || j.status === 'scheduled')
    )
  }).length
  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title="Record time off"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            disabled={!memberId || end < start}
            onClick={() => {
              actions.addTimeOff(memberId, {
                kind,
                start,
                end,
                note: note || undefined,
              })
              toast(`Time off saved for ${t.member(memberId)?.display_name}`)
              onClose()
            }}
          >
            Save
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Team member" className="sm:col-span-2">
          <SelectInput
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Type" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {(['vacation', 'sick', 'personal'] as const).map((k) => (
              <CheckPill
                key={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              >
                {AVAILABILITY_LABEL[k]}
              </CheckPill>
            ))}
          </div>
        </Field>
        <Field label="From">
          <TextInput
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="To">
          <TextInput
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
        <Field label="Note (optional)" className="sm:col-span-2">
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {affected > 0 && (
          <p className="rounded-xl bg-(--sun-100) px-3 py-2 text-[13px] text-(--ink) sm:col-span-2">
            Their crew has {affected} job{affected === 1 ? '' : 's'} in this
            window. The calendar will flag them so you can cover or reassign.
          </p>
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

function PerformanceTab({
  t,
  onOpen,
}: {
  t: Tenant
  onOpen: (id: string) => void
}) {
  const metrics = useMetrics(t)
  const [sort, setSort] = useState<'jobs' | 'hours' | 'rating'>('jobs')
  const rows = t.members
    .filter((m) => m.role === 'worker' && m.status === 'active')
    .map((m) => ({ m, ...(metrics.get(m.id) ?? { jobs: 0, hours: 0 }) }))
    .sort((a, b) =>
      sort === 'rating' ? b.m.rating - a.m.rating : b[sort] - a[sort],
    )
  const maxJobs = Math.max(1, ...rows.map((r) => r.jobs))
  const maxHours = Math.max(1, ...rows.map((r) => r.hours))
  return (
    <Card>
      <CardHeader
        title="Performance · last 90 days"
        subtitle="Jobs and hours come from completed jobs on each person’s crew."
        action={
          <SelectInput
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="w-44"
            aria-label="Sort by"
          >
            <option value="jobs">Sort: Jobs completed</option>
            <option value="hours">Sort: Hours worked</option>
            <option value="rating">Sort: Rating</option>
          </SelectInput>
        }
      />
      <div className="crm-scroll overflow-x-auto p-2">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
              <th className="px-3 py-3">Team member</th>
              <th className="px-3 py-3">Jobs completed</th>
              <th className="px-3 py-3">Hours worked</th>
              <th className="px-3 py-3">Customer rating</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.m.id}
                onClick={() => onOpen(r.m.id)}
                className="cursor-pointer border-t border-(--line) hover:bg-(--cream)"
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-center text-xs font-bold text-(--ink-3)">
                      {i + 1}
                    </span>
                    <Avatar name={r.m.display_name} size={32} />
                    <div>
                      <p className="flex items-center gap-1.5 font-bold">
                        {r.m.display_name}
                        {i === 0 && (
                          <Award
                            className="size-4 text-(--sun)"
                            aria-label="Top performer"
                          />
                        )}
                      </p>
                      <p className="text-xs text-(--ink-3)">
                        {t.crews.find((c) => c.memberIds.includes(r.m.id))
                          ?.name ?? 'No crew'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="w-56 px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Progress
                      value={(r.jobs / maxJobs) * 100}
                      className="flex-1"
                    />
                    <span className="w-8 text-right font-semibold">
                      {r.jobs}
                    </span>
                  </div>
                </td>
                <td className="w-56 px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Progress
                      value={(r.hours / maxHours) * 100}
                      className="flex-1"
                      color="var(--sky)"
                    />
                    <span className="w-10 text-right font-semibold">
                      {r.hours}h
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Stars value={r.m.rating} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Stars({ value }: { value: number }) {
  return (
    <span
      className="flex items-center gap-1"
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            'size-3.5',
            i < Math.round(value)
              ? 'fill-(--sun) text-(--sun)'
              : 'text-(--line-2)',
          )}
        />
      ))}
      <span className="ml-1 text-[13px] font-semibold">
        {value ? value.toFixed(1) : '—'}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Profile + invite
// ---------------------------------------------------------------------------

function MemberProfile({
  t,
  member,
  editable,
  onClose,
  onAddTimeOff,
}: {
  t: Tenant
  member: Member
  editable: boolean
  onClose: () => void
  onAddTimeOff: () => void
}) {
  const metrics = useMetrics(t).get(member.id) ?? { jobs: 0, hours: 0 }
  const crew = t.crews.find((c) => c.memberIds.includes(member.id))
  const [cert, setCert] = useState('')
  const today = todayISO()
  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={
        <span className="flex items-center gap-3">
          <Avatar name={member.display_name} size={44} />
          {member.display_name}
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone={member.role === 'owner' ? 'dark' : 'lime'}>
            {ROLE_LABEL[member.role]}
          </Badge>
          <StatusBadge status={member.status} />
          {member.title} {crew && `· ${crew.name}`}
        </span>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: 'Jobs completed',
              value: metrics.jobs,
              sub: 'last 90 days',
            },
            {
              label: 'Hours worked',
              value: `${metrics.hours}h`,
              sub: 'last 90 days',
            },
            {
              label: 'Customer rating',
              value: member.rating ? member.rating.toFixed(1) : '—',
              sub: 'out of 5',
            },
          ].map((k) => (
            <Card key={k.label} className="p-4">
              <p className="text-xs font-semibold text-(--ink-3)">{k.label}</p>
              <p className="crm-display mt-1 text-2xl font-semibold">
                {k.value}
              </p>
              <p className="text-[11px] text-(--ink-3)">{k.sub}</p>
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
            Contact information
          </p>
          <p className="flex items-center gap-2 text-sm">
            <Mail className="size-4 text-(--ink-3)" /> {member.email}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Phone className="size-4 text-(--ink-3)" /> {member.phone || '—'}
          </p>
          {editable && member.role !== 'owner' && (
            <Field
              label="Role"
              className="mt-4"
              hint={ROLE_DESCRIPTION[member.role]}
            >
              <SelectInput
                value={member.role}
                onChange={(e) => {
                  actions.updateMember(member.id, {
                    role: e.target.value as OrgRole,
                  })
                  toast(
                    `${member.display_name} is now ${ROLE_LABEL[e.target.value as OrgRole]}`,
                  )
                }}
              >
                {(['admin', 'dispatcher', 'worker'] as const).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
            Certifications
          </p>
          <div className="flex flex-wrap gap-2">
            {member.certifications.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 rounded-full bg-(--sage) py-1 pr-1.5 pl-2.5 text-xs font-semibold"
              >
                <BadgeCheck className="size-3.5 text-(--leaf-600)" /> {c}
                {editable && (
                  <button
                    type="button"
                    aria-label={`Remove ${c}`}
                    className="cursor-pointer rounded-full p-0.5 hover:bg-white"
                    onClick={() =>
                      actions.updateMember(member.id, {
                        certifications: member.certifications.filter(
                          (x) => x !== c,
                        ),
                      })
                    }
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {member.certifications.length === 0 && (
              <p className="text-sm text-(--ink-3)">None on file.</p>
            )}
          </div>
          {editable && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!cert.trim()) return
                actions.updateMember(member.id, {
                  certifications: [...member.certifications, cert.trim()],
                })
                setCert('')
              }}
            >
              <TextInput
                value={cert}
                onChange={(e) => setCert(e.target.value)}
                placeholder="e.g. Pesticide Applicator"
                aria-label="Add certification"
              />
              <Btn
                type="submit"
                variant="outline"
                icon={Plus}
                disabled={!cert.trim()}
              >
                Add
              </Btn>
            </form>
          )}
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
            Availability
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map(([k, label]) => {
              const on = member.workDays.includes(k)
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!editable}
                  aria-pressed={on}
                  onClick={() =>
                    actions.updateMember(member.id, {
                      workDays: on
                        ? member.workDays.filter((d) => d !== k)
                        : [...member.workDays, k],
                    })
                  }
                  className={cn(
                    'h-9 w-12 rounded-xl text-xs font-bold',
                    on
                      ? 'bg-(--leaf-900) text-(--lime)'
                      : 'bg-(--cream-2) text-(--ink-3)',
                    editable && 'cursor-pointer',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold">Time off</p>
            {editable && (
              <Btn variant="ghost" size="sm" icon={Plus} onClick={onAddTimeOff}>
                Add
              </Btn>
            )}
          </div>
          <ul className="mt-2 space-y-1.5">
            {member.timeOff
              .filter((x) => x.end >= today)
              .map((x) => (
                <li key={x.id} className="flex items-center gap-2 text-[13px]">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-bold',
                      AVAIL_STYLE[x.kind],
                    )}
                  >
                    {AVAILABILITY_LABEL[x.kind]}
                  </span>
                  {fmtDate(x.start)}
                  {x.end !== x.start && ` – ${fmtDate(x.end)}`}
                </li>
              ))}
            {member.timeOff.filter((x) => x.end >= today).length === 0 && (
              <li className="text-[13px] text-(--ink-3)">
                No upcoming time off.
              </li>
            )}
          </ul>
        </Card>

        <Card className="p-5">
          <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
            Assigned vehicle
          </p>
          {editable ? (
            <TextInput
              defaultValue={member.vehicle ?? ''}
              placeholder="e.g. Truck 2 · Silverado 2500"
              onBlur={(e) =>
                e.target.value !== (member.vehicle ?? '') &&
                actions.updateMember(member.id, {
                  vehicle: e.target.value || null,
                })
              }
              aria-label="Assigned vehicle"
            />
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <Truck className="size-4 text-(--ink-3)" />{' '}
              {member.vehicle ?? 'None'}
            </p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-(--ink-3)">
            <Clock className="size-3" /> Joined{' '}
            {fmtDate(member.joinedAt, { month: 'short', year: 'numeric' })}
          </p>
        </Card>
      </div>
    </Drawer>
  )
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('worker')
  const valid = /\S+@\S+\.\S+/.test(email)
  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title="Invite a team member"
      subtitle="They’ll get an email to join this company’s workspace."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            icon={Mail}
            disabled={!valid}
            onClick={() => {
              actions.inviteMember({ name, email, role })
              toast(`Invitation sent to ${email}`)
              onClose()
            }}
          >
            Send invite
          </Btn>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </Field>
        <Field label="Role">
          <div className="grid gap-2">
            {(['admin', 'dispatcher', 'worker'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left',
                  role === r
                    ? 'border-(--leaf-600) bg-(--lime-100)'
                    : 'border-(--line-2) hover:border-(--leaf-500)',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 size-4 shrink-0 rounded-full border-2',
                    role === r
                      ? 'border-(--leaf-700) bg-(--leaf-700) ring-2 ring-white ring-inset'
                      : 'border-(--line-2)',
                  )}
                />
                <span>
                  <span className="block text-sm font-bold">
                    {ROLE_LABEL[r]}
                  </span>
                  <span className="block text-xs text-(--ink-3)">
                    {ROLE_DESCRIPTION[r]}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
