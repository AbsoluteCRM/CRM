import {
  addWeeks,
  endOfWeek,
  format,
  isToday,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useMemo, useState } from 'react'

import { endTime, fmtDuration, fmtTime } from '#/components/crm/format'
import { Btn, Card, IconBtn, Segmented, toast } from '#/components/crm/ui'
import { cn } from '#/lib/utils'
import type { LonLat } from '#/lib/map/geo'
import { RouteMap } from './RouteMap'
import { RouteStopsGrid } from './RouteStopsGrid'
import { STATUS_LABEL, StopUpdateModal } from './StopUpdateModal'
import type { DayRoute, RouteStop, StopUpdate } from './mock-routes'
import { getMockWeekRoutes } from './mock-routes'

export function WeekCalendar({
  initialDate,
  depot,
  getWeekRoutes = getMockWeekRoutes,
  onUpdateStop,
  canReschedule = true,
  completeHint,
}: {
  initialDate?: Date
  /** The yard, drawn on the route map as the start and end of each route. */
  depot?: LonLat | null
  /** Supplies the week's routes. Defaults to mock data (used by Storybook). */
  getWeekRoutes?: (weekAnchor: Date) => Array<DayRoute>
  /**
   * Persists an "Update" from a stop card. When omitted, updates are kept in
   * local state so the calendar still works standalone.
   */
  onUpdateStop?: (stop: RouteStop, update: StopUpdate) => void
  canReschedule?: boolean
  completeHint?: string
}) {
  const [anchor, setAnchor] = useState(() => initialDate ?? new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const [crewId, setCrewId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{
    stop: RouteStop
    date: string
  } | null>(null)
  const [localEdits, setLocalEdits] = useState<Record<string, StopUpdate>>({})

  const days = useMemo(() => {
    const base = getWeekRoutes(anchor)
    const byTime = (a: RouteStop, b: RouteStop) => a.time.localeCompare(b.time)
    if (onUpdateStop) {
      return base.map((d) => ({ ...d, stops: [...d.stops].sort(byTime) }))
    }
    // Standalone mode: apply local edits, moving stops between days if rescheduled.
    const placed = base.flatMap((d) =>
      d.stops.map((stop) => {
        const e = localEdits[stop.id] as StopUpdate | undefined
        if (!e) return { date: d.date, stop }
        return {
          date: e.date,
          stop: {
            ...stop,
            status: e.status,
            time: e.time,
            durationMinutes: e.durationMinutes,
            notes: e.notes || undefined,
          },
        }
      }),
    )
    return base.map((d) => ({
      date: d.date,
      stops: placed
        .filter((p) => p.date === d.date)
        .map((p) => p.stop)
        .sort(byTime),
    }))
  }, [anchor, getWeekRoutes, onUpdateStop, localEdits])

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 })
  const selectedDay = days.find((d) => d.date === selected)

  // One route per crew when stops carry crews; otherwise the whole day is one route.
  const crews = useMemo(() => {
    const seen = new Map<string, NonNullable<RouteStop['crew']>>()
    selectedDay?.stops.forEach((s) => {
      if (s.crew && !seen.has(s.crew.id)) seen.set(s.crew.id, s.crew)
    })
    return [...seen.values()]
  }, [selectedDay])
  const activeCrew = crews.find((c) => c.id === crewId) ?? crews.at(0)
  const routeStops = selectedDay
    ? activeCrew
      ? selectedDay.stops.filter((s) => s.crew?.id === activeCrew.id)
      : selectedDay.stops
    : []
  const lastStop = routeStops.at(-1)
  const workMinutes = routeStops.reduce((s, x) => s + x.durationMinutes, 0)
  const done = routeStops.filter((s) => s.status === 'completed').length

  const shiftWeek = (n: number) => {
    setAnchor((a) => addWeeks(a, n))
    setSelected(null)
  }

  const save = (stop: RouteStop, fromDate: string, update: StopUpdate) => {
    if (onUpdateStop) onUpdateStop(stop, update)
    else setLocalEdits((e) => ({ ...e, [stop.id]: update }))
    setEditing(null)
    if (update.date !== fromDate) {
      toast(
        `${stop.customer} moved to ${format(parseISO(update.date), 'EEE, MMM d')} at ${fmtTime(update.time)}`,
      )
    } else if (update.status !== stop.status) {
      toast(
        `${stop.customer} marked ${STATUS_LABEL[update.status].toLowerCase()}`,
      )
    } else {
      toast(`${stop.customer} updated`)
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="crm-display text-xl font-semibold text-(--ink)">
          {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          <IconBtn
            icon={ChevronLeft}
            label="Previous week"
            tone="outline"
            onClick={() => shiftWeek(-1)}
          />
          <Btn
            variant="outline"
            size="sm"
            onClick={() => {
              setAnchor(new Date())
              setSelected(null)
            }}
            className="rounded-xl border-(--line-2) bg-(--paper) text-(--ink-2) shadow-sm hover:border-(--leaf-500) hover:bg-(--sage) hover:text-(--ink)"
          >
            Today
          </Btn>
          <IconBtn
            icon={ChevronRight}
            label="Next week"
            tone="outline"
            onClick={() => shiftWeek(1)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const date = parseISO(day.date)
          const count = day.stops.length
          const active = selected === day.date
          const dayCrews = [
            ...new Map(
              day.stops.filter((s) => s.crew).map((s) => [s.crew!.id, s.crew!]),
            ).values(),
          ]
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={active}
              disabled={count === 0}
              onClick={() => {
                setSelected(day.date)
                setCrewId(null)
              }}
              className={cn(
                'cursor-pointer rounded-[20px] border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'border-(--leaf-900) bg-(--leaf-900) text-(--cream) shadow-[0_12px_28px_-14px_rgba(17,48,31,0.7)]'
                  : 'border-(--line) bg-(--paper) text-(--ink) hover:-translate-y-0.5 hover:border-(--leaf-500) disabled:hover:translate-y-0 disabled:hover:border-(--line)',
                isToday(date) && !active && 'ring-2 ring-(--lime)',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-between text-[11px] font-bold tracking-wider uppercase',
                  active ? 'text-(--lime)' : 'text-(--ink-3)',
                )}
              >
                {format(date, 'EEE')}
                {isToday(date) && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[10px] tracking-normal normal-case',
                      active
                        ? 'bg-(--lime) text-(--leaf-950)'
                        : 'bg-(--lime-200) text-(--leaf-900)',
                    )}
                  >
                    Today
                  </span>
                )}
              </div>
              <div className="crm-display mt-1 text-3xl leading-none font-semibold">
                {format(date, 'd')}
              </div>
              <div
                className={cn(
                  'mt-3 text-[13px] font-semibold',
                  active ? 'text-(--cream)/80' : 'text-(--ink-2)',
                )}
              >
                {count === 0
                  ? 'No jobs'
                  : `${count} ${count === 1 ? 'job' : 'jobs'}`}
              </div>
              {dayCrews.length > 0 && (
                <div className="mt-2 flex gap-1" aria-hidden="true">
                  {dayCrews.map((c) => (
                    <span
                      key={c.id}
                      className="size-2 rounded-full"
                      style={{ background: c.color }}
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDay ? (
        <section aria-label="Route stops" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-(--ink)">
                {format(parseISO(selectedDay.date), 'EEEE, MMMM d')}
                {activeCrew && ` · ${activeCrew.name}`}
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-(--ink-3)">
                <Clock className="size-3.5" />
                {routeStops.length} stops · {fmtDuration(workMinutes)} on site
                {lastStop &&
                  ` · done by ~${fmtTime(endTime(lastStop.time, lastStop.durationMinutes))}`}
                {` · ${done}/${routeStops.length} complete`}
              </p>
            </div>
            {crews.length > 1 && activeCrew && (
              <div className="crm-scroll max-w-full overflow-x-auto">
                <Segmented
                  size="sm"
                  value={activeCrew.id}
                  onChange={setCrewId}
                  options={crews.map((c) => ({
                    value: c.id,
                    label: (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: c.color }}
                        />
                        {c.name}
                      </span>
                    ),
                    count: selectedDay.stops.filter((s) => s.crew?.id === c.id)
                      .length,
                  }))}
                />
              </div>
            )}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="xl:sticky xl:top-4 xl:h-[560px] xl:self-start">
              <RouteMap stops={routeStops} depot={depot} />
            </div>
            <RouteStopsGrid
              stops={routeStops}
              onUpdate={(stop) => setEditing({ stop, date: selectedDay.date })}
            />
          </div>
        </section>
      ) : (
        <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-(--lime-100) text-(--leaf-700)">
            <CalendarDays className="size-6" />
          </span>
          <p className="text-base font-bold text-(--ink)">
            Select a day to see its route.
          </p>
          <p className="mt-1 max-w-sm text-sm text-(--ink-3)">
            Each crew’s stops are shown in driving order, with the map and an
            Update button on every stop.
          </p>
        </Card>
      )}

      {editing && (
        <StopUpdateModal
          stop={editing.stop}
          date={editing.date}
          canReschedule={canReschedule}
          completeHint={completeHint}
          onClose={() => setEditing(null)}
          onSave={(update) => save(editing.stop, editing.date, update)}
        />
      )}
    </div>
  )
}
