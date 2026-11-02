import { useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'

import { actions, inSeason, useTenant } from './store'
import {
  Btn,
  CheckPill,
  Field,
  Modal,
  SelectInput,
  TextArea,
  TextInput,
} from './ui'
import { toast } from '#/lib/toast'
import { addDays, fmtDate, money, parseDate, todayISO } from './format'
import type { Frequency } from './types'

const OCCURRENCES: Record<Frequency, { count: number; step: number }> = {
  one_time: { count: 1, step: 0 },
  weekly: { count: 8, step: 7 },
  biweekly: { count: 4, step: 14 },
  monthly: { count: 3, step: 28 },
}

/**
 * Create a job. Recurring jobs generate their upcoming visits up front
 * (mirrors ADR 0005: RRULE on the job, materialized visits ahead of time).
 */
export default function JobFormModal({
  open,
  onClose,
  defaults,
}: {
  open: boolean
  onClose: () => void
  defaults?: {
    date?: string
    start?: string
    crew_id?: string | null
    client_id?: string
  }
}) {
  const t = useTenant()
  const clients = t.clients.filter((c) => c.status !== 'inactive')
  const [clientId, setClientId] = useState(
    defaults?.client_id ?? clients.at(0)?.id ?? '',
  )
  const props = t.propertiesOf(clientId)
  const [propertyId, setPropertyId] = useState(props.at(0)?.id ?? '')
  const [serviceIds, setServiceIds] = useState<Array<string>>([])
  const [date, setDate] = useState(defaults?.date ?? addDays(todayISO(), 1))
  const [start, setStart] = useState(defaults?.start ?? '09:00')
  const [crewId, setCrewId] = useState<string>(defaults?.crew_id ?? '')
  const [recurrence, setRecurrence] = useState<Frequency>('one_time')
  const [notes, setNotes] = useState('')
  const [priceOverride, setPriceOverride] = useState<string>('')

  const month = parseDate(date).getMonth() + 1
  const services = t.services.filter((s) => s.is_active)
  const chosen = services.filter((s) => serviceIds.includes(s.id))
  const suggestedPrice = chosen.reduce((s, x) => s + x.default_price_cents, 0)
  const duration = Math.max(
    30,
    chosen.reduce((s, x) => s + x.default_duration_minutes, 0),
  )
  const price = priceOverride
    ? Math.round(Number(priceOverride) * 100)
    : suggestedPrice

  const valid =
    clientId &&
    (propertyId || props[0]) &&
    serviceIds.length > 0 &&
    date &&
    start
  const occ = OCCURRENCES[recurrence]
  const dates = useMemo(
    () =>
      Array.from({ length: occ.count }, (_, i) => addDays(date, i * occ.step)),
    [date, occ],
  )

  const submit = () => {
    if (!valid) return
    dates.forEach((d) =>
      actions.addJob({
        client_id: clientId,
        property_id: propertyId || props[0].id,
        service_ids: serviceIds,
        crew_id: crewId || null,
        date: d,
        start,
        durationMinutes: duration,
        price_cents: price,
        notes,
        recurrence,
      }),
    )
    toast(
      dates.length > 1
        ? `${dates.length} visits scheduled through ${fmtDate(dates[dates.length - 1])}`
        : `Job scheduled for ${fmtDate(date)}`,
    )
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      title="Schedule a job"
      subtitle="Pick the client, services, and when the crew should be there."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn icon={CalendarPlus} disabled={!valid} onClick={submit}>
            {dates.length > 1
              ? `Schedule ${dates.length} visits`
              : 'Schedule job'}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client">
          <SelectInput
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value)
              setPropertyId(t.propertiesOf(e.target.value)[0]?.id ?? '')
            }}
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Property">
          <SelectInput
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            {props.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} · {p.address_line1}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field
          label="Services"
          className="sm:col-span-2"
          hint="Out-of-season services are marked."
        >
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <CheckPill
                key={s.id}
                checked={serviceIds.includes(s.id)}
                onChange={(v) =>
                  setServiceIds((ids) =>
                    v ? [...ids, s.id] : ids.filter((x) => x !== s.id),
                  )
                }
              >
                {s.name}
                {!inSeason(s, month) && (
                  <span className="text-[11px] font-medium text-(--clay)">
                    off-season
                  </span>
                )}
              </CheckPill>
            ))}
          </div>
        </Field>
        <Field label="Date">
          <TextInput
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Start time">
          <TextInput
            type="time"
            step={900}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Crew">
          <SelectInput
            value={crewId}
            onChange={(e) => setCrewId(e.target.value)}
          >
            <option value="">Assign later</option>
            {t.crews
              .filter((c) => c.memberIds.length > 0)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </SelectInput>
        </Field>
        <Field label="Repeats">
          <SelectInput
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value as Frequency)}
          >
            <option value="one_time">Does not repeat</option>
            <option value="weekly">Weekly (next 8 visits)</option>
            <option value="biweekly">Every 2 weeks (next 4 visits)</option>
            <option value="monthly">Monthly (next 3 visits)</option>
          </SelectInput>
        </Field>
        <Field
          label="Price per visit"
          hint={
            suggestedPrice
              ? `Catalog price ${money(suggestedPrice)}`
              : 'Select services to price the job'
          }
        >
          <TextInput
            type="number"
            min={0}
            step="0.01"
            placeholder={(suggestedPrice / 100).toFixed(2)}
            value={priceOverride}
            onChange={(e) => setPriceOverride(e.target.value)}
          />
        </Field>
        <Field label="Estimated duration">
          <TextInput
            value={`${Math.floor(duration / 60)}h ${duration % 60}m`}
            readOnly
          />
        </Field>
        <Field label="Notes for the crew" className="sm:col-span-2">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Gate code, parking, special instructions…"
          />
        </Field>
      </div>
    </Modal>
  )
}
