import { Clock, MapPin } from 'lucide-react'

import type { RouteStop } from './mock-routes'

export function RouteStopCard({
  stop,
  index,
}: {
  stop: RouteStop
  index: number
}) {
  return (
    <div
      role="listitem"
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-(--line) bg-(--paper) shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_30px_-18px_rgba(17,48,31,0.25)] transition hover:-translate-y-0.5 hover:border-(--leaf-500) hover:shadow-md"
    >
      <div className="flex items-start gap-3 bg-(--leaf-900) p-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-(--lime) text-xs font-bold text-(--leaf-950)">
          {index + 1}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-(--cream)">
            {stop.customer}
          </h3>
          <p className="mt-0.5 text-xs text-(--cream)/70">{stop.jobType}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-start gap-2 p-4">
        <p className="flex items-start gap-2 text-[13px] text-(--ink-2)">
          <MapPin className="mt-0.5 size-4 shrink-0 text-(--leaf-600)" />
          <span>{stop.address}</span>
        </p>
        <p className="flex items-center gap-2 text-[13px] text-(--ink-2)">
          <Clock className="size-4 shrink-0 text-(--leaf-600)" />
          <span>
            {stop.time} · {stop.durationMinutes} min
          </span>
        </p>
        {stop.notes ? (
          <p className="mt-2 text-[13px] text-(--ink-3) italic">{stop.notes}</p>
        ) : null}
      </div>

      <button className="mx-4 mb-4 rounded-xl bg-(--lime-100) px-4 py-2 text-xs font-bold text-(--leaf-900) transition hover:bg-(--lime-200) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--leaf-500)">
        Update
      </button>
    </div>
  )
}
