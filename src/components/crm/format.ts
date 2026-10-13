/** Formatting and date helpers. Dates are plain 'YYYY-MM-DD' strings in the org's local time. */

const moneyFmt = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
})
const moneyFmtCents = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
})

/** Money is stored as integer cents (ADR 0004). */
export function money(cents: number, withCents = false) {
  return (withCents || cents % 100 !== 0 ? moneyFmtCents : moneyFmt).format(
    cents / 100,
  )
}

export function compactMoney(cents: number) {
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1_000_000)
    return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (Math.abs(dollars) >= 10_000) return `$${Math.round(dollars / 1000)}k`
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${Math.round(dollars)}`
}

export function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO() {
  return toISODate(new Date())
}

export function addDays(iso: string, days: number) {
  const d = parseDate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function diffDays(a: string, b: string) {
  return Math.round(
    (parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000,
  )
}

/** Monday-based week start. */
export function startOfWeek(iso: string) {
  const d = parseDate(iso)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toISODate(d)
}

export function startOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`
}

export function addMonths(iso: string, months: number) {
  const d = parseDate(iso)
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  return toISODate(d)
}

export function isWeekend(iso: string) {
  const day = parseDate(iso).getDay()
  return day === 0 || day === 6
}

export function fmtDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  return parseDate(iso).toLocaleDateString('en-CA', opts)
}

export function fmtLongDate(iso: string) {
  return fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function fmtWeekday(iso: string, style: 'short' | 'long' = 'short') {
  return parseDate(iso).toLocaleDateString('en-CA', { weekday: style })
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(mins: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)))
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`
}

export function fmtTime(hhmm: string) {
  const mins = toMinutes(hhmm)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`
}

export function endTime(start: string, durationMinutes: number) {
  return fromMinutes(toMinutes(start) + durationMinutes)
}

export function fmtDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function relativeTime(isoDateTime: string) {
  const diff = Date.now() - new Date(isoDateTime).getTime()
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoDateTime).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  })
}

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
}

let idCounter = 0
export function uid(prefix = 'id') {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`
}

export function pluralize(n: number, word: string, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`
}
