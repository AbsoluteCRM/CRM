import { Clock, MapPin, PencilLine, StickyNote } from 'lucide-react'

import { cn } from '#/lib/utils'
import { fmtTime } from '#/components/crm/format'
import type { RouteStop, StopStatus } from './mock-routes'
import { STATUS_LABEL } from './StopUpdateModal'

const STATUS_STYLES: Record<StopStatus, string> = {
  scheduled: 'bg-(--sky-100) text-(--sky)',
  'in-progress': 'bg-(--sun-100) text-(--sun)',
  completed: 'bg-(--sage) text-(--leaf-700)',
}

export function RouteStopCard({
  stop,
  index,
  onUpdate,
}: {
  stop: RouteStop
  index: number
  onUpdate?: (stop: RouteStop) => void
}) {
  const accent = stop.crew?.color ?? 'var(--leaf-600)'
  return (
    <div
      role="listitem"
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-[18px] border border-(--line) bg-(--paper) shadow-[0_10px_30px_-22px_rgba(17,48,31,0.45)] transition-shadow hover:shadow-md',
        stop.status === 'completed' && 'opacity-80',
      )}
    >
      <div className="flex items-start gap-3 p-3.5 pb-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: accent }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-(--ink)">
            {stop.customer}
          </h3>
          <p className="truncate text-xs text-(--ink-2)">{stop.jobType}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
            STATUS_STYLES[stop.status],
          )}
        >
          {STATUS_LABEL[stop.status]}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-3 text-[13px] text-(--ink-2)">
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-(--ink-3)" />
          <span className="line-clamp-2">{stop.address}</span>
        </p>
        <p className="flex items-center gap-1.5 font-semibold text-(--ink)">
          <Clock className="size-3.5 shrink-0 text-(--ink-3)" />
          {fmtTime(stop.time)} · {stop.durationMinutes} min
        </p>
        {stop.notes ? (
          <p className="mt-1 flex items-start gap-1.5 rounded-xl bg-(--sun-100) px-2.5 py-1.5 text-xs text-(--ink)">
            <StickyNote className="mt-px size-3.5 shrink-0 text-(--sun)" />
            <span className="line-clamp-2">{stop.notes}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-auto border-t border-(--line) p-2.5">
        <button
          type="button"
          onClick={() => onUpdate?.(stop)}
          disabled={!onUpdate}
          aria-label={`Update ${stop.customer}`}
          className="flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-(--sage) text-xs font-semibold text-(--leaf-800) transition-colors hover:bg-(--lime-200) focus-visible:ring-[3px] focus-visible:ring-(--lime) focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PencilLine className="size-3.5" />
          Update
        </button>
      </div>
    </div>
  )
}
