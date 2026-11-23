import { FlaskConical } from 'lucide-react'

import { Badge } from '#/components/crm/ui'
import { cn } from '#/lib/utils'

/**
 * Marks values that come from the in-memory demo store (src/mocks), not the
 * database. Put it beside any card, column or tab that renders mock data next
 * to live data, and remove it when that value is wired to a real procedure.
 */
export function SampleDataBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="sun"
      className={cn('px-2 text-[10px] tracking-normal normal-case', className)}
    >
      <span
        className="inline-flex items-center gap-1"
        title="Demo data. Not saved, and not from your account."
      >
        <FlaskConical className="size-3" aria-hidden />
        Sample data
      </span>
    </Badge>
  )
}

/** A short note above a panel whose whole content is demo data. */
export function SampleDataNote({ children }: { children?: string }) {
  return (
    <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-(--ink-3)">
      <SampleDataBadge />
      {children ?? 'Demo data. Not saved, and not from your account.'}
    </p>
  )
}
