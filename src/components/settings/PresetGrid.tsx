import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '#/lib/utils'

/** A row of colour presets, each a small preview with its name. */
export default function PresetGrid<TValue>({
  label,
  presets,
  active,
  disabled,
  onPick,
  className,
}: {
  label: string
  presets: Array<{ name: string; value: TValue; preview: ReactNode }>
  /** Name of the selected preset, if any. */
  active: string | undefined
  disabled: boolean
  onPick: (value: TValue) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid grid-cols-3 gap-2', className)}
    >
      {presets.map((p) => {
        const on = p.name === active
        return (
          <button
            key={p.name}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onPick(p.value)}
            className={cn(
              'flex cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left ring-2 transition-colors disabled:cursor-default',
              on ? 'ring-(--leaf-600)' : 'ring-transparent hover:bg-(--cream)',
            )}
          >
            {p.preview}
            <span className="flex items-center gap-1 text-xs font-semibold">
              {on && <Check className="size-3.5 text-(--leaf-600)" />}
              {p.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
