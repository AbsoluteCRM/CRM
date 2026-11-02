import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Award,
  BadgeCheck,
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
  Drawer,
  Field,
  Modal,
  Progress,
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
  useTenant,
} from '#/components/crm/store'
import { addDays, fmtDate, todayISO } from '#/components/crm/format'
import InvitationDelivery from '#/components/team/InvitationDelivery'
import CrewBuilder from '#/components/team/CrewBuilder'
import MembersTab from '#/components/team/MembersTab'
import { useCrewMutations, useCrews } from '#/integrations/crews/crews'
import {
  useInviteTeamMember,
  useMyMember,
  useTeamMembers,
} from '#/integrations/teams/teams'
import {
  useAvailabilityMutations,
  useTimeOff,
} from '#/integrations/teams/availability'
import { useCompanySettings } from '#/integrations/settings/settings'
import {
  AvailabilityBoard,
  DAYS_SHOWN,
  MyAvailability,
} from '#/components/team/Availability'
import type { InviteRole } from '#/integrations/teams/teams'
import { cn } from '#/lib/utils'
import type { Availability, Tenant } from '#/components/crm/store'
import type { Member, OrgRole, Weekday } from '#/components/crm/types'

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
  const editable = can.manageTeam(t.role)
  const isWorker = t.role === 'worker'
  const today = todayISO()
  const timeOff = useTimeOff(today, addDays(today, DAYS_SHOWN + 60))
  const company = useCompanySettings()
  const hours = company.data?.settings.business_hours
  const { me } = useMyMember()
  const availabilityActions = useAvailabilityMutations()
  const pendingRequests = (timeOff.data ?? []).filter(
    (x) => x.status === 'pending',
  ).length
  const realMembers = team.data ?? []
  const realCrews = crews.data ?? []
  const realActive = realMembers.filter((m) => m.status === 'active')
  const outToday = new Set(
    (timeOff.data ?? [])
      .filter(
        (x) =>
          x.status === 'approved' &&
          x.start_date <= today &&
          x.end_date >= today,
      )
      .map((x) => x.member_id),
  )
  const active = t.members.filter((m) => m.status === 'active')

  if (isWorker) {
    return (
      <PageShell
        kicker="Workforce"
        title="My availability"
        subtitle="Your schedule for the next two weeks. Request sick days and other time off here."
      >
        {me ? (
          <MyAvailability
            me={me}
            timeOff={timeOff.data ?? []}
            hours={hours}
            actions={availabilityActions}
          />
        ) : (
          <p role="status" className="py-10 text-center text-sm text-(--ink-3)">
            {team.isLoading
              ? 'Loading…'
              : 'We couldn’t find your team profile.'}
          </p>
        )}
      </PageShell>
    )
  }

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
            value: realActive.filter((m) => outToday.has(m.id)).length,
            sub:
              pendingRequests > 0
                ? `${pendingRequests} time-off request${pendingRequests === 1 ? '' : 's'} waiting`
                : 'Sick, vacation, or personal time',
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
          {
            value: 'availability',
            label: 'Availability',
            count: pendingRequests || undefined,
          },
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
        <AvailabilityBoard
          members={realMembers}
          timeOff={timeOff.data ?? []}
          hours={hours}
          myMemberId={me?.id ?? null}
          canManage={editable}
          actions={availabilityActions}
        />
      )}
      {tab === 'performance' && <PerformanceTab t={t} onOpen={setProfile} />}

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {profile && t.member(profile) && (
        <MemberProfile
          t={t}
          member={t.member(profile)!}
          editable={editable}
          onClose={() => setProfile(null)}
          onAddTimeOff={() => {
            setProfile(null)
            setTab('availability')
          }}
        />
      )}
    </PageShell>
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
