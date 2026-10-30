import { useState } from 'react'
import {
  CalendarClock,
  CalendarOff,
  Check,
  Clock,
  Pencil,
  Thermometer,
  X,
} from 'lucide-react'

import {
  addDays,
  fmtDate,
  fmtTime,
  fmtWeekday,
  todayISO,
} from '#/components/crm/format'
import {
  Alert,
  Badge,
  Btn,
  Card,
  CardHeader,
  CheckPill,
  EmptyState,
  Field,
  IconBtn,
  Modal,
  SelectInput,
  TextInput,
  toast,
} from '#/components/crm/ui'
import { cn } from '#/lib/utils'
import {
  DAY_STATE_LABEL,
  DAY_STATE_STYLE,
  KIND_LABEL,
  WEEKDAY_SHORT,
  dayState,
  hhmm,
  openWeekdays,
} from './availability-utils'
import type { DayState } from './availability-utils'
import type { BusinessHours } from '#/integrations/settings/schema'
import type { TimeOff, TimeOffInput } from '#/integrations/teams/availability'
import type { TeamMember } from '#/integrations/teams/teams'

export const DAYS_SHOWN = 14

export type AvailabilityActions = {
  request: (input: TimeOffInput) => Promise<boolean>
  record: (input: TimeOffInput & { memberId: string }) => Promise<boolean>
  review: (
    id: string,
    approve: boolean,
    note?: string | null,
  ) => Promise<boolean>
  cancel: (id: string) => Promise<boolean>
  /** Clears approved time off in a range (marks the member available). */
  clear: (input: {
    memberId: string
    start: string
    end: string
  }) => Promise<boolean>
  setSchedule: (input: {
    memberId: string
    workDays: Array<number>
    workStart: string
    workEnd: string
  }) => Promise<boolean>
  busy: boolean
}

const range = (t: Pick<TimeOff, 'start_date' | 'end_date'>) =>
  t.start_date === t.end_date
    ? fmtDate(t.start_date, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : `${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}`

const scheduleText = (
  m: Pick<TeamMember, 'work_days' | 'work_start' | 'work_end'>,
) =>
  m.work_days.length === 0
    ? 'No regular days'
    : `${m.work_days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')} · ${fmtTime(hhmm(m.work_start))}–${fmtTime(hhmm(m.work_end))}`

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs text-(--ink-2)">
      {(Object.keys(DAY_STATE_LABEL) as Array<DayState>).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={cn('size-3 rounded', DAY_STATE_STYLE[s])} />
          {DAY_STATE_LABEL[s]}
        </span>
      ))}
    </div>
  )
}

const cellText: Record<DayState, string> = {
  available: '',
  off_day: '–',
  closed: '',
  sick: 'Sick',
  vacation: 'Vac',
  personal: 'Pers',
  pending: '?',
}

/**
 * Team availability for office staff: a 14-day grid from each member's
 * schedule, approved time off and business hours, plus the requests waiting
 * for a manager. Managers (owner/admin) review, record and edit schedules.
 */
