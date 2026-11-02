import { useId } from 'react'
import { Check, Eraser, Frame } from 'lucide-react'

import { Btn, Field, SelectInput, TextInput, Toggle } from '#/components/crm/ui'
import { cn } from '#/lib/utils'
import {
  AREA_PALETTE,
  PRIORITY_MAX,
  PRIORITY_MIN,
  WEEKDAYS,
  draftProblem,
} from './model'
import type { AreaDraft, CrewOption } from './model'

/** The details of the area being drawn or edited. */
export function AreaForm({
  draft,
  crews,
  busy,
  onChange,
  onRedraw,
  onUseView,
  onPreview,
  onCancel,
}: {
  draft: AreaDraft
  crews: Array<CrewOption>
  /** The impact preview is loading. */
  busy: boolean
  onChange: (patch: Partial<AreaDraft>) => void
  onRedraw: () => void
  onUseView: () => void
  onPreview: () => void
  onCancel: () => void
}) {
  const id = useId()
  const problem = draftProblem(draft)
  const isNew = draft.id === null
  const hasBoundary = draft.boundary !== null
  return (
    <form
      aria-label={isNew ? 'New service area' : `Edit ${draft.name}`}
      className="flex flex-col gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!problem) onPreview()
      }}
    >
      <Field label="Name" htmlFor={`${id}-name`}>
        <TextInput
          id={`${id}-name`}
          value={draft.name}
          maxLength={120}
          placeholder="e.g. Northwest quadrant"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>

      <Field
        label="Crew"
        htmlFor={`${id}-crew`}
        hint="Routes inside this area go to this crew."
      >
        <SelectInput
          id={`${id}-crew`}
          value={draft.crewId ?? ''}
          onChange={(e) => onChange({ crewId: e.target.value || null })}
        >
          <option value="">No crew yet</option>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[13px] font-semibold text-(--ink-2)">
          Colour
        </legend>
        <div className="flex flex-wrap gap-2">
          {AREA_PALETTE.map((c) => {
            const active = draft.color.toLowerCase() === c.value.toLowerCase()
            return (
              <button
                key={c.value}
                type="button"
                aria-label={c.name}
                aria-pressed={active}
                onClick={() => onChange({ color: c.value })}
                className={cn(
                  'inline-flex size-8 cursor-pointer items-center justify-center rounded-full border-2 outline-none focus-visible:ring-[3px] focus-visible:ring-(--lime)',
                  active ? 'border-(--ink)' : 'border-transparent',
                )}
                style={{ background: c.value }}
              >
                {active && <Check className="size-4 text-white" />}
              </button>
            )
          })}
        </div>
      </fieldset>

      <Field
        label="Priority"
        htmlFor={`${id}-priority`}
        hint="Where areas overlap, the higher priority wins; then the smaller area."
      >
        <TextInput
          id={`${id}-priority`}
          type="number"
          inputMode="numeric"
          min={PRIORITY_MIN}
          max={PRIORITY_MAX}
          step={1}
          value={Number.isNaN(draft.priority) ? '' : draft.priority}
          className="w-28"
          onChange={(e) =>
            onChange({
              priority: e.target.value === '' ? NaN : Number(e.target.value),
            })
          }
        />
      </Field>

      <div className="flex flex-col gap-3 rounded-2xl bg-(--cream) p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-(--ink)">Add rotation</p>
            <p className="text-xs text-(--ink-3)">
              Send a different crew on chosen weekdays.
            </p>
          </div>
          <Toggle
            label="Add rotation"
            checked={draft.rotationOn}
            onChange={(on) => onChange({ rotationOn: on })}
          />
        </div>
        {draft.rotationOn && (
          <div className="flex flex-col gap-2">
            {WEEKDAYS.map(({ value, label }) => (
              <div key={value} className="flex items-center gap-3">
                <label
                  htmlFor={`${id}-rot-${value}`}
                  className="w-24 text-[13px] font-semibold text-(--ink-2)"
                >
                  {label}
                </label>
                <SelectInput
                  id={`${id}-rot-${value}`}
                  className="flex-1"
                  value={draft.rotations[value] ?? ''}
                  onChange={(e) => {
                    const next = { ...draft.rotations }
                    if (e.target.value) next[value] = e.target.value
                    else delete next[value]
                    onChange({ rotations: next })
                  }}
                >
                  <option value="">Area crew</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Btn
          variant="outline"
          size="sm"
          icon={hasBoundary ? Eraser : undefined}
          onClick={onRedraw}
        >
          {hasBoundary ? 'Redraw on map' : 'Draw on map'}
        </Btn>
        <Btn variant="outline" size="sm" icon={Frame} onClick={onUseView}>
          Use map view as boundary
        </Btn>
      </div>
      {!hasBoundary && (
        <p className="text-xs text-(--ink-3)">
          Click the map to place corners and click the first corner to close the
          shape. Drag a corner afterwards to adjust it.
        </p>
      )}

      {hasBoundary && problem && (
        <p role="alert" className="text-xs font-semibold text-(--clay)">
          {problem}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onCancel}>
          Cancel
        </Btn>
        <Btn type="submit" disabled={problem !== null || busy}>
          {busy ? 'Checking impact' : 'Review impact'}
        </Btn>
      </div>
    </form>
  )
}
