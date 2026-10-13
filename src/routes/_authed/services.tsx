import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  CalendarRange,
  Clock,
  Pencil,
  Plus,
  Repeat,
  Snowflake,
  Wrench,
  X,
} from 'lucide-react'

import PageShell from '#/components/crm/PageShell'
import {
  Badge,
  Btn,
  Card,
  CardHeader,
  CheckPill,
  EmptyState,
  Field,
  FilterChip,
  IconBtn,
  Modal,
  SearchInput,
  SelectInput,
  TextArea,
  TextInput,
  Toggle,
  toast,
} from '#/components/crm/ui'
import { actions, can, inSeason, useTenant } from '#/components/crm/store'
import {
  MONTHS,
  addDays,
  fmtDuration,
  money,
  parseDate,
  todayISO,
} from '#/components/crm/format'
import { cn } from '#/lib/utils'
import type { Frequency, Service, ServiceUnit } from '#/components/crm/types'

export const Route = createFileRoute('/_authed/services')({
  component: ServicesPage,
})

const UNIT_LABEL: Record<ServiceUnit, string> = {
  each: 'per job',
  visit: 'per visit',
  hour: 'per hour',
  sqft: 'per sq ft',
  linear_ft: 'per linear ft',
  yard: 'per yard',
  bag: 'per bag',
}

const FREQ_LABEL: Record<Frequency, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
}

const SWATCHES = [
  '#7fb547',
  '#3f8f5b',
  '#a5c25a',
  '#6aa6c9',
  '#d98a3d',
  '#c8d96a',
  '#5c7c3a',
  '#8bbf9f',
  '#b9a46b',
  '#4fa3a5',
  '#8a5a3c',
  '#e07a8f',
]

type Filter = 'all' | 'recurring' | 'one_time' | 'in_season' | 'inactive'

function seasonText(s: Service) {
  if (!s.season) return 'Year-round'
  return `${MONTHS[s.season.start - 1]} → ${MONTHS[s.season.end - 1]}`
}