export function AvailabilityBoard({
  members,
  timeOff,
  hours,
  myMemberId,
  canManage,
  actions,
  today = todayISO(),
}: {
  members: Array<TeamMember>
  timeOff: Array<TimeOff>
  hours: BusinessHours | undefined
  myMemberId: string | null
  canManage: boolean
  actions: AvailabilityActions
  today?: string
}) {
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i))
  const people = members
    .filter((m) => m.status === 'active')
    .sort(
      (a, b) =>
        Number(a.role !== 'worker') - Number(b.role !== 'worker') ||
        a.display_name.localeCompare(b.display_name),
    )
  const name = (id: string) =>
    members.find((m) => m.id === id)?.display_name ?? 'Former member'
  const pending = timeOff.filter((t) => t.status === 'pending')
  const upcoming = timeOff.filter(
    (t) => t.status === 'approved' && t.end_date >= today,
  )
  const [recordFor, setRecordFor] = useState<{
    memberId?: string
    date?: string
  } | null>(null)
  const [scheduleFor, setScheduleFor] = useState<TeamMember | null>(null)
  const closedDays = 7 - openWeekdays(hours).length

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          title={`Next ${DAYS_SHOWN} days`}
          subtitle={
            canManage
              ? 'Click a name to set their schedule, or a day to record time off.'
              : 'Schedules, approved time off and business hours.'
          }
          action={
            canManage && (
              <Btn
                variant="outline"
                size="sm"
                icon={CalendarOff}
                onClick={() => setRecordFor({})}
              >
                Record time off
              </Btn>
            )
          }
        />
        {closedDays > 0 && (
          <p className="px-5 pt-2 text-xs text-(--ink-3)">
            The business is closed {closedDays} day{closedDays === 1 ? '' : 's'}{' '}
            a week (Settings → Hours), so nobody is scheduled then.
          </p>
        )}
        <div className="crm-scroll overflow-x-auto p-4">
          {people.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No active team members yet"
              body="Invite people from the Team list."
            />
          ) : (
            <table className="w-full min-w-[900px] table-fixed border-separate border-spacing-1 text-xs">
              <colgroup>
                <col className="w-52" />
                {days.map((d) => (
                  <col key={d} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th />
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
                    <td className="pr-2">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setScheduleFor(m)}
                          className="group flex w-full cursor-pointer flex-col items-start rounded-lg px-1.5 py-1 text-left hover:bg-(--sage)"
                          aria-label={`Edit ${m.display_name}'s schedule`}
                        >
                          <span className="flex w-full items-center gap-1 truncate text-[13px] font-semibold text-(--ink)">
                            {m.display_name}
                            <Pencil className="size-3 opacity-0 group-hover:opacity-60" />
                          </span>
                          <span className="truncate text-[11px] text-(--ink-3)">
                            {scheduleText(m)}
                          </span>
                        </button>
                      ) : (
                        <div className="px-1.5 py-1">
                          <p className="truncate text-[13px] font-semibold">
                            {m.display_name}
                          </p>
                          <p className="truncate text-[11px] text-(--ink-3)">
                            {scheduleText(m)}
                          </p>
                        </div>
                      )}
                    </td>
                    {days.map((d) => {
                      const s = dayState(m, d, hours, timeOff)
                      const clickable = canManage && s !== 'closed'
                      return (
                        <td key={d}>
                          <button
                            type="button"
                            disabled={!clickable}
                            onClick={() =>
                              setRecordFor({ memberId: m.id, date: d })
                            }
                            title={`${m.display_name}: ${DAY_STATE_LABEL[s]} on ${fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                            aria-label={`${m.display_name}, ${fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' })}: ${DAY_STATE_LABEL[s]}`}
                            className={cn(
                              'h-9 w-full rounded-lg text-[10px] font-bold',
                              DAY_STATE_STYLE[s],
                              clickable &&
                                'cursor-pointer hover:ring-2 hover:ring-(--leaf-500)',
                            )}
                          >
                            {cellText[s]}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Legend />
        </div>
      </Card>

      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Time-off requests
                {pending.length > 0 && (
                  <Badge tone="sun">{pending.length}</Badge>
                )}
              </span>
            }
            subtitle={
              canManage
                ? 'Approve or decline. Approved days block scheduling.'
                : 'A manager approves these.'
            }
          />
          <ul className="space-y-2 p-4">
            {pending.length === 0 && (
              <li className="text-sm text-(--ink-3)">No requests waiting.</li>
            )}
            {pending.map((t) => (
              <li
                key={t.id}
                className="rounded-2xl border border-(--sun)/40 bg-(--sun-100)/50 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">
                      {name(t.member_id)}
                    </p>
                    <p className="text-xs text-(--ink-2)">
                      {KIND_LABEL[t.kind]} · {range(t)}
                    </p>
                    {t.note && (
                      <p className="mt-1 text-xs text-(--ink-3)">“{t.note}”</p>
                    )}
                  </div>
                </div>
                {canManage && t.member_id !== myMemberId && (
                  <div className="mt-2 flex gap-2">
                    <Btn
                      size="sm"
                      icon={Check}
                      disabled={actions.busy}
                      onClick={() =>
                        void actions
                          .review(t.id, true)
                          .then(
                            (ok) =>
                              ok &&
                              toast(`Approved ${name(t.member_id)}’s time off`),
                          )
                      }
                    >
                      Approve
                    </Btn>
                    <Btn
                      size="sm"
                      variant="outline"
                      icon={X}
                      disabled={actions.busy}
                      onClick={() =>
                        void actions
                          .review(t.id, false)
                          .then(
                            (ok) =>
                              ok &&
                              toast(
                                `Declined ${name(t.member_id)}’s request`,
                                'info',
                              ),
                          )
                      }
                    >
                      Decline
                    </Btn>
                  </div>
                )}
                {canManage && t.member_id === myMemberId && (
                  <p className="mt-2 text-[11px] text-(--ink-3)">
                    Another manager or the owner reviews your own request.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Upcoming time off" subtitle="Approved" />
          <ul className="space-y-2 p-4">
            {upcoming.length === 0 && (
              <li className="text-sm text-(--ink-3)">Nobody is away.</li>
            )}
            {upcoming.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-2xl border border-(--line) p-3"
              >
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-bold',
                    DAY_STATE_STYLE[t.kind === 'day_off' ? 'off_day' : t.kind],
                  )}
                >
                  {KIND_LABEL[t.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">
                    {name(t.member_id)}
                  </p>
                  <p className="text-xs text-(--ink-3)">
                    {range(t)}
                    {t.note && ` · ${t.note}`}
                  </p>
                </div>
                {canManage && (
                  <IconBtn
                    icon={X}
                    label={`Cancel ${name(t.member_id)}’s time off`}
                    onClick={() =>
                      void actions
                        .cancel(t.id)
                        .then((ok) => ok && toast('Time off cancelled', 'info'))
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {recordFor && (
        <TimeOffModal
          mode="record"
          members={people}
          defaults={recordFor}
          busy={actions.busy}
          onClose={() => setRecordFor(null)}
          onSubmit={async (input) => {
            if (!input.memberId) return false
            const ok = await actions.record({
              ...input,
              memberId: input.memberId,
            })
            if (ok) toast(`Time off saved for ${name(input.memberId)}`)
            return ok
          }}
          onClear={async (input) => {
            const ok = await actions.clear(input)
            if (ok) toast(`${name(input.memberId)} is available`)
            return ok
          }}
        />
      )}
      {scheduleFor && (
        <ScheduleModal
          member={scheduleFor}
          hours={hours}
          busy={actions.busy}
          onClose={() => setScheduleFor(null)}
          onSave={async (s) => {
            const ok = await actions.setSchedule({
              memberId: scheduleFor.id,
              ...s,
            })
            if (ok) toast(`${scheduleFor.display_name}’s schedule saved`)
            return ok
          }}
        />
      )}
    </div>
  )
}

/** A contractor's own view: their week, their requests, and a request button. */
export function MyAvailability({
  me,
  timeOff,
  hours,
  actions,
  today = todayISO(),
}: {
  me: TeamMember
  timeOff: Array<TimeOff>
  hours: BusinessHours | undefined
  actions: AvailabilityActions
  today?: string
}) {
  const [requesting, setRequesting] = useState(false)
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(today, i))
  const mine = timeOff
    .filter((t) => t.member_id === me.id && t.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <CardHeader
          title="My schedule"
          subtitle={scheduleText(me)}
          action={
            <Btn icon={Thermometer} onClick={() => setRequesting(true)}>
              Request time off
            </Btn>
          }
        />
        <div className="grid grid-cols-7 gap-2 p-5">
          {days.map((d) => {
            const s = dayState(me, d, hours, timeOff)
            return (
              <div
                key={d}
                className={cn(
                  'flex flex-col items-center rounded-2xl px-1 py-3 text-center',
                  DAY_STATE_STYLE[s],
                  d === today && 'ring-2 ring-(--leaf-700)',
                )}
              >
                <span className="text-[11px] font-semibold opacity-80">
                  {fmtWeekday(d).slice(0, 3)}
                </span>
                <span className="crm-display text-xl font-semibold">
                  {fmtDate(d, { day: 'numeric' })}
                </span>
                <span className="mt-0.5 text-[10px] font-bold">
                  {s === 'available'
                    ? `${fmtTime(hhmm(me.work_start)).replace(':00', '')}–${fmtTime(hhmm(me.work_end)).replace(':00', '')}`
                    : DAY_STATE_LABEL[s]}
                </span>
              </div>
            )
          })}
        </div>
        <div className="px-5 pb-5">
          <Legend />
        </div>
      </Card>
      <Card>
        <CardHeader
          title="My time off"
          subtitle="A manager approves each request."
        />
        <ul className="space-y-2 p-4">
          {mine.length === 0 && (
            <li className="text-sm text-(--ink-3)">
              Nothing requested. Feeling sick? Use “Request time off”.
            </li>
          )}
          {mine.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-2xl border border-(--line) p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">
                  {KIND_LABEL[t.kind]} · {range(t)}
                </p>
                <p className="mt-0.5">
                  {t.status === 'pending' ? (
                    <Badge tone="sun" dot>
                      Waiting for a manager
                    </Badge>
                  ) : (
                    <Badge tone="green" dot>
                      Approved
                    </Badge>
                  )}
                </p>
              </div>
              {t.status === 'pending' && (
                <IconBtn
                  icon={X}
                  label="Cancel request"
                  onClick={() =>
                    void actions
                      .cancel(t.id)
                      .then((ok) => ok && toast('Request cancelled', 'info'))
                  }
                />
              )}
            </li>
          ))}
        </ul>
      </Card>
      {requesting && (
        <TimeOffModal
          mode="request"
          defaults={{}}
          busy={actions.busy}
          onClose={() => setRequesting(false)}
          onSubmit={async (input) => {
            const ok = await actions.request(input)
            if (ok) toast('Request sent. A manager will review it.')
            return ok
          }}
        />
      )}
    </div>
  )
}

type Choice = TimeOff['kind'] | 'available'
const CHOICE_LABEL: Record<Choice, string> = {
  available: 'Available',
  ...KIND_LABEL,
}

export function TimeOffModal({
  mode,
  members = [],
  defaults,
  busy,
  onClose,
  onSubmit,
  onClear,
}: {
  mode: 'request' | 'record'
  members?: Array<TeamMember>
  defaults: { memberId?: string; date?: string }
  busy: boolean
  onClose: () => void
  onSubmit: (input: TimeOffInput & { memberId?: string }) => Promise<boolean>
  /** Record mode: clears time off so the member is available again. */
  onClear?: (input: {
    memberId: string
    start: string
    end: string
  }) => Promise<boolean>
}) {
  const today = todayISO()
  const [memberId, setMemberId] = useState(
    defaults.memberId ?? members.at(0)?.id ?? '',
  )
  // Nothing is picked until the person chooses; picking it again unselects it.
  const [kind, setKind] = useState<Choice | null>(null)
  const choices: Array<Choice> =
    mode === 'record' && onClear
      ? ['available', 'day_off', 'sick', 'vacation', 'personal']
      : ['sick', 'vacation', 'personal', 'day_off']
  const [start, setStart] = useState(defaults.date ?? today)
  const [end, setEnd] = useState(defaults.date ?? today)
  const [note, setNote] = useState('')
  const invalid =
    kind === null ||
    end < start ||
    (mode === 'request' && end < today) ||
    (mode === 'record' && !memberId)

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={mode === 'request' ? 'Request time off' : 'Record time off'}
      subtitle={
        mode === 'request'
          ? 'Your manager is asked to approve it.'
          : 'Saved as approved. Pick Available to undo time off.'
      }
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            disabled={invalid || busy}
            onClick={async () => {
              if (kind === null) return
              const ok =
                kind === 'available'
                  ? await (onClear?.({ memberId, start, end }) ?? false)
                  : await onSubmit({
                      memberId: mode === 'record' ? memberId : undefined,
                      kind,
                      start,
                      end,
                      note: note.trim() || null,
                    })
              if (ok) onClose()
            }}
          >
            {mode === 'request' ? 'Send request' : 'Save'}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'record' && (
          <Field
            label="Team member"
            htmlFor="to-member"
            className="sm:col-span-2"
          >
            <SelectInput
              id="to-member"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}
        <Field label="Type" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {choices.map((k) => (
              <CheckPill
                key={k}
                checked={kind === k}
                onChange={() => setKind(kind === k ? null : k)}
              >
                {CHOICE_LABEL[k]}
              </CheckPill>
            ))}
          </div>
          {kind === 'available' && (
            <p className="mt-2 text-xs text-(--ink-3)">
              Removes approved time off on these days. Days outside them stay
              off. To change their regular days, edit their schedule instead.
            </p>
          )}
        </Field>
        <Field label="From" htmlFor="to-start">
          <TextInput
            id="to-start"
            type="date"
            value={start}
            min={mode === 'request' ? today : undefined}
            onChange={(e) => {
              setStart(e.target.value)
              if (e.target.value > end) setEnd(e.target.value)
            }}
          />
        </Field>
        <Field label="To" htmlFor="to-end">
          <TextInput
            id="to-end"
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
        {kind !== 'available' && (
          <Field
            label="Note (optional)"
            htmlFor="to-note"
            className="sm:col-span-2"
          >
            <TextInput
              id="to-note"
              maxLength={500}
              value={note}
              placeholder={
                mode === 'request'
                  ? 'For example: fever, doctor’s note to follow'
                  : ''
              }
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}

export function ScheduleModal({
  member,
  hours,
  busy,
  onClose,
  onSave,
}: {
  member: TeamMember
  hours: BusinessHours | undefined
  busy: boolean
  onClose: () => void
  onSave: (s: {
    workDays: Array<number>
    workStart: string
    workEnd: string
  }) => Promise<boolean>
}) {
  const open = openWeekdays(hours)
  const [days, setDays] = useState<Array<number>>(member.work_days)
  const [start, setStart] = useState(hhmm(member.work_start))
  const [end, setEnd] = useState(hhmm(member.work_end))
  const closedPicked = days.filter((d) => !open.includes(d))
  const toggle = (d: number) =>
    setDays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort(),
    )

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={`${member.display_name}’s schedule`}
      subtitle="The days and hours they normally work."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            disabled={busy || start >= end}
            onClick={async () => {
              if (
                await onSave({ workDays: days, workStart: start, workEnd: end })
              )
                onClose()
            }}
          >
            Save schedule
          </Btn>
        </>
      }
    >
      <div className="grid gap-4">
        <Field
          label="Work days"
          hint={`${days.length} day${days.length === 1 ? '' : 's'} a week. Days the business is closed are greyed out.`}
        >
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_SHORT.map((label, i) => {
              const d = i + 1
              const closed = !open.includes(d)
              return (
                <CheckPill
                  key={d}
                  checked={days.includes(d)}
                  disabled={closed && !days.includes(d)}
                  onChange={() => toggle(d)}
                >
                  {label}
                </CheckPill>
              )
            })}
          </div>
        </Field>
        {closedPicked.length > 0 && (
          <Alert tone="warning" title="Business closed on some of these days">
            {closedPicked.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')} won’t
            count until the business opens those days (Settings → Hours).
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Starts" htmlFor="sch-start">
            <TextInput
              id="sch-start"
              type="time"
              step={900}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field
            label="Ends"
            htmlFor="sch-end"
            hint={start >= end ? 'Has to be after the start.' : undefined}
          >
            <TextInput
              id="sch-end"
              type="time"
              step={900}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-(--ink-3)">
          <Clock className="size-3.5" /> Default: Monday to Friday, 8 AM–5 PM.
        </p>
      </div>
    </Modal>
  )
}
