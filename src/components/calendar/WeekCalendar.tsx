import { useMemo, useState } from 'react'
import {
  addWeeks,
  endOfWeek,
  format,
  isToday,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'
import { RouteMap } from './RouteMap'
import { RouteStopsGrid } from './RouteStopsGrid'
import { getMockWeekRoutes } from './mock-routes'

export function WeekCalendar({
  initialDate,
  mapApiKey,
}: {
  initialDate?: Date
  mapApiKey?: string
}) {
  const [anchor, setAnchor] = useState(() => initialDate ?? new Date())
  const [selected, setSelected] = useState<string | null>(null)

  const days = useMemo(() => getMockWeekRoutes(anchor), [anchor])
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 })
  const selectedDay = days.find((d) => d.date === selected)

  const shiftWeek = (n: number) => {
    setAnchor((a) => addWeeks(a, n))
    setSelected(null)
  }

  return (
    <div className="mx-auto flex w-full flex-col gap-6 text-(--ink)">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="crm-display text-2xl font-semibold text-(--ink)">
          {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => shiftWeek(-1)}
            className="rounded-xl border-(--line-2) bg-(--paper) text-(--ink-2) shadow-sm hover:border-(--leaf-500) hover:bg-(--sage) hover:text-(--ink)"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setAnchor(new Date())
              setSelected(null)
            }}
            className="rounded-xl border-(--line-2) bg-(--paper) text-(--ink-2) shadow-sm hover:border-(--leaf-500) hover:bg-(--sage) hover:text-(--ink)"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => shiftWeek(1)}
            className="rounded-xl border-(--line-2) bg-(--paper) text-(--ink-2) shadow-sm hover:border-(--leaf-500) hover:bg-(--sage) hover:text-(--ink)"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const date = parseISO(day.date)
          const count = day.stops.length
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={selected === day.date}
              disabled={count === 0}
              onClick={() => setSelected(day.date)}
              className={cn(
                'rounded-2xl border border-(--line) bg-(--paper) p-4 text-left text-(--ink) shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_30px_-18px_rgba(17,48,31,0.25)] transition hover:-translate-y-0.5 hover:border-(--leaf-500) hover:bg-(--lime-100) hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--leaf-500) disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:bg-(--paper) disabled:hover:shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_30px_-18px_rgba(17,48,31,0.25)]',
                isToday(date) && 'border-(--leaf-600) bg-(--lime-100)',
                selected === day.date &&
                  'border-(--leaf-900) bg-(--leaf-900) text-(--cream) hover:border-(--leaf-800) hover:bg-(--leaf-800)',
              )}
            >
              <div
                className={cn(
                  'text-[11px] font-bold tracking-[0.12em] text-(--ink-3) uppercase',
                  selected === day.date && 'text-(--cream)/65',
                )}
              >
                {format(date, 'EEE')}
              </div>
              <div className="crm-display mt-1 text-3xl font-semibold">
                {format(date, 'd')}
              </div>
              <div
                className={cn(
                  'mt-3 inline-flex rounded-full bg-(--cream) px-2.5 py-1 text-xs font-semibold text-(--ink-2)',
                  selected === day.date && 'bg-(--lime) text-(--leaf-950)',
                )}
              >
                {count === 0
                  ? 'No jobs'
                  : `${count} ${count === 1 ? 'job' : 'jobs'}`}
              </div>
            </button>
          )
        })}
      </div>

      {selectedDay ? (
        <section
          aria-label="Route stops"
          className="flex lg:flex-1 flex-col gap-3"
        >
          <div className="flex lg:w-1/2">
            <RouteMap stops={selectedDay.stops} apiKey={mapApiKey} />
          </div>
          <RouteStopsGrid stops={selectedDay.stops} />
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-(--line-2) bg-(--paper)/80 px-4 py-5 text-sm text-(--ink-2)">
          Select a day to see its route.
        </p>
      )}
    </div>
  )
}
