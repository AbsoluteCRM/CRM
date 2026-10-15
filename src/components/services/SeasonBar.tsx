import { MONTHS, parseDate, todayISO } from '#/components/crm/format'
import { inSeason } from '#/components/crm/store'
import { cn } from '#/lib/utils'
import type { Service } from '#/components/crm/types'

type Seasonal = Pick<Service, 'season' | 'color'>

export function seasonText(s: Pick<Service, 'season'>) {
  if (!s.season) return 'Year-round'
  return `${MONTHS[s.season.start - 1]} → ${MONTHS[s.season.end - 1]}`
}

export default function SeasonBar({
  service,
  className,
  currentMonth = parseDate(todayISO()).getMonth() + 1,
}: {
  service: Seasonal
  className?: string
  currentMonth?: number
}) {
  const now = currentMonth
  return (
    <div
      className={cn('grid grid-cols-12 gap-0.5', className)}
      aria-label={`Available ${seasonText(service)}`}
    >
      {MONTHS.map((m, i) => {
        const on = inSeason(service, i + 1)
        return (
          <div key={m} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                'h-2 w-full rounded-full',
                i + 1 === now && 'ring-2 ring-(--leaf-900) ring-offset-1',
              )}
              style={{ background: on ? service.color : 'var(--sage)' }}
            />
            <span
              className={cn(
                'text-[9px] font-semibold',
                i + 1 === now ? 'text-(--ink)' : 'text-(--ink-3)',
              )}
            >
              {m[0]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
