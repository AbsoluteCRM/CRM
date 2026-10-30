import { addDays, parseDate } from '#/components/crm/format'
import { WEEKDAYS } from '#/integrations/settings/schema'
import type { BusinessHours } from '#/integrations/settings/schema'
import type { TimeOff } from '#/integrations/teams/availability'
import type { TeamMember } from '#/integrations/teams/teams'

export type DayState =
  | 'available'
  | 'off_day'
  | 'closed'
  | 'sick'
  | 'vacation'
  | 'personal'
  | 'pending'

export const DAY_STATE_LABEL: Record<DayState, string> = {
  available: 'Working',
  off_day: 'Day off',
  closed: 'Business closed',
  sick: 'Sick',
  vacation: 'Vacation',
  personal: 'Personal',
  pending: 'Request pending',
}

export const DAY_STATE_STYLE: Record<DayState, string> = {
  available: 'bg-(--lime-200) text-(--leaf-900)',
  off_day: 'bg-(--cream-2) text-(--ink-3)',
  closed: 'bg-(--line) text-(--ink-3)',
  sick: 'bg-(--clay-100) text-(--clay)',
  vacation: 'bg-(--sky-100) text-(--sky)',
  personal: 'bg-(--violet-100) text-(--violet)',
  pending:
    'bg-(--sun-100) text-(--sun) outline-1 outline-dashed outline-(--sun) -outline-offset-2',
}

export const KIND_LABEL: Record<TimeOff['kind'], string> = {
  sick: 'Sick',
  vacation: 'Vacation',
  personal: 'Personal',
  day_off: 'Day off',
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string) {
  return ((parseDate(date).getDay() + 6) % 7) + 1
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Whether the business is open on that date's weekday (Settings → Hours). */
export function businessOpen(hours: BusinessHours | undefined, date: string) {
  if (!hours) return true
  return !hours[WEEKDAYS[isoWeekday(date) - 1]].closed
}

/** Days the business is open, as ISO weekdays. */
export function openWeekdays(hours: BusinessHours | undefined) {
  return [1, 2, 3, 4, 5, 6, 7].filter(
    (d) => !hours || !hours[WEEKDAYS[d - 1]].closed,
  )
}

/**
 * What a member's day looks like. Business closure wins, then approved time
 * off, then their weekly schedule. A pending request shows on a day they'd
 * otherwise work, so managers see what's waiting.
 */
export function dayState(
  member: Pick<TeamMember, 'id' | 'work_days'>,
  date: string,
  hours: BusinessHours | undefined,
  timeOff: Array<TimeOff>,
): DayState {
  if (!businessOpen(hours, date)) return 'closed'
  const mine = timeOff.filter(
    (t) =>
      t.member_id === member.id && t.start_date <= date && t.end_date >= date,
  )
  const approved = mine.find((t) => t.status === 'approved')
  if (approved) return approved.kind === 'day_off' ? 'off_day' : approved.kind
  if (!member.work_days.includes(isoWeekday(date))) return 'off_day'
  if (mine.some((t) => t.status === 'pending')) return 'pending'
  return 'available'
}

export const hhmm = (t: string) => t.slice(0, 5)

export type Away = { kind: TimeOff['kind']; returns: string | null }

/**
 * Whether a member is out on approved time off on `date`, and the next day
 * they're scheduled to work after it: back-to-back time off is followed
 * through, and their days off and closed business days are skipped.
 * `returns` is null when no work day comes up within 60 days.
 */
export function awayOn(
  member: Pick<TeamMember, 'id' | 'work_days'>,
  date: string,
  hours: BusinessHours | undefined,
  timeOff: Array<TimeOff>,
): Away | null {
  const approved = timeOff.filter(
    (t) => t.member_id === member.id && t.status === 'approved',
  )
  const covering = (d: string) =>
    approved.find((t) => t.start_date <= d && t.end_date >= d)
  const now = covering(date)
  if (!now) return null
  for (let i = 1, d = addDays(date, 1); i <= 60; i++, d = addDays(d, 1)) {
    if (covering(d)) continue
    if (businessOpen(hours, d) && member.work_days.includes(isoWeekday(d))) {
      return { kind: now.kind, returns: d }
    }
  }
  return { kind: now.kind, returns: null }
}

/** "11/03" */
export const monthDay = (iso: string) =>
  `${iso.slice(5, 7)}/${iso.slice(8, 10)}`

const DAY_ABBR = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su']

/**
 * ISO weekdays as short runs: [1..5] → "M–F", [2..7] → "T–Su",
 * [5,6,7,1,2] → "F–T" (wrapping past Sunday), [1,3,5] → "M, W, F".
 */
export function compactDays(days: Array<number>) {
  const on = new Set(days)
  if (on.size === 0) return 'No days'
  if (on.size === 7) return 'Every day'
  const prev = (d: number) => (d === 1 ? 7 : d - 1)
  const next = (d: number) => (d === 7 ? 1 : d + 1)
  const runs: Array<string> = []
  for (let d = 1; d <= 7; d++) {
    if (!on.has(d) || on.has(prev(d))) continue
    let end = d
    while (on.has(next(end))) end = next(end)
    runs.push(
      end === d ? DAY_ABBR[d - 1] : `${DAY_ABBR[d - 1]}–${DAY_ABBR[end - 1]}`,
    )
  }
  return runs.join(', ')
}

/** "08:00" → "8a", "16:30" → "4:30p". */
const shortTime = (t: string) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`
}

export const compactSchedule = (
  m: Pick<TeamMember, 'work_days' | 'work_start' | 'work_end'>,
) =>
  m.work_days.length === 0
    ? 'No regular days'
    : `${compactDays(m.work_days)} · ${shortTime(m.work_start)}–${shortTime(m.work_end)}`

/**
 * A crew's schedule, read from its members (it isn't stored on the crew). The
 * most common schedule wins; `varies` lists anyone on a different one.
 */
export function crewSchedule(
  members: Array<
    Pick<TeamMember, 'display_name' | 'work_days' | 'work_start' | 'work_end'>
  >,
) {
  if (members.length === 0) return null
  const counts = new Map<string, number>()
  for (const m of members) {
    const s = compactSchedule(m)
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  const [label] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    label,
    varies: members
      .filter((m) => compactSchedule(m) !== label)
      .map((m) => `${m.display_name}: ${compactSchedule(m)}`),
  }
}
