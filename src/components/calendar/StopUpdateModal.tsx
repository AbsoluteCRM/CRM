import { useState } from 'react'
import { CheckCircle2, Save } from 'lucide-react'

import {
  Btn,
  Field,
  Modal,
  Segmented,
  SelectInput,
  TextArea,
  TextInput,
} from '#/components/crm/ui'
import { fmtDuration } from '#/components/crm/format'
import type { RouteStop, StopStatus, StopUpdate } from './mock-routes'

const DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240]

export const STATUS_LABEL: Record<StopStatus, string> = {
  scheduled: 'Scheduled',
  'in-progress': 'In progress',
  completed: 'Completed',
}

/** Edit a route stop: status, reschedule (date/time/duration), and crew notes. */
export function StopUpdateModal({
  stop,
  date,
  canReschedule = true,
  completeHint,
  onClose,
  onSave,
}: {
  stop: RouteStop
  date: string
  canReschedule?: boolean
  /** Extra line shown when the stop is being marked complete. */
  completeHint?: string
  onClose: () => void
  onSave: (update: StopUpdate) => void
}) {
  const [form, setForm] = useState<StopUpdate>({
    status: stop.status,
    date,
    time: stop.time,
    durationMinutes: stop.durationMinutes,
    notes: stop.notes ?? '',
  })
  const set = <TKey extends keyof StopUpdate>(
    key: TKey,
    value: StopUpdate[TKey],
  ) => setForm((f) => ({ ...f, [key]: value }))
  const completing = form.status === 'completed' && stop.status !== 'completed'
  const valid = form.date && form.time && form.durationMinutes > 0

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={`Update stop · ${stop.customer}`}
      subtitle={`${stop.jobType} · ${stop.address}`}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            icon={completing ? CheckCircle2 : Save}
            disabled={!valid}
            onClick={() => onSave(form)}
          >
            {completing ? 'Mark complete' : 'Save changes'}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" className="sm:col-span-2">
          <Segmented<StopStatus>
            value={form.status}
            onChange={(v) => set('status', v)}
            options={(Object.keys(STATUS_LABEL) as Array<StopStatus>).map(
              (s) => ({ value: s, label: STATUS_LABEL[s] }),
            )}
          />
          {completing && completeHint && (
            <p className="text-xs text-(--leaf-700)">{completeHint}</p>
          )}
        </Field>
        <Field label="Date">
          <TextInput
            type="date"
            value={form.date}
            disabled={!canReschedule}
            onChange={(e) => set('date', e.target.value)}
          />
        </Field>
        <Field label="Start time">
          <TextInput
            type="time"
            step={900}
            value={form.time}
            disabled={!canReschedule}
            onChange={(e) => set('time', e.target.value)}
          />
        </Field>
        <Field label="Duration" className="sm:col-span-2">
          <SelectInput
            value={String(form.durationMinutes)}
            disabled={!canReschedule}
            onChange={(e) => set('durationMinutes', Number(e.target.value))}
          >
            {[...new Set([...DURATIONS, form.durationMinutes])]
              .sort((a, b) => a - b)
              .map((d) => (
                <option key={d} value={d}>
                  {fmtDuration(d)}
                </option>
              ))}
          </SelectInput>
        </Field>
        <Field
          label="Notes for the crew"
          className="sm:col-span-2"
          hint={
            canReschedule
              ? undefined
              : 'Only managers and dispatchers can reschedule.'
          }
        >
          <TextArea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Gate code, pets, special instructions…"
          />
        </Field>
      </div>
    </Modal>
  )
}
