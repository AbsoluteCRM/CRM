import { useId } from 'react'
import { Crosshair, Frame } from 'lucide-react'

import { Btn, Field, TextInput } from '#/components/crm/ui'
import { regionInput } from './model'
import type { RegionDraft } from './model'

/**
 * Adds a city. No provider is called: the centre is typed, picked on the map,
 * or taken from the current view ("Frame this view" also saves its extent).
 */
export function RegionForm({
  draft,
  picking,
  saving,
  onChange,
  onTogglePick,
  onFrameView,
  onSave,
  onCancel,
}: {
  draft: RegionDraft
  picking: boolean
  saving: boolean
  onChange: (patch: Partial<RegionDraft>) => void
  onTogglePick: () => void
  onFrameView: () => void
  onSave: () => void
  onCancel: () => void
}) {
  const id = useId()
  const result = regionInput(draft)
  return (
    <form
      aria-label="Add a city"
      className="flex flex-col gap-4 p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (result.ok) onSave()
      }}
    >
      <Field label="City name" htmlFor={`${id}-name`}>
        <TextInput
          id={`${id}-name`}
          value={draft.name}
          maxLength={120}
          placeholder="e.g. Calgary"
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Longitude" htmlFor={`${id}-lon`}>
          <TextInput
            id={`${id}-lon`}
            inputMode="decimal"
            value={draft.lon}
            placeholder="-114.0719"
            onChange={(e) => onChange({ lon: e.target.value, bbox: null })}
          />
        </Field>
        <Field label="Latitude" htmlFor={`${id}-lat`}>
          <TextInput
            id={`${id}-lat`}
            inputMode="decimal"
            value={draft.lat}
            placeholder="51.0447"
            onChange={(e) => onChange({ lat: e.target.value, bbox: null })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn
          variant={picking ? 'accent' : 'outline'}
          size="sm"
          icon={Crosshair}
          aria-pressed={picking}
          onClick={onTogglePick}
        >
          {picking ? 'Click the map' : 'Pick centre on map'}
        </Btn>
        <Btn variant="outline" size="sm" icon={Frame} onClick={onFrameView}>
          Frame this view
        </Btn>
      </div>
      <p className="text-xs text-(--ink-3)">
        {draft.bbox
          ? 'The city will open at the framed view.'
          : 'Pan and zoom the map, then frame the view to save how much of the map the city shows.'}
      </p>
      {!result.ok && draft.name.trim() !== '' && (
        <p role="alert" className="text-xs font-semibold text-(--clay)">
          {result.problem}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" onClick={onCancel}>
          Cancel
        </Btn>
        <Btn type="submit" disabled={!result.ok || saving}>
          {saving ? 'Adding' : 'Add city'}
        </Btn>
      </div>
    </form>
  )
}
