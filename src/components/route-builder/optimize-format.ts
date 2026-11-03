import { fmtDuration } from '#/components/crm/format'

/** "12.4 km". */
export function fmtKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`
}

/** "1h 5m" from seconds, rounded to the minute (at least 1 min for any drive). */
export function fmtSeconds(seconds: number): string {
  return fmtDuration(seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0)
}

/** "9:12 a.m." in the browser's local time. */
export function fmtClock(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}
