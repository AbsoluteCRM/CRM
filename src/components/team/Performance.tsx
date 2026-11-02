import { useState } from 'react'
import {
  Award,
  BadgeCheck,
  Clock,
  Crown,
  Mail,
  Phone,
  Plus,
  Star,
  Truck,
  X,
} from 'lucide-react'

import {
  Avatar,
  Badge,
  Btn,
  Card,
  CardHeader,
  ColorDot,
  Drawer,
  EmptyState,
  Progress,
  SelectInput,
  StatusBadge,
  TextInput,
} from '#/components/crm/ui'
import { fmtDate, fmtPhone } from '#/components/crm/format'
import { cn } from '#/lib/utils'
import {
  KIND_LABEL,
  WEEKDAY_SHORT,
  compactSchedule,
  monthDay,
} from './availability-utils'
import type { Crew } from '#/integrations/crews/crews'
import type { TimeOff } from '#/integrations/teams/availability'
import type { TeamMember } from '#/integrations/teams/teams'

type Sort = 'jobs' | 'hours' | 'rating'
type PerfCrew = Pick<Crew, 'id' | 'name' | 'color' | 'vehicle' | 'crew_members'>

export const crewFor = (crews: Array<PerfCrew>, memberId: string) =>
  crews.find((c) => c.crew_members.some((cm) => cm.member_id === memberId))

/** Average customer rating across active contractors who have one. */
export function averageRating(members: Array<TeamMember>) {
  const rated = members.filter(
    (m) => m.role === 'worker' && m.status === 'active' && m.rating !== null,
  )
  if (rated.length === 0) return null
  return rated.reduce((s, m) => s + Number(m.rating), 0) / rated.length
}

export function PerformanceTab({
  members,
  crews,
  onOpen,
}: {
  members: Array<TeamMember>
  crews: Array<PerfCrew>
  onOpen: (memberId: string) => void
}) {
  const [sort, setSort] = useState<Sort>('jobs')
  const value = (m: TeamMember) =>
    sort === 'jobs'
      ? m.jobs_completed
      : sort === 'hours'
        ? Number(m.hours_worked)
        : Number(m.rating ?? 0)
  const rows = members
    .filter((m) => m.role === 'worker' && m.status === 'active')
    .sort(
      (a, b) =>
        value(b) - value(a) || a.display_name.localeCompare(b.display_name),
    )
  const maxJobs = Math.max(1, ...rows.map((m) => m.jobs_completed))
  const maxHours = Math.max(1, ...rows.map((m) => Number(m.hours_worked)))

  return (
    <Card>
      <CardHeader
        title="Performance"
        subtitle="Jobs, hours and ratings saved on each contractor’s record."
        action={
          <SelectInput
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="w-44"
            aria-label="Sort by"
          >
            <option value="jobs">Jobs completed</option>
            <option value="hours">Hours worked</option>
            <option value="rating">Rating</option>
          </SelectInput>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No active contractors yet"
          body="Invite contractors to see how they’re doing."
        />
      ) : (
        <div className="crm-scroll overflow-x-auto p-2">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
                <th className="px-3 py-3">Contractor</th>
                <th className="px-3 py-3">Jobs completed</th>
                <th className="px-3 py-3">Hours worked</th>
                <th className="px-3 py-3">Customer rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m, i) => {
                const crew = crewFor(crews, m.id)
                return (
                  <tr
                    key={m.id}
                    onClick={() => onOpen(m.id)}
                    className="cursor-pointer border-t border-(--line) hover:bg-(--cream)"
                  >
                    <td className="px-3 py-3">
                      {/* The click bubbles to the row. */}
                      <button
                        type="button"
                        className="flex cursor-pointer items-center gap-3 text-left"
                      >
                        <span className="w-5 text-center text-xs font-bold text-(--ink-3)">
                          {i + 1}
                        </span>
                        <Avatar
                          name={m.display_name}
                          color={m.color ?? undefined}
                          size={32}
                        />
                        <span>
                          <span className="flex items-center gap-1.5 font-bold">
                            {m.display_name}
                            {i === 0 && value(m) > 0 && (
                              <Award
                                className="size-4 text-(--sun)"
                                aria-label="Top performer"
                              />
                            )}
                          </span>
                          <span className="block text-xs text-(--ink-3)">
                            {crew?.name ?? 'No crew'}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="w-56 px-3 py-3">
                      <span className="flex items-center gap-3">
                        <Progress
                          value={(m.jobs_completed / maxJobs) * 100}
                          className="flex-1"
                        />
                        <span className="w-10 text-right font-semibold">
                          {m.jobs_completed}
                        </span>
                      </span>
                    </td>
                    <td className="w-56 px-3 py-3">
                      <span className="flex items-center gap-3">
                        <Progress
                          value={(Number(m.hours_worked) / maxHours) * 100}
                          className="flex-1"
                          color="var(--sky)"
                        />
                        <span className="w-12 text-right font-semibold">
                          {hours(m.hours_worked)}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Stars value={m.rating} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const hours = (h: number) => `${Number(h) % 1 ? Number(h).toFixed(1) : h}h`

function Stars({ value }: { value: number | null }) {
  const v = Number(value ?? 0)
  return (
    <span
      className="flex items-center gap-1"
      aria-label={value === null ? 'No rating yet' : `${v.toFixed(1)} out of 5`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            'size-3.5',
            i < Math.round(v) ? 'fill-(--sun) text-(--sun)' : 'text-(--line-2)',
          )}
        />
      ))}
      <span className="ml-1 text-[13px] font-semibold">
        {value === null ? '—' : v.toFixed(1)}
      </span>
    </span>
  )
}

