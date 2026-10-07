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
    <div className="space-y-6 flex flex-col w-full mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() => shiftWeek(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setAnchor(new Date())
              setSelected(null)
            }}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() => shiftWeek(1)}
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
                'rounded-lg border bg-card p-4 text-left transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card',
                isToday(date) && 'border-primary',
                selected === day.date &&
                'bg-primary text-primary-foreground hover:bg-primary/90',
              )}
            >
              <div className="text-xs uppercase opacity-70">
                {format(date, 'EEE')}
              </div>
              <div className="text-2xl font-semibold">{format(date, 'd')}</div>
              <div className="mt-2 text-sm">
                {count === 0
                  ? 'No jobs'
                  : `${count} ${count === 1 ? 'job' : 'jobs'}`}
              </div>
            </button>
          )
        })}
      </div>

      {selectedDay ? (
        <section aria-label="Route stops" className="space-y-3 flex gap-x-3">
          <div className="flex w-1/2">
            <RouteMap stops={selectedDay.stops} apiKey={mapApiKey} />
          </div>
          <RouteStopsGrid stops={selectedDay.stops} />
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a day to see its route.
        </p>
      )}
    </div>
  )
}
