import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'

import { APP_THEMES, themeFor } from '#/components/crm/appThemes'
import { cn } from '#/lib/utils'
import type { AppTheme } from '#/components/crm/appThemes'

/** A tiny picture of the app: menu bar, active item, and a button. */
function Preview({ theme }: { theme: AppTheme }) {
  return (
    <span
      aria-hidden
      className="flex h-14 w-full overflow-hidden rounded-md border border-(--line)"
    >
      <span
        className="flex w-4 flex-col items-center gap-1 pt-1.5"
        style={{ background: theme.menu }}
      >
        <span
          className="size-2 rounded-[3px]"
          style={{ background: theme.accent }}
        />
        <span className="size-2 rounded-[3px] bg-white/25" />
        <span className="size-2 rounded-[3px] bg-white/25" />
      </span>
      <span className="flex flex-1 flex-col justify-between bg-(--paper) p-1.5">
        <span
          className="h-1.5 w-8 rounded-[2px]"
          style={{ background: theme.brand }}
        />
        <span
          className="h-3 w-9 self-end rounded-[3px]"
          style={{ background: theme.menu }}
        />
      </span>
    </span>
  )
}

/**
 * Colour theme for the signed-in app. Saves the theme's brand colour; any
 * other colour gets a theme derived from it.
 */
export default function AppThemePicker({
  value,
  disabled,
  onPick,
}: {
  /** The stored brand colour. */
  value: string
  disabled: boolean
  onPick: (brand: string) => void
}) {
  const current = themeFor(value)
  const custom = current.name === 'Custom'
  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="Colour theme"
        className="grid grid-cols-3 gap-2"
      >
        {APP_THEMES.map((t) => {
          const active = current.name === t.name
          return (
            <button
              key={t.name}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => !active && onPick(t.brand)}
              className={cn(
                'flex cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left ring-2 transition-colors disabled:cursor-default',
                active
                  ? 'ring-(--leaf-600)'
                  : 'ring-transparent hover:bg-(--cream)',
              )}
            >
              <Preview theme={t} />
              <span className="flex items-center gap-1 text-xs font-semibold">
                {active && <Check className="size-3.5 text-(--leaf-600)" />}
                {t.name}
              </span>
            </button>
          )
        })}
      </div>
      <label
        className={cn(
          'flex items-center gap-3 rounded-lg border px-3 py-2',
          custom ? 'border-(--leaf-600)' : 'border-(--line)',
        )}
      >
        <CustomColour
          key={current.brand}
          value={current.brand}
          disabled={disabled}
          onPick={onPick}
        />
        <span className="min-w-0 text-sm">
          <span className="block font-semibold">
            Custom colour{' '}
            {custom && (
              <span className="font-normal text-(--ink-3)">(in use)</span>
            )}
          </span>
          <span className="block text-xs text-(--ink-3)">
            We build the menu and accent colours from it.
          </span>
        </span>
      </label>
    </div>
  )
}

/** A colour input that saves when the picker closes, not on every drag. */
function CustomColour({
  value,
  disabled,
  onPick,
}: {
  value: string
  disabled: boolean
  onPick: (brand: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const input = useRef<HTMLInputElement>(null)
  const latest = useRef({ value, onPick })
  latest.current = { value, onPick }

  // React's onChange fires while dragging; the native change event fires
  // once, when the colour is committed.
  useEffect(() => {
    const el = input.current
    if (!el) return
    const commit = () => {
      if (el.value !== latest.current.value) latest.current.onPick(el.value)
    }
    el.addEventListener('change', commit)
    return () => el.removeEventListener('change', commit)
  }, [])

  return (
    <span
      className="relative size-8 shrink-0 overflow-hidden rounded-md border border-(--line)"
      style={{ background: draft }}
    >
      <input
        type="color"
        aria-label="Custom brand colour"
        value={draft}
        disabled={disabled}
        ref={input}
        onChange={(e) => setDraft(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </span>
  )
}
