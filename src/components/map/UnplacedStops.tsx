import { MapPinOff } from 'lucide-react'

import { cn } from '#/lib/utils'

/** Stops that have no coordinates yet, listed under a map instead of placed on it. */
export function UnplacedStops({
  stops,
  className,
}: {
  stops: Array<{ id: string; label: string; title: string; detail?: string }>
  className?: string
}) {
  if (stops.length === 0) return null
  return (
    <section
      aria-label="Stops not on the map"
      className={cn(
        'rounded-2xl border border-dashed border-(--line-2) bg-(--paper) px-4 py-3',
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-(--ink-2)">
        <MapPinOff className="size-3.5" />
        Not on the map ({stops.length}): no location yet
      </p>
      <ul className="mt-2 space-y-1">
        {stops.map((s) => (
          <li key={s.id} className="flex gap-2 text-xs text-(--ink-3)">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--sage) text-[10px] font-bold text-(--ink-2)">
              {s.label}
            </span>
            <span className="min-w-0">
              <span className="font-semibold text-(--ink)">{s.title}</span>
              {s.detail && <span className="block truncate">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