/** A contractor's record: performance, contact, certifications, schedule, vehicle. */
export function MemberDrawer({
  member,
  crew,
  timeOff,
  editable,
  savingCertifications,
  savingSchedule,
  onClose,
  onSetCertifications,
  onSetWorkDays,
  onSetVehicle,
  onAddTimeOff,
}: {
  member: TeamMember
  crew: PerfCrew | undefined
  timeOff: Array<TimeOff>
  editable: boolean
  savingCertifications: boolean
  savingSchedule: boolean
  onClose: () => void
  onSetCertifications: (certifications: Array<string>) => Promise<boolean>
  onSetWorkDays: (workDays: Array<number>) => void
  /** Vehicles belong to the crew, so this changes it for the whole crew. */
  onSetVehicle: (vehicle: string | null) => void
  onAddTimeOff: () => void
}) {
  const [cert, setCert] = useState('')
  const lead = crew?.crew_members.find((cm) => cm.is_lead)?.member_id
  const upcoming = timeOff
    .filter(
      (t) =>
        t.member_id === member.id &&
        (t.status === 'approved' || t.status === 'pending') &&
        t.end_date >= new Date().toISOString().slice(0, 10),
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date))

  const addCert = () => {
    const c = cert.trim()
    if (!c) return
    void onSetCertifications([...member.certifications, c]).then(
      (ok) => ok && setCert(''),
    )
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={
        <span className="flex items-center gap-3">
          <Avatar
            name={member.display_name}
            color={member.color ?? undefined}
            size={44}
          />
          {member.display_name}
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="lime">Contractor</Badge>
          <StatusBadge status={member.status} />
          {crew && (
            <span className="flex items-center gap-1.5">
              <ColorDot color={crew.color ?? '#8a8f6a'} />
              {crew.name}
              {lead === member.id && (
                <Crown
                  className="size-3.5 text-(--sun)"
                  aria-label="Crew lead"
                />
              )}
            </span>
          )}
        </span>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Jobs completed', value: member.jobs_completed },
            { label: 'Hours worked', value: hours(member.hours_worked) },
            {
              label: 'Customer rating',
              value:
                member.rating === null ? '—' : Number(member.rating).toFixed(1),
              sub: 'out of 5',
            },
          ].map((k) => (
            <Card key={k.label} className="p-4">
              <p className="text-xs font-semibold text-(--ink-3)">{k.label}</p>
              <p className="crm-display mt-1 text-2xl font-semibold">
                {k.value}
              </p>
              {k.sub && <p className="text-[11px] text-(--ink-3)">{k.sub}</p>}
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <SectionTitle>Contact information</SectionTitle>
          <p className="flex items-center gap-2 text-sm">
            <Mail className="size-4 text-(--ink-3)" /> {member.email ?? '—'}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm">
            <Phone className="size-4 text-(--ink-3)" />{' '}
            {member.phone ? fmtPhone(member.phone) : '—'}
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle>Certifications</SectionTitle>
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
                    disabled={savingCertifications}
                    className="cursor-pointer rounded-full p-0.5 hover:bg-white"
                    onClick={() =>
                      void onSetCertifications(
                        member.certifications.filter((x) => x !== c),
                      )
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
                addCert()
              }}
            >
              <TextInput
                value={cert}
                onChange={(e) => setCert(e.target.value)}
                placeholder="e.g. Pesticide Applicator"
                aria-label="Add certification"
                maxLength={80}
              />
              <Btn
                type="submit"
                variant="outline"
                icon={Plus}
                disabled={!cert.trim() || savingCertifications}
              >
                Add
              </Btn>
            </form>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Availability</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_SHORT.map((label, i) => {
              const day = i + 1
              const on = member.work_days.includes(day)
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!editable || savingSchedule}
                  aria-pressed={on}
                  onClick={() =>
                    onSetWorkDays(
                      on
                        ? member.work_days.filter((d) => d !== day)
                        : [...member.work_days, day],
                    )
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
          <p className="mt-2 text-xs text-(--ink-3)">
            {compactSchedule(member)}
          </p>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[13px] font-semibold">Time off</p>
            {editable && (
              <Btn variant="ghost" size="sm" icon={Plus} onClick={onAddTimeOff}>
                Add
              </Btn>
            )}
          </div>
          <ul className="mt-2 space-y-1.5">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[13px]">
                <Badge tone={t.status === 'pending' ? 'sun' : 'gray'}>
                  {KIND_LABEL[t.kind]}
                  {t.status === 'pending' && ' · pending'}
                </Badge>
                {monthDay(t.start_date)}
                {t.end_date !== t.start_date && ` – ${monthDay(t.end_date)}`}
              </li>
            ))}
            {upcoming.length === 0 && (
              <li className="text-[13px] text-(--ink-3)">
                No upcoming time off.
              </li>
            )}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle>Assigned vehicle</SectionTitle>
          {!crew ? (
            <p className="text-sm text-(--ink-3)">
              Not on a crew yet. Vehicles are assigned per crew.
            </p>
          ) : editable ? (
            <>
              <TextInput
                key={crew.vehicle ?? ''}
                defaultValue={crew.vehicle ?? ''}
                placeholder="e.g. Truck 2 · Silverado 2500"
                aria-label="Assigned vehicle"
                onBlur={(e) =>
                  e.target.value.trim() !== (crew.vehicle ?? '') &&
                  onSetVehicle(e.target.value.trim() || null)
                }
              />
              <p className="mt-1.5 text-xs text-(--ink-3)">
                Shared by everyone on {crew.name}.
              </p>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <Truck className="size-4 text-(--ink-3)" />{' '}
              {crew.vehicle ?? 'None'}
            </p>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-(--ink-3)">
            <Clock className="size-3" /> Joined{' '}
            {fmtDate(member.created_at.slice(0, 10), {
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </Card>
      </div>
    </Drawer>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
      {children}
    </p>
  )
}