function SeasonBar({
  service,
  className,
}: {
  service: Service
  className?: string
}) {
  const now = parseDate(todayISO()).getMonth() + 1
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

function ServicesPage() {
  const t = useTenant()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const month = parseDate(todayISO()).getMonth() + 1
  const editable = can.manageServices(t.role)

  const since = addDays(todayISO(), -30)
  const usage = (id: string) => {
    const jobs = t.jobs.filter(
      (j) =>
        j.service_ids.includes(id) &&
        j.status === 'completed' &&
        j.date >= since,
    )
    return {
      count: jobs.length,
      revenue: jobs.reduce(
        (s, j) => s + j.price_cents / j.service_ids.length,
        0,
      ),
    }
  }

  const isRecurring = (s: Service) =>
    s.frequencies.some((f) => f !== 'one_time')
  const rows = t.services
    .filter((s) => {
      if (filter === 'recurring' && !isRecurring(s)) return false
      if (filter === 'one_time' && isRecurring(s)) return false
      if (filter === 'in_season' && !(s.is_active && inSeason(s, month)))
        return false
      if (filter === 'inactive' && s.is_active) return false
      const needle = q.trim().toLowerCase()
      return (
        !needle ||
        `${s.name} ${s.description} ${s.equipment.join(' ')}`
          .toLowerCase()
          .includes(needle)
      )
    })
    .sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) ||
        a.name.localeCompare(b.name),
    )

  return (
    <PageShell
      kicker="Service catalog"
      title="Services"
      subtitle="Standardize pricing, duration, equipment, and when each service is offered."
      allowed={can.manageClients(t.role)}
      section="Services"
      actions={
        editable && (
          <Btn icon={Plus} onClick={() => setEditing('new')}>
            Add service
          </Btn>
        )
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search services or equipment"
          className="w-full sm:w-72"
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', `All ${t.services.length}`],
              ['recurring', 'Recurring'],
              ['one_time', 'One-time'],
              ['in_season', `In season (${MONTHS[month - 1]})`],
              ['inactive', 'Inactive'],
            ] as Array<[Filter, string]>
          ).map(([k, label]) => (
            <FilterChip
              key={k}
              active={filter === k}
              onClick={() => setFilter(k)}
            >
              {label}
            </FilterChip>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No services match"
            action={
              editable && (
                <Btn icon={Plus} onClick={() => setEditing('new')}>
                  Add service
                </Btn>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((s) => {
            const u = usage(s.id)
            const seasonal = inSeason(s, month)
            return (
              <Card
                key={s.id}
                className={cn(
                  'crm-rise flex flex-col overflow-hidden',
                  !s.is_active && 'opacity-70',
                )}
              >
                <div className="flex items-start gap-3 p-5 pb-3">
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      background: `color-mix(in oklab, ${s.color} 22%, white)`,
                      color: s.color,
                    }}
                  >
                    {s.name === 'Snow Removal' ? (
                      <Snowflake className="size-5" />
                    ) : (
                      <Wrench className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-bold">{s.name}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {!s.is_active ? (
                        <Badge>Inactive</Badge>
                      ) : seasonal ? (
                        <Badge tone="green" dot>
                          In season
                        </Badge>
                      ) : (
                        <Badge tone="sun" dot>
                          Off-season
                        </Badge>
                      )}
                    </p>
                  </div>
                  {editable && (
                    <div className="flex items-center gap-1">
                      <Toggle
                        checked={s.is_active}
                        label={`${s.name} active`}
                        onChange={(v) => {
                          actions.updateService(s.id, { is_active: v })
                          toast(
                            `${s.name} ${v ? 'activated' : 'hidden from pickers'}`,
                            'info',
                          )
                        }}
                      />
                      <IconBtn
                        icon={Pencil}
                        label={`Edit ${s.name}`}
                        onClick={() => setEditing(s)}
                      />
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 px-5 text-[13px] text-(--ink-2)">
                  {s.description}
                </p>
                <div className="mt-4 flex items-end justify-between gap-3 px-5">
                  <div>
                    <p className="crm-display text-[26px] leading-none font-semibold">
                      {s.default_price_cents
                        ? money(s.default_price_cents)
                        : 'Quote'}
                    </p>
                    <p className="mt-1 text-xs text-(--ink-3)">
                      {UNIT_LABEL[s.unit]}
                    </p>
                  </div>
                  <p className="flex items-center gap-1 text-[13px] font-semibold text-(--ink-2)">
                    <Clock className="size-3.5" />{' '}
                    {fmtDuration(s.default_duration_minutes)}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5 px-5">
                  {s.frequencies.map((f) => (
                    <Badge key={f} tone={f === 'one_time' ? 'gray' : 'lime'}>
                      {f !== 'one_time' && <Repeat className="size-3" />}
                      {FREQ_LABEL[f]}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 px-5">
                  {s.equipment.map((e) => (
                    <span
                      key={e}
                      className="rounded-lg border border-(--line) px-2 py-0.5 text-[11px] font-medium text-(--ink-2)"
                    >
                      {e}
                    </span>
                  ))}
                </div>
                <div className="mt-auto px-5 pt-4 pb-4">
                  <p className="mb-2 flex items-center justify-between text-[11px] font-semibold text-(--ink-3)">
                    <span className="flex items-center gap-1">
                      <CalendarRange className="size-3" /> {seasonText(s)}
                    </span>
                    <span>
                      {u.count} jobs · 30d
                      {can.viewRevenue(t.role)
                        ? ` · ${money(Math.round(u.revenue / 100) * 100)}`
                        : ''}
                    </span>
                  </p>
                  <SeasonBar service={s} />
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Seasonal availability"
          subtitle="When each active service is offered. The outlined column is this month."
        />
        <div className="crm-scroll overflow-x-auto p-5">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[200px_repeat(12,minmax(0,1fr))] gap-1 pb-2 text-[11px] font-semibold text-(--ink-3)">
              <span />
              {MONTHS.map((m, i) => (
                <span
                  key={m}
                  className={cn(
                    'text-center',
                    i + 1 === month && 'text-(--ink)',
                  )}
                >
                  {m}
                </span>
              ))}
            </div>
            {t.services
              .filter((s) => s.is_active)
              .map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[200px_repeat(12,minmax(0,1fr))] items-center gap-1 py-1"
                >
                  <span className="truncate pr-3 text-[13px] font-semibold">
                    {s.name}
                  </span>
                  {MONTHS.map((m, i) => (
                    <span
                      key={m}
                      className={cn(
                        'h-5 rounded-md',
                        i + 1 === month && 'ring-2 ring-(--leaf-900)/60',
                      )}
                      style={{
                        background: inSeason(s, i + 1)
                          ? s.color
                          : 'var(--cream-2)',
                      }}
                      title={`${s.name}: ${inSeason(s, i + 1) ? 'offered' : 'not offered'} in ${m}`}
                    />
                  ))}
                </div>
              ))}
          </div>
        </div>
      </Card>

      {editing && (
        <ServiceModal
          service={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </PageShell>
  )
}

function ServiceModal({
  service,
  onClose,
}: {
  service: Service | null
  onClose: () => void
}) {
  const [form, setForm] = useState({
    name: service?.name ?? '',
    description: service?.description ?? '',
    price: service ? (service.default_price_cents / 100).toFixed(2) : '',
    unit: service?.unit ?? 'visit',
    duration: String(service?.default_duration_minutes ?? 60),
    equipment: service?.equipment ?? [],
    frequencies: service?.frequencies ?? (['one_time'] as Array<Frequency>),
    yearRound: !service?.season,
    seasonStart: service?.season?.start ?? 4,
    seasonEnd: service?.season?.end ?? 10,
    color: service?.color ?? SWATCHES[0],
    is_active: service?.is_active ?? true,
  })
  const [equip, setEquip] = useState('')
  const valid =
    form.name.trim() && Number(form.duration) > 0 && form.frequencies.length > 0

  const addEquip = () => {
    const v = equip.trim()
    if (v && !form.equipment.includes(v))
      setForm((f) => ({ ...f, equipment: [...f.equipment, v] }))
    setEquip('')
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={680}
      title={service ? `Edit ${service.name}` : 'Add a service'}
      subtitle="Defaults used when quoting and scheduling. You can still override price per job."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            disabled={!valid}
            onClick={() => {
              actions.saveService({
                id: service?.id,
                name: form.name.trim(),
                description: form.description,
                default_price_cents: Math.round(
                  (Number(form.price) || 0) * 100,
                ),
                unit: form.unit,
                default_duration_minutes: Number(form.duration),
                equipment: form.equipment,
                frequencies: form.frequencies,
                season: form.yearRound
                  ? null
                  : { start: form.seasonStart, end: form.seasonEnd },
                color: form.color,
                is_active: form.is_active,
              })
              toast(service ? 'Service updated' : 'Service added')
              onClose()
            }}
          >
            {service ? 'Save changes' : 'Add service'}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <TextInput
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Lawn Mowing"
            autoFocus
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <TextArea
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            className="min-h-20"
          />
        </Field>
        <Field label="Price">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-(--ink-3)">
              $
            </span>
            <TextInput
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(e) =>
                setForm((f) => ({ ...f, price: e.target.value }))
              }
              className="pl-6"
              placeholder="0.00"
            />
          </div>
        </Field>
        <Field label="Priced">
          <SelectInput
            value={form.unit}
            onChange={(e) =>
              setForm((f) => ({ ...f, unit: e.target.value as ServiceUnit }))
            }
          >
            {Object.entries(UNIT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Typical duration (minutes)">
          <TextInput
            type="number"
            min={15}
            step={15}
            value={form.duration}
            onChange={(e) =>
              setForm((f) => ({ ...f, duration: e.target.value }))
            }
          />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={form.color === c}
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                className={cn(
                  'size-7 cursor-pointer rounded-full border-2',
                  form.color === c ? 'border-(--ink)' : 'border-transparent',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Field
          label="Equipment required"
          className="sm:col-span-2"
          hint="Press Enter to add."
        >
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-(--line-2) bg-(--paper) p-1.5">
            {form.equipment.map((e) => (
              <span
                key={e}
                className="inline-flex items-center gap-1 rounded-lg bg-(--sage) py-1 pr-1 pl-2 text-xs font-semibold"
              >
                {e}
                <button
                  type="button"
                  aria-label={`Remove ${e}`}
                  className="cursor-pointer rounded p-0.5 hover:bg-white"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      equipment: f.equipment.filter((x) => x !== e),
                    }))
                  }
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={equip}
              onChange={(e) => setEquip(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addEquip()
                }
              }}
              onBlur={addEquip}
              placeholder="Mower, trimmer…"
              className="min-w-32 flex-1 bg-transparent px-1.5 py-1 text-sm outline-none"
            />
          </div>
        </Field>
        <Field label="Recurring options" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FREQ_LABEL) as Array<Frequency>).map((f) => (
              <CheckPill
                key={f}
                checked={form.frequencies.includes(f)}
                onChange={(v) =>
                  setForm((x) => ({
                    ...x,
                    frequencies: v
                      ? [...x.frequencies, f]
                      : x.frequencies.filter((y) => y !== f),
                  }))
                }
              >
                {FREQ_LABEL[f]}
              </CheckPill>
            ))}
          </div>
        </Field>
        <div className="rounded-2xl border border-(--line) bg-(--cream)/60 p-4 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Seasonal availability</p>
              <p className="text-xs text-(--ink-3)">
                Off-season services are flagged when scheduling. Example: Snow
                Removal, November → March.
              </p>
            </div>
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              Year-round
              <Toggle
                checked={form.yearRound}
                label="Year-round"
                onChange={(v) => setForm((f) => ({ ...f, yearRound: v }))}
              />
            </label>
          </div>
          {!form.yearRound && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="From">
                <SelectInput
                  value={form.seasonStart}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      seasonStart: Number(e.target.value),
                    }))
                  }
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="To">
                <SelectInput
                  value={form.seasonEnd}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      seasonEnd: Number(e.target.value),
                    }))
                  }
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <SeasonBar
                className="col-span-2 mt-1"
                service={{
                  id: 'preview',
                  organization_id: '',
                  name: form.name,
                  description: '',
                  unit: form.unit,
                  default_price_cents: 0,
                  default_duration_minutes: 60,
                  is_active: true,
                  color: form.color,
                  equipment: [],
                  frequencies: [],
                  season: { start: form.seasonStart, end: form.seasonEnd },
                }}
              />
            </div>
          )}
        </div>
        <label className="flex items-center justify-between gap-3 sm:col-span-2">
          <span>
            <span className="block text-sm font-bold">Active</span>
            <span className="text-xs text-(--ink-3)">
              Inactive services are hidden from quote and job pickers.
            </span>
          </span>
          <Toggle
            checked={form.is_active}
            label="Active"
            onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
          />
        </label>
      </div>
    </Modal>
  )
}
