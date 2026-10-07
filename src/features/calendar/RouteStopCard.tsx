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
    <div role="listitem" className="rounded-lg flex flex-col border border-gray-300 bg-card hover:cursor-pointer hover:shadow-md hover:bg-gray-100 duration-200">
      <div className="flex items-start p-1 gap-3 bg-green-900 overflow-hidden rounded-t-lg">
        <span className="flex size-5 shrink-0 items-center justify-center bg-black rounded-full text-white text-xs font-semibold">
          {index + 1}
        </span>
        <div className="min-w-0 flex">
          <div className="flex flex-col">
            <h3 className="font-medium text-white">{stop.customer}</h3>
            <p className="text-sm text-white">{stop.jobType}</p>

            {/* <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs capitalize',
                STATUS_STYLES[stop.status],
              )}
            >
              {stop.status.replace('-', ' ')}
            </span> */}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col items-start gap-1 p-3">
        <p className="flex gap-1 text-sm text-muted-foreground">
          <MapPin className="size-5" /> {stop.address}
        </p>
        <p className="flex gap-1 text-sm text-muted-foreground text-black">
          <Clock className="size-3" /> {stop.time} · {stop.durationMinutes}{' '}
          min
        </p>
        {stop.notes ? (
          <p className="mt-5 text-sm italic text-muted-foreground">
            {stop.notes}
          </p>
        ) : <span className="mt-1 text-sm italic text-muted-foreground"></span>}


      </div>

      <button className="w-3/4 mx-auto text-center mb-3 text-xs rounded-lg bg-green-100 px-4 py-2 text-green-900 hover:cursor-pointer">
        Update
      </button>
    </div>
  )
}
