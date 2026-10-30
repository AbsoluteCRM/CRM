import { useState } from 'react'
import { Check, Palette, Save } from 'lucide-react'

import { Btn, Card, CardHeader } from '#/components/crm/ui'
import {
  PALETTE_PRESETS,
  samePalette,
  textOn,
} from '#/components/portal/palettes'
import { cn } from '#/lib/utils'
import type { PortalPalette } from '#/integrations/settings/schema'

const ROLES: Array<{ key: keyof PortalPalette; label: string; hint: string }> =
  [
    { key: 'primary', label: 'Primary', hint: 'Top bar and buttons' },
    { key: 'secondary', label: 'Secondary', hint: 'Intro and footer' },
    { key: 'accent', label: 'Accent', hint: 'Highlights' },
  ]

/** A miniature of the request page in the given colours. */
function Swatch({ palette }: { palette: PortalPalette }) {
  return (
    <span
      aria-hidden
      className="flex h-14 w-full flex-col overflow-hidden rounded-md border border-(--line)"
    >
      <span
        className="flex h-4 items-center justify-end px-1.5"
        style={{ background: palette.primary }}
      >
        <span
          className="h-1.5 w-4 rounded-[2px]"
          style={{ background: palette.accent }}
        />
      </span>
      <span className="flex-1" style={{ background: palette.secondary }}>
        <span
          className="mt-1.5 ml-1.5 block h-1.5 w-8 rounded-[2px]"
          style={{ background: palette.primary }}
        />
      </span>
      <span className="h-3 bg-[#f7f6f2]" />
    </span>
  )
}

/** Request page colours: five presets, or any three colours. */
export default function PortalPaletteCard({
  palette,
  saving,
  onSave,
}: {
  palette: PortalPalette
  saving: boolean
  /** Resolves false when the save failed. */
  onSave: (palette: PortalPalette) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(palette)
  const dirty = !samePalette(draft, palette)
  const preset = PALETTE_PRESETS.find((p) => samePalette(p.palette, draft))

  const save = (next: PortalPalette) => {
    setDraft(next)
    void onSave(next).then((ok) => {
      if (!ok) setDraft(palette)
    })
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Palette className="size-4 text-(--leaf-600)" /> Page colours
          </span>
        }
        subtitle="Pick a palette for your request page, or choose your own."
      />
      <div className="grid gap-5 p-5">
        <div
          role="radiogroup"
          aria-label="Palette"
          className="grid grid-cols-3 gap-3 sm:grid-cols-5"
        >
          {PALETTE_PRESETS.map((p) => {
            const active = preset?.name === p.name
            return (
              <button
                key={p.name}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => !active && save(p.palette)}
                className={cn(
                  'flex cursor-pointer flex-col gap-1.5 rounded-lg p-1.5 text-left ring-2 transition-colors disabled:cursor-default',
                  active
                    ? 'ring-(--leaf-600)'
                    : 'ring-transparent hover:bg-(--cream)',
                )}
              >
                <Swatch palette={p.palette} />
                <span className="flex items-center gap-1 text-xs font-semibold">
                  {active && <Check className="size-3.5 text-(--leaf-600)" />}
                  {p.name}
                </span>
              </button>
            )
          })}
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold">
            Custom colours{' '}
            {!preset && (
              <span className="font-normal text-(--ink-3)">(in use)</span>
            )}
          </legend>
          {ROLES.map((r) => (
            <label
              key={r.key}
              className="flex items-center gap-3 rounded-lg border border-(--line) px-3 py-2"
            >
              <span
                className="relative size-8 shrink-0 overflow-hidden rounded-md border border-(--line)"
                style={{ background: draft[r.key] }}
              >
                <input
                  type="color"
                  aria-label={`${r.label} colour`}
                  value={draft[r.key]}
                  disabled={saving}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [r.key]: e.target.value }))
                  }
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="block font-mono text-xs text-(--ink-3) uppercase">
                  {draft[r.key]}
                </span>
                <span className="block text-xs text-(--ink-3)">{r.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className="inline-flex h-9 items-center rounded-md px-3 text-xs font-semibold"
            style={{ background: draft.primary, color: textOn(draft.primary) }}
          >
            Button preview
          </span>
          <div className="flex gap-2">
            <Btn
              variant="ghost"
              disabled={!dirty || saving}
              onClick={() => setDraft(palette)}
            >
              Discard
            </Btn>
            <Btn
              icon={Save}
              disabled={!dirty || saving}
              onClick={() => save(draft)}
            >
              Save colours
            </Btn>
          </div>
        </div>
      </div>
    </Card>
  )
}
