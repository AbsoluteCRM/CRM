import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Camera,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Play,
  Receipt,
  Route as RouteIcon,
  Sparkles,
  XCircle,
} from 'lucide-react'

import {
  actions,
  can,
  detectConflicts,
  invoiceBalance,
  jobEnd,
  useTenant,
} from './store'
import {
  Alert,
  Badge,
  Btn,
  Card,
  ColorDot,
  Drawer,
  EmptyState,
  Field,
  KeyValue,
  PhotoTile,
  SelectInput,
  StatusBadge,
  Tabs,
  TextArea,
  TextInput,
} from './ui'
import { toast } from '#/lib/toast'
import RouteMap from './RouteMap'
import { buildRoute, optimizeOrder, totalDrive } from './route'
import { fmtDate, fmtDuration, fmtTime, money, uid } from './format'
import type { Job, Photo } from './types'

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480]

export default function JobDrawer({
  jobId,
  onClose,
}: {
  jobId: string | null
  onClose: () => void
}) {
  const t = useTenant()
  const job = t.jobs.find((j) => j.id === jobId)
  const [tab, setTab] = useState<'overview' | 'route' | 'completion'>(
    'overview',
  )
  if (!job) return null
  const client = t.client(job.client_id)
  const property = t.property(job.property_id)
  const crew = t.crew(job.crew_id)
  const services = t.jobServices(job)
  const conflicts =
    detectConflicts(t.jobs, t.crews, t.members).get(job.id) ?? []
  const editable =
    can.manageJobs(t.role) &&
    job.status !== 'completed' &&
    job.status !== 'cancelled'
  const canWork =
    job.status !== 'completed' &&
    job.status !== 'cancelled' &&
    (can.manageJobs(t.role) || t.myCrew?.id === job.crew_id)
  const invoice = t.invoice(job.invoice_id)

  return (
    <Drawer
      open
      onClose={onClose}
      width={720}
      title={
        <span className="flex items-center gap-3">
          {job.number}
          <StatusBadge status={job.status} />
        </span>
      }
      subtitle={
        <span>
          {client?.display_name} ·{' '}
          {fmtDate(job.date, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}{' '}
          · {fmtTime(job.start)}–{fmtTime(jobEnd(job))}
        </span>
      }
      header={
        <Tabs
          className="mt-4 -mb-4"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'route', label: 'Route' },
            {
              value: 'completion',
              label: 'Photos & completion',
              count: job.photos.length || undefined,
            },
          ]}
        />
      }
      footer={
        <>
          {can.manageJobs(t.role) &&
            job.status !== 'cancelled' &&
            job.status !== 'completed' && (
              <Btn
                variant="danger"
                icon={XCircle}
                onClick={() => {
                  actions.setJobStatus(job.id, 'cancelled')
                  toast(`${job.number} cancelled`, 'info')
                }}
              >
                Cancel job
              </Btn>
            )}
          <span className="flex-1" />
          {canWork && job.status !== 'in_progress' && (
            <Btn
              variant="outline"
              icon={Play}
              onClick={() => {
                actions.setJobStatus(job.id, 'in_progress')
                toast(`${job.number} started`)
              }}
            >
              Start job
            </Btn>
          )}
          {canWork && (
            <Btn
              variant="primary"
              icon={CheckCircle2}
              onClick={() => setTab('completion')}
            >
              Complete job
            </Btn>
          )}
          {job.status === 'completed' && invoice && (
            <Badge tone={invoice.status === 'paid' ? 'green' : 'sky'}>
              <Receipt className="size-3" /> {invoice.number} ·{' '}
              {invoice.status === 'paid'
                ? 'Paid'
                : `${money(invoiceBalance(invoice))} due`}
            </Badge>
          )}
        </>
      }
    >
      {tab === 'overview' && (
        <Overview
          job={job}
          editable={editable}
          conflicts={conflicts.map((c) => c.message)}
        />
      )}
      {tab === 'route' && <RouteTab job={job} />}
      {tab === 'completion' && (
        <CompletionTab
          job={job}
          canWork={canWork}
          onDone={() => setTab('overview')}
        />
      )}
      {tab === 'overview' && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card className="p-4">
            <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
              Customer
            </p>
            <p className="font-bold">{client?.display_name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-(--ink-2)">
              <Phone className="size-3.5" /> {client?.phone}
            </p>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-(--ink-2)">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />{' '}
              {property?.address_line1}, {property?.city}
            </p>
            {can.manageClients(t.role) && client && (
              <Link
                to="/clients"
                search={{ id: client.id }}
                className="mt-3 inline-block text-[13px] font-semibold text-(--leaf-700)"
              >
                Open client profile →
              </Link>
            )}
          </Card>
          <Card className="p-4">
            <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
              Property notes
            </p>
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Gate code">{property?.gateCode}</KeyValue>
              <KeyValue label="Pets">{property?.pets}</KeyValue>
              <KeyValue label="Lawn size">
                {property?.lawnSqft
                  ? `${property.lawnSqft.toLocaleString()} sq ft`
                  : ''}
              </KeyValue>
              <KeyValue label="Access">{property?.accessNotes}</KeyValue>
            </dl>
            {property?.instructions && (
              <p className="mt-3 rounded-xl bg-(--sun-100) px-3 py-2 text-[13px] text-(--ink)">
                {property.instructions}
              </p>
            )}
          </Card>
          <Card className="p-4 sm:col-span-2">
            <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
              Services
            </p>
            <ul className="divide-y divide-(--line)">
              {services.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <ColorDot color={s.color} /> {s.name}
                  </span>
                  <span className="text-(--ink-3)">
                    {fmtDuration(s.default_duration_minutes)}
                  </span>
                </li>
              ))}
            </ul>
            {can.viewRevenue(t.role) && (
              <p className="mt-3 flex justify-between border-t border-(--line) pt-3 text-sm font-bold">
                <span>Job price</span>
                <span>{money(job.price_cents)}</span>
              </p>
            )}
          </Card>
          {crew && (
            <Card className="p-4 sm:col-span-2">
              <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
                Assigned crew
              </p>
              <div className="flex flex-wrap gap-2">
                {crew.memberIds.map((id) => {
                  const m = t.member(id)
                  if (!m) return null
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-2 rounded-full bg-(--sage) py-1 pr-3 pl-1 text-[13px] font-semibold"
                    >
                      <span
                        className="flex size-6 items-center justify-center rounded-full text-[10px] font-bold"
                        style={{ background: crew.color }}
                      >
                        {m.display_name
                          .split(' ')
                          .map((p) => p[0])
                          .join('')}
                      </span>
                      {m.display_name}
                      {crew.leadId === id && <Badge tone="dark">Lead</Badge>}
                    </span>
                  )
                })}
              </div>
              {crew.vehicle && (
                <p className="mt-3 text-[13px] text-(--ink-3)">
                  Vehicle: {crew.vehicle}
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </Drawer>
  )
}

function Overview({
  job,
  editable,
  conflicts,
}: {
  job: Job
  editable: boolean
  conflicts: Array<string>
}) {
  const t = useTenant()
  const crews = t.crews.filter((c) => c.memberIds.length > 0)
  return (
    <div className="space-y-4">
      {conflicts.length > 0 && (
        <Alert tone="danger" title="Scheduling conflict">
          <ul className="list-disc pl-4">
            {conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Alert>
      )}
      <Card className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label="Date">
          <TextInput
            type="date"
            value={job.date}
            disabled={!editable}
            onChange={(e) =>
              e.target.value &&
              actions.moveJob(job.id, { date: e.target.value })
            }
          />
        </Field>
        <Field label="Start time">
          <TextInput
            type="time"
            step={900}
            value={job.start}
            disabled={!editable}
            onChange={(e) =>
              e.target.value &&
              actions.moveJob(job.id, { start: e.target.value })
            }
          />
        </Field>
        <Field label="Crew">
          <SelectInput
            value={job.crew_id ?? ''}
            disabled={!editable}
            onChange={(e) => {
              actions.moveJob(job.id, { crew_id: e.target.value || null })
              toast(
                e.target.value
                  ? `Assigned to ${t.crew(e.target.value)?.name}`
                  : 'Crew removed',
                'info',
              )
            }}
          >
            <option value="">Unassigned</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Duration">
          <SelectInput
            value={String(job.durationMinutes)}
            disabled={!editable}
            onChange={(e) =>
              actions.updateJob(job.id, {
                durationMinutes: Number(e.target.value),
              })
            }
          >
            {[...new Set([...DURATIONS, job.durationMinutes])]
              .sort((a, b) => a - b)
              .map((d) => (
                <option key={d} value={d}>
                  {fmtDuration(d)}
                </option>
              ))}
          </SelectInput>
        </Field>
        <Field label="Job notes" className="sm:col-span-2">
          <TextArea
            defaultValue={job.notes}
            disabled={!can.manageJobs(t.role)}
            placeholder="Anything the crew should know"
            onBlur={(e) =>
              e.target.value !== job.notes &&
              actions.updateJob(job.id, { notes: e.target.value })
            }
          />
        </Field>
      </Card>
    </div>
  )
}

function RouteTab({ job }: { job: Job }) {
  const t = useTenant()
  const crew = t.crew(job.crew_id)
  if (!crew) {
    return (
      <EmptyState
        icon={RouteIcon}
        title="No crew assigned"
        body="Assign a crew to see this job on their route."
      />
    )
  }
  const dayJobs = t.jobs.filter(
    (j) =>
      j.date === job.date && j.crew_id === crew.id && j.status !== 'cancelled',
  )
  const stops = buildRoute(dayJobs, t.property)
  const idx = stops.findIndex((s) => s.job.id === job.id)
  const canOptimize =
    can.manageJobs(t.role) &&
    dayJobs.every((j) => j.status === 'assigned' || j.status === 'scheduled')

  return (
    <div className="space-y-4">
      <RouteMap stops={stops} color={crew.color} activeJobId={job.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--ink-2)">
          <b className="text-(--ink)">{crew.name}</b> · {stops.length} stops · ~
          {fmtDuration(totalDrive(stops))} driving · this job is stop {idx + 1}
        </p>
        {canOptimize && (
          <Btn
            variant="accent"
            size="sm"
            icon={Sparkles}
            onClick={() => {
              const before = totalDrive(stops)
              optimizeOrder(dayJobs, t.property).forEach((o) =>
                actions.moveJob(o.id, { start: o.start }),
              )
              const after = totalDrive(
                buildRoute(
                  t.jobs.filter(
                    (j) => j.date === job.date && j.crew_id === crew.id,
                  ),
                  t.property,
                ),
              )
              toast(
                `Route optimized${before > after ? `, saves ~${before - after} min of driving` : ''}`,
              )
            }}
          >
            Optimize route
          </Btn>
        )}
      </div>
      <ol className="space-y-2">
        {stops.map((s, i) => (
          <li
            key={s.job.id}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm ${s.job.id === job.id ? 'border-(--leaf-500) bg-(--lime-100)' : 'border-(--line) bg-(--paper)'}`}
          >
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: crew.color }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">
                {t.client(s.job.client_id)?.display_name}
              </span>
              <span className="block truncate text-xs text-(--ink-3)">
                {s.property.address_line1}
              </span>
            </span>
            <span className="text-right text-xs text-(--ink-3)">
              <span className="flex items-center justify-end gap-1 font-semibold text-(--ink)">
                <Clock className="size-3" /> ETA {fmtTime(s.eta)}
              </span>
              {s.driveFromPrev} min drive
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function CompletionTab({
  job,
  canWork,
  onDone,
}: {
  job: Job
  canWork: boolean
  onDone: () => void
}) {
  const [notes, setNotes] = useState(job.completionNotes)
  const before = job.photos.filter((p) => p.kind === 'before')
  const after = job.photos.filter((p) => p.kind === 'after')

  const addPhotos = (kind: 'before' | 'after', files: FileList | null) => {
    if (!files?.length) return
    const added: Array<Photo> = [...files].map((f, i) => ({
      id: uid('ph'),
      label: `${kind === 'before' ? 'Before' : 'After'} ${job.photos.filter((p) => p.kind === kind).length + i + 1}`,
      url: URL.createObjectURL(f),
      hue: kind === 'before' ? 60 : 120,
      kind,
    }))
    actions.updateJob(job.id, { photos: [...job.photos, ...added] })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <PhotoColumn
          title="Before photos"
          photos={before}
          onAdd={canWork ? (f) => addPhotos('before', f) : undefined}
          onRemove={
            canWork
              ? (id) =>
                  actions.updateJob(job.id, {
                    photos: job.photos.filter((p) => p.id !== id),
                  })
              : undefined
          }
        />
        <PhotoColumn
          title="After photos"
          photos={after}
          onAdd={canWork ? (f) => addPhotos('after', f) : undefined}
          onRemove={
            canWork
              ? (id) =>
                  actions.updateJob(job.id, {
                    photos: job.photos.filter((p) => p.id !== id),
                  })
              : undefined
          }
        />
      </div>
      <Field
        label="Completion notes"
        hint="Visible to the office and on the client’s service history."
      >
        <TextArea
          value={notes}
          disabled={!canWork}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What was done, anything to follow up on…"
        />
      </Field>
      {canWork ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-(--leaf-900) p-4 text-(--cream)">
          <p className="text-sm">
            Marking complete sends the invoice to the client.
            {after.length === 0 && (
              <span className="block text-xs text-(--lime)">
                Tip: add at least one after photo.
              </span>
            )}
          </p>
          <Btn
            variant="accent"
            icon={CheckCircle2}
            onClick={() => {
              actions.completeJob(job.id, { notes })
              toast(`${job.number} completed, invoice sent`)
              onDone()
            }}
          >
            Mark job complete
          </Btn>
        </div>
      ) : (
        job.status === 'completed' && (
          <Alert tone="info" title="Job completed">
            {job.completionNotes || 'No completion notes.'}
          </Alert>
        )
      )}
    </div>
  )
}

function PhotoColumn({
  title,
  photos,
  onAdd,
  onRemove,
}: {
  title: string
  photos: Array<Photo>
  onAdd?: (files: FileList | null) => void
  onRemove?: (id: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div>
      <p className="mb-2 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {photos.map((p) => (
          <PhotoTile
            key={p.id}
            url={p.url}
            label={p.label}
            hue={p.hue}
            onRemove={onRemove ? () => onRemove(p.id) : undefined}
          />
        ))}
        {onAdd && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-(--line-2) text-xs font-semibold text-(--ink-3) hover:border-(--leaf-500) hover:text-(--leaf-700)"
          >
            <Camera className="size-5" />
            Add photo
          </button>
        )}
      </div>
      {photos.length === 0 && !onAdd && (
        <p className="text-sm text-(--ink-3)">No photos.</p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => onAdd?.(e.target.files)}
      />
    </div>
  )
}
