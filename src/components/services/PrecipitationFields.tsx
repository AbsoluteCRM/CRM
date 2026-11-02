import { useId } from 'react'

import { Field, SelectInput } from '#/components/crm/ui'
import type { Service } from '#/integrations/services/types'

export type PrecipitationPreferences = Pick<
  Service,
  'precipitation_type' | 'precipitation_action'
>

export default function PrecipitationFields({
  value,
  onChange,
  disabled = false,
}: {
  value: PrecipitationPreferences
  onChange: (value: PrecipitationPreferences) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <fieldset
      disabled={disabled}
      className="rounded-2xl border border-(--line) bg-(--cream)/60 p-4 sm:col-span-2"
    >
      <legend className="sr-only">Weather preferences</legend>
      <p className="text-sm font-bold">Weather preferences</p>
      <p id={`${id}-help`} className="mt-1 text-xs text-(--ink-3)">
        Saved for future weather recommendations. No flags are generated yet.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Precipitation" htmlFor={`${id}-type`}>
          <SelectInput
            id={`${id}-type`}
            aria-describedby={`${id}-help`}
            value={value.precipitation_type}
            onChange={(e) => {
              const type = e.target.value as Service['precipitation_type']
              onChange({
                precipitation_type: type,
                precipitation_action:
                  type === 'none'
                    ? 'none'
                    : value.precipitation_action === 'none'
                      ? 'schedule'
                      : value.precipitation_action,
              })
            }}
          >
            <option value="none">No dependency</option>
            <option value="rain">Rain</option>
            <option value="snow">Snow</option>
            <option value="any">Rain or snow</option>
          </SelectInput>
        </Field>
        <Field label="Suggested action" htmlFor={`${id}-action`}>
          <SelectInput
            id={`${id}-action`}
            value={value.precipitation_action}
            disabled={value.precipitation_type === 'none'}
            onChange={(e) =>
              onChange({
                ...value,
                precipitation_action: e.target
                  .value as Service['precipitation_action'],
              })
            }
          >
            {value.precipitation_type === 'none' && (
              <option value="none">None</option>
            )}
            <option value="schedule">Schedule</option>
            <option value="reschedule">Reschedule</option>
          </SelectInput>
        </Field>
      </div>
    </fieldset>
  )
}
