import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Award,
  BadgeCheck,
  CalendarOff,
  Clock,
  Mail,
  Phone,
  Plus,
  Star,
  Truck,
  UserPlus,
  X,
} from 'lucide-react'

import { useOrganization } from '#/integrations/organization/context'
import { can as orgCan } from '#/integrations/organization/permissions'
import PageShell from '#/components/crm/PageShell'
import {
  Avatar,
  Badge,
  Btn,
  Card,
  CardHeader,
  CheckPill,
  Drawer,
  EmptyState,
  Field,
  IconBtn,
  Modal,
  Progress,
  SelectInput,
  StatusBadge,
  Tabs,
  TextInput,
} from '#/components/crm/ui'
import { toast } from '#/lib/toast'
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
  fmtWeekday,
  isWeekend,
  todayISO,
} from '#/components/crm/format'
import InvitationDelivery from '#/components/team/InvitationDelivery'
import CrewBuilder from '#/components/team/CrewBuilder'
import MembersTab from '#/components/team/MembersTab'
import { useCrewMutations, useCrews } from '#/integrations/crews/crews'
import { useInviteTeamMember, useTeamMembers } from '#/integrations/teams/teams'
import type { InviteRole } from '#/integrations/teams/teams'
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
  const { organization } = useOrganization()
  const canInvite =
    organization !== null && orgCan.manageTeam(organization.role)
  const team = useTeamMembers()
  const crews = useCrews()
  const crewActions = useCrewMutations()
  const [tab, setTab] = useState<Tab>('members')
  const [inviting, setInviting] = useState(false)
  const [profile, setProfile] = useState<string | null>(null)
  const [timeOffFor, setTimeOffFor] = useState<{
    memberId?: string
    date?: string
  } | null>(null)
  const editable = can.manageTeam(t.role)
  const realMembers = team.data ?? []
  const realCrews = crews.data ?? []
  const realActive = realMembers.filter((m) => m.status === 'active')
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
            {canInvite && (
              <Btn icon={UserPlus} onClick={() => setInviting(true)}>
                Invite member
              </Btn>
            )}
          </>
        )
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Team members',
            value: realActive.length,
            sub: `${realMembers.filter((m) => m.status === 'invited').length} invited`,
          },
          {
            label: 'Crews',
            value: realCrews.filter((c) => c.crew_members.length).length,
            sub: `${realCrews.filter((c) => !c.crew_members.length).length} without members`,
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
          { value: 'members', label: 'Team list', count: team.data?.length },
          { value: 'crews', label: 'Crew builder', count: realCrews.length },
          { value: 'availability', label: 'Availability' },
          { value: 'performance', label: 'Performance' },
        ]}
      />

      {tab === 'members' && (
        <MembersTab
          members={team.data ?? []}
          isLoading={team.isLoading}
          error={team.error}
        />
      )}
      {tab === 'crews' && (
        <CrewBuilder
          members={realMembers}
          crews={crews.data}
          crewsLoading={crews.isLoading}
          crewsError={crews.error}
          editable={editable}
          actions={crewActions}
        />
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
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('worker')
  const [result, setResult] = useState<{
    inviteLink: string
    resent: boolean
    delivery: 'sent' | 'failed'
  } | null>(null)
  const invite = useInviteTeamMember()
  const valid = /\S+@\S+\.\S+/.test(email)

  const copyLink = async (link: string) => {
    await navigator.clipboard.writeText(link)
  }

  const submit = async () => {
    try {
      const created = await invite.mutateAsync({ email, role })
      toast(
        created.delivery === 'sent'
          ? 'Invitation email accepted for sending'
          : 'Unable to confirm sending. Copy the link or retry.',
        created.delivery === 'sent' ? undefined : 'warning',
      )
      setResult(created)
    } catch (e) {
      toast(
        e instanceof Error ? e.message : 'Could not create the invite.',
        'warning',
      )
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title="Invite a team member"
      subtitle="Email a secure invitation, valid for seven days."
      footer={
        result ? (
          <>
            <Btn variant="ghost" disabled={invite.isPending} onClick={onClose}>
              Done
            </Btn>
          </>
        ) : (
          <>
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn
              icon={Mail}
              disabled={!valid || invite.isPending}
              onClick={submit}
            >
              {invite.isPending ? 'Sending…' : 'Send invitation'}
            </Btn>
          </>
        )
      }
    >
      {result ? (
        <InvitationDelivery
          email={email}
          inviteLink={result.inviteLink}
          delivery={result.delivery}
          busy={invite.isPending}
          onRetry={submit}
          onCopy={() => {
            copyLink(result.inviteLink).then(
              () => toast('Link copied'),
              () => toast('Couldn’t copy; select the link instead.', 'warning'),
            )
          }}
        />
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-(--ink-3)">
            Sending again to an email with a pending invitation replaces its
            earlier link. Only the latest generated link works.
          </p>
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoFocus
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
      )}
    </Modal>
  )
}
