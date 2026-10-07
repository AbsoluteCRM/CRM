import { Clock, MapPin } from 'lucide-react'

import { cn } from '#/lib/utils'
import type { RouteStop, StopStatus } from './mock-routes'

const STATUS_STYLES: Record<StopStatus, string> = {
  scheduled: 'bg-secondary text-secondary-foreground',
  'in-progress': 'bg-amber-100 text-amber-900',
  completed: 'bg-emerald-100 text-emerald-900',
}

export function RouteStopCard({
  stop,
  index,
}: {
  stop: RouteStop
  index: number
}) {
  return (
    <div role="listitem" className="h-full rounded-lg border border-gray-300 bg-card p-3 hover:cursor-pointer hover:shadow-md hover:bg-gray-100 duration-200">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-900 text-xs font-semibold text-primary-foreground">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{stop.customer}</h3>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs capitalize',
                STATUS_STYLES[stop.status],
              )}
            >
              {stop.status.replace('-', ' ')}
            </span>
          </div>
          <p className="text-sm">{stop.jobType}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5" /> {stop.address}
          </p>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-3.5" /> {stop.time} · {stop.durationMinutes}{' '}
            min
          </p>
          {stop.notes ? (
            <p className="mt-1 text-sm italic text-muted-foreground">
              {stop.notes}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
