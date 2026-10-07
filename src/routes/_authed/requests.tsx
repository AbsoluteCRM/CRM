import { useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  CalendarCheck,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Globe,
  Inbox,
  Mail,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Search as SearchIcon,
  UserCheck,
  XCircle,
} from 'lucide-react'

import PageShell from '#/components/crm/PageShell'
import QuoteBuilder from '#/components/crm/QuoteBuilder'
import {
  Alert,
  Badge,
  Btn,
  Card,
  Drawer,
  EmptyState,
  Field,
  KeyValue,
  Modal,
  PhotoTile,
  SearchInput,
  Segmented,
  SelectInput,
  StatusBadge,
  Tabs,
  TextArea,
  TextInput,
  toast,
} from '#/components/crm/ui'
import {
  actions,
  can,
  inSeason,
  quoteTotals,
  useTenant,
} from '#/components/crm/store'
import {
  addDays,
  fmtDate,
  fmtTime,
  money,
  parseDate,
  relativeTime,
  todayISO,
  uid,
} from '#/components/crm/format'
import { cn } from '#/lib/utils'
import type { Tenant } from '#/components/crm/store'
import type {
  Photo,
  RequestStatus,
  ServiceRequest,
} from '#/components/crm/types'
import type { LucideIcon } from 'lucide-react'

export const Route = createFileRoute('/_authed/requests')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { id?: string; new?: boolean } => ({
    id: typeof search.id === 'string' ? search.id : undefined,
    new: search.new === true || search.new === 'true' ? true : undefined,
  }),
  component: RequestsPage,
})

const STAGES: Array<{
  key: RequestStatus
  label: string
  icon: LucideIcon
  hint: string
}> = [
  {
    key: 'submitted',
    label: 'Submitted',
    icon: Inbox,
    hint: 'New from the web form, phone, or portal',
  },
  {
    key: 'reviewing',
    label: 'Review',
    icon: SearchIcon,
    hint: 'Checking scope, site, and service area',
  },
  {
    key: 'estimated',
    label: 'Estimate',
    icon: FileText,
    hint: 'Quote sent, waiting on the customer',
  },
  {
    key: 'approved',
    label: 'Approved',
    icon: ClipboardCheck,
    hint: 'Ready to schedule',
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    icon: CalendarCheck,
    hint: 'Job is on the calendar',
  },
  {
    key: 'converted',
    label: 'Customer',
    icon: UserCheck,
    hint: 'Converted to an active client',
  },
]

const SOURCE: Record<
  ServiceRequest['source'],
  { label: string; icon: LucideIcon }
> = {
  web_form: { label: 'Web form', icon: Globe },
  phone: { label: 'Phone', icon: Phone },
  email: { label: 'Email', icon: Mail },
  client_portal: { label: 'Client portal', icon: UserCheck },
}

function who(t: Tenant, r: ServiceRequest) {
  return r.prospect?.name ?? t.client(r.client_id)?.display_name ?? 'Unknown'
}

function RequestsPage() {
  const t = useTenant()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'open' | 'all' | RequestStatus>('open')
  const [q, setQ] = useState('')
  const creating = !!search.new

  const counts = useMemo(() => {
    const c: Partial<Record<string, number>> = {}
    t.requests.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1))
    return c
  }, [t.requests])

  const rows = t.requests
    .filter((r) => {
      if (
        filter === 'open' &&
        !['submitted', 'reviewing', 'estimated', 'approved'].includes(r.status)
      )
        return false
      if (filter !== 'open' && filter !== 'all' && r.status !== filter)
        return false
      const needle = q.trim().toLowerCase()
      return (
        !needle ||
        `${who(t, r)} ${r.address} ${t.service(r.service_id)?.name}`
          .toLowerCase()
          .includes(needle)
      )
    })
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

  const selected = search.id
    ? t.requests.find((r) => r.id === search.id)
    : undefined

  return (
    <PageShell
      kicker="Leads & service requests"
      title="Requests"
      subtitle="Review incoming requests, send estimates, and turn approvals into scheduled jobs and new customers."
      allowed={can.manageRequests(t.role)}
      section="Requests"
      actions={
        <Btn
          icon={Plus}
          onClick={() => navigate({ to: '/requests', search: { new: true } })}
        >
          New request
        </Btn>
      }
    >
      {/* Pipeline */}
      <div className="crm-scroll mb-5 overflow-x-auto">
        <ol className="flex min-w-[900px] items-stretch gap-2">
          {STAGES.map((s, i) => {
            const active = filter === s.key
            return (
              <li key={s.key} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilter(active ? 'open' : s.key)}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors',
                    active
                      ? 'border-(--leaf-900) bg-(--leaf-900) text-(--cream)'
                      : 'border-(--line) bg-(--paper) hover:border-(--leaf-500)',
                  )}
                  title={s.hint}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-xl',
                      active
                        ? 'bg-(--lime) text-(--leaf-950)'
                        : 'bg-(--lime-100) text-(--leaf-700)',
                    )}
                  >
                    <s.icon className="size-4" />
                  </span>
                  <span>
                    <span className="crm-display block text-2xl leading-none font-semibold">
                      {counts[s.key] ?? 0}
                    </span>
                    <span
                      className={cn(
                        'mt-1 block text-xs font-semibold',
                        active ? 'text-(--cream)/70' : 'text-(--ink-3)',
                      )}
                    >
                      {s.label}
                    </span>
                  </span>
                </button>
                <ArrowRight
                  aria-hidden
                  className={cn(
                    'size-4 shrink-0 text-(--ink-3)',
                    i === STAGES.length - 1 && 'invisible',
                  )}
                />
              </li>
            )
          })}
        </ol>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-(--line) p-4">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Search name, address, service"
            className="w-full sm:w-80"
          />
          <Segmented
            value={
              filter === 'open' || filter === 'all' || filter === 'rejected'
                ? filter
                : 'open'
            }
            onChange={(v) => setFilter(v)}
            options={[
              {
                value: 'open',
                label: 'Open',
                count:
                  (counts.submitted ?? 0) +
                  (counts.reviewing ?? 0) +
                  (counts.estimated ?? 0) +
                  (counts.approved ?? 0),
              },
              {
                value: 'rejected',
                label: 'Rejected',
                count: counts.rejected ?? 0,
              },
              { value: 'all', label: 'All', count: t.requests.length },
            ]}
          />
        </div>
        <div className="crm-scroll overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
                <th className="px-5 py-3">Customer</th>
                <th className="px-3 py-3">Service requested</th>
                <th className="px-3 py-3">Submitted</th>
                <th className="px-3 py-3">Source</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const svc = t.service(r.service_id)
                const Src = SOURCE[r.source].icon
                return (
                  <tr
                    key={r.id}
                    onClick={() =>
                      navigate({ to: '/requests', search: { id: r.id } })
                    }
                    className="cursor-pointer border-t border-(--line) hover:bg-(--cream)"
                  >
                    <td className="px-5 py-3">
                      <p className="flex items-center gap-2 font-bold">
                        {who(t, r)}
                        {r.prospect && <Badge tone="lime">New customer</Badge>}
                      </p>
                      <p className="max-w-[280px] truncate text-xs text-(--ink-3)">
                        {r.address}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: svc?.color }}
                        />
                        {svc?.name}
                      </span>
                      {r.quote && (
                        <span className="text-xs text-(--ink-3)">
                          Estimate {money(quoteTotals(r.quote).total)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-(--ink-2)">
                      {fmtDate(r.submittedAt.slice(0, 10))}
                      <span className="block text-xs text-(--ink-3)">
                        {relativeTime(r.submittedAt)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-(--ink-2)">
                      <span className="flex items-center gap-1.5 text-[13px]">
                        <Src className="size-3.5 text-(--ink-3)" />{' '}
                        {SOURCE[r.source].label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <EmptyState
              icon={Inbox}
              title="No requests here"
              body="New requests from your website and client portal land in this list."
            />
          )}
        </div>
      </Card>

      {creating && (
        <NewRequestModal
          onClose={() => navigate({ to: '/requests', search: {} })}
        />
      )}
      {selected && (
        <RequestDrawer
          t={t}
          req={selected}
          onClose={() => navigate({ to: '/requests', search: {} })}
        />
      )}
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// New request (what a customer submits)
// ---------------------------------------------------------------------------

function NewRequestModal({ onClose }: { onClose: () => void }) {
  const t = useTenant()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [clientId, setClientId] = useState(t.clients.at(0)?.id ?? '')
  const [prospect, setProspect] = useState({ name: '', email: '', phone: '' })
  const [address, setAddress] = useState('')
  const month = parseDate(todayISO()).getMonth() + 1
  const services = t.services.filter((s) => s.is_active)
  const [serviceId, setServiceId] = useState(
    services.find((s) => inSeason(s, month))?.id ?? services.at(0)?.id ?? '',
  )
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState<ServiceRequest['source']>('phone')
  const [photos, setPhotos] = useState<Array<Photo>>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const clientAddress = t.propertiesOf(clientId).at(0)
  const finalAddress =
    mode === 'existing'
      ? address ||
        (clientAddress
          ? `${clientAddress.address_line1}, ${clientAddress.city}`
          : '')
      : address
  const valid =
    serviceId &&
    finalAddress &&
    (mode === 'existing' ? clientId : prospect.name.trim())

  return (
    <Modal
      open
      onClose={onClose}
      width={640}
      title="New service request"
      subtitle="Log a request from a call or email. Website and portal requests arrive here automatically."
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            disabled={!valid}
            onClick={() => {
              const id = actions.addRequest({
                client_id: mode === 'existing' ? clientId : null,
                prospect: mode === 'new' ? prospect : null,
                address: finalAddress,
                service_id: serviceId,
                notes,
                photos,
                source,
              })
              toast('Request added')
              navigate({ to: '/requests', search: { id } })
            }}
          >
            Submit request
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'new', label: 'New customer' },
              { value: 'existing', label: 'Existing client' },
            ]}
          />
        </div>
        {mode === 'existing' ? (
          <Field label="Client" className="sm:col-span-2">
            <SelectInput
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {t.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : (
          <>
            <Field label="Customer name" className="sm:col-span-2">
              <TextInput
                value={prospect.name}
                onChange={(e) =>
                  setProspect((p) => ({ ...p, name: e.target.value }))
                }
                autoFocus
              />
            </Field>
            <Field label="Email">
              <TextInput
                type="email"
                value={prospect.email}
                onChange={(e) =>
                  setProspect((p) => ({ ...p, email: e.target.value }))
                }
              />
            </Field>
            <Field label="Phone">
              <TextInput
                type="tel"
                value={prospect.phone}
                onChange={(e) =>
                  setProspect((p) => ({ ...p, phone: e.target.value }))
                }
              />
            </Field>
          </>
        )}
        <Field label="Property address" className="sm:col-span-2">
          <TextInput
            value={mode === 'existing' && !address ? finalAddress : address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St SW, Calgary"
          />
        </Field>
        <Field label="Service type">
          <SelectInput
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {inSeason(s, month) ? '' : ' (off-season)'}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Received via">
          <SelectInput
            value={source}
            onChange={(e) =>
              setSource(e.target.value as ServiceRequest['source'])
            }
          >
            {Object.entries(SOURCE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What does the customer need?"
          />
        </Field>
        <Field label="Photos" className="sm:col-span-2">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((p) => (
              <PhotoTile
                key={p.id}
                url={p.url}
                label={p.label}
                onRemove={() =>
                  setPhotos((ps) => ps.filter((x) => x.id !== p.id))
                }
              />
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-(--line-2) text-xs font-semibold text-(--ink-3) hover:border-(--leaf-500)"
            >
              <Camera className="size-5" /> Add
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              setPhotos((ps) => [
                ...ps,
                ...files.map((f, i) => ({
                  id: uid('ph'),
                  label: `Photo ${ps.length + i + 1}`,
                  url: URL.createObjectURL(f),
                  hue: 100,
                  kind: 'request' as const,
                })),
              ])
            }}
          />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Request details + workflow
// ---------------------------------------------------------------------------

function Workflow({ status }: { status: RequestStatus }) {
  const order: Array<RequestStatus> = [
    'submitted',
    'reviewing',
    'estimated',
    'approved',
    'scheduled',
    'converted',
  ]
  const idx = status === 'rejected' ? 3 : order.indexOf(status)
  const labels = [
    'Submitted',
    'Review',
    'Estimate',
    status === 'rejected' ? 'Rejected' : 'Approved',
    'Schedule',
    'Customer',
  ]
  return (
    <ol className="mt-4 flex items-center">
      {labels.map((l, i) => {
        const done = i < idx || (i === idx && status === 'converted')
        const current = i === idx && status !== 'converted'
        const rejected = status === 'rejected' && i === 3
        return (
          <li key={l} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs font-bold',
                  rejected
                    ? 'bg-(--clay) text-white'
                    : done
                      ? 'bg-(--leaf-700) text-white'
                      : current
                        ? 'bg-(--lime) text-(--leaf-950) ring-4 ring-(--lime-200)'
                        : 'bg-(--sage) text-(--ink-3)',
                )}
              >
                {rejected ? (
                  <XCircle className="size-4" />
                ) : done ? (
                  <Check className="size-4" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'text-[11px] font-semibold whitespace-nowrap',
                  current || rejected ? 'text-(--ink)' : 'text-(--ink-3)',
                )}
              >
                {l}
              </span>
            </div>
            {i < labels.length - 1 && (
              <span
                className={cn(
                  'mx-1 mb-5 h-0.5 flex-1 rounded',
                  i < idx ? 'bg-(--leaf-700)' : 'bg-(--sage-2)',
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function RequestDrawer({
  t,
  req,
  onClose,
}: {
  t: Tenant
  req: ServiceRequest
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'details' | 'estimate'>(
    req.status === 'reviewing' || req.status === 'estimated'
      ? 'estimate'
      : 'details',
  )
  const service = t.service(req.service_id)
  const client = t.client(req.client_id)
  const job = t.jobs.find((j) => j.id === req.job_id)
  const crews = t.crews.filter((c) => c.memberIds.length > 0)
  const [schedule, setSchedule] = useState({
    date: addDays(todayISO(), 2),
    start: '09:00',
    crew_id: crews[0]?.id ?? '',
  })

  const isProspect = !!req.prospect && (!client || client.status === 'lead')

  return (
    <Drawer
      open
      onClose={onClose}
      width={760}
      title={who(t, req)}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={req.status} />
          {isProspect && <Badge tone="lime">New customer</Badge>}
          <span>
            {service?.name} · submitted {relativeTime(req.submittedAt)}
          </span>
        </span>
      }
      header={
        <>
          <Workflow status={req.status} />
          <Tabs
            className="mt-4 -mb-4"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'details', label: 'Request details' },
              {
                value: 'estimate',
                label: req.quote
                  ? `Estimate ${req.quote.number}`
                  : 'Quote generator',
              },
            ]}
          />
        </>
      }
      footer={
        <>
          {(req.status === 'submitted' ||
            req.status === 'reviewing' ||
            req.status === 'estimated') && (
            <Btn
              variant="danger"
              icon={XCircle}
              onClick={() => {
                actions.setRequestStatus(req.id, 'rejected')
                toast('Request rejected', 'info')
              }}
            >
              Reject
            </Btn>
          )}
          {req.status === 'rejected' && (
            <Btn
              variant="outline"
              icon={RotateCcw}
              onClick={() => actions.setRequestStatus(req.id, 'reviewing')}
            >
              Reopen
            </Btn>
          )}
          <span className="flex-1" />
          {req.status === 'submitted' && (
            <Btn
              icon={SearchIcon}
              onClick={() => {
                actions.setRequestStatus(req.id, 'reviewing')
                setTab('estimate')
              }}
            >
              Start review
            </Btn>
          )}
          {req.status === 'reviewing' && !req.quote && (
            <Btn
              variant="outline"
              icon={CheckCircle2}
              onClick={() => {
                actions.setRequestStatus(req.id, 'approved')
                toast('Approved without an estimate')
              }}
            >
              Approve without estimate
            </Btn>
          )}
          {req.status === 'estimated' && (
            <Btn
              icon={CheckCircle2}
              onClick={() => {
                actions.setRequestStatus(req.id, 'approved')
                setTab('details')
                toast('Estimate approved')
              }}
            >
              Mark approved
            </Btn>
          )}
          {req.status === 'scheduled' && (
            <Btn
              icon={UserCheck}
              onClick={() => {
                actions.convertRequest(req.id)
                toast(`${who(t, req)} is now an active client`)
              }}
            >
              Convert to customer
            </Btn>
          )}
          {req.status === 'converted' && client && (
            <Btn
              variant="outline"
              iconRight={ArrowRight}
              onClick={() =>
                navigate({ to: '/clients', search: { id: client.id } })
              }
            >
              View client
            </Btn>
          )}
        </>
      }
    >
      {tab === 'details' && (
        <div className="space-y-4">
          {req.status === 'approved' && (
            <Card className="border-(--leaf-500) p-5">
              <p className="mb-1 flex items-center gap-2 text-sm font-bold">
                <CalendarCheck className="size-4 text-(--leaf-600)" /> Schedule
                the job
              </p>
              <p className="mb-4 text-[13px] text-(--ink-3)">
                {isProspect
                  ? 'This also creates the customer as a lead with their property.'
                  : 'Adds the job to the calendar for this client.'}
                {req.quote &&
                  ` Priced from estimate ${req.quote.number} (${money(quoteTotals(req.quote).total)}).`}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Date">
                  <TextInput
                    type="date"
                    value={schedule.date}
                    onChange={(e) =>
                      setSchedule((s) => ({ ...s, date: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Start">
                  <TextInput
                    type="time"
                    step={900}
                    value={schedule.start}
                    onChange={(e) =>
                      setSchedule((s) => ({ ...s, start: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Crew">
                  <SelectInput
                    value={schedule.crew_id}
                    onChange={(e) =>
                      setSchedule((s) => ({ ...s, crew_id: e.target.value }))
                    }
                  >
                    <option value="">Assign later</option>
                    {crews.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
              </div>
              <Btn
                className="mt-4"
                icon={CalendarCheck}
                onClick={() => {
                  actions.scheduleRequest(req.id, {
                    date: schedule.date,
                    start: schedule.start,
                    crew_id: schedule.crew_id || null,
                  })
                  toast(
                    `Job scheduled for ${fmtDate(schedule.date, { weekday: 'long', month: 'short', day: 'numeric' })}`,
                  )
                }}
              >
                Schedule job
              </Btn>
            </Card>
          )}
          {job && (
            <Alert
              tone="info"
              title={`Scheduled as ${job.number}`}
              action={
                <Btn
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate({ to: '/jobs', search: { id: job.id } })
                  }
                >
                  Open job
                </Btn>
              }
            >
              {fmtDate(job.date, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}{' '}
              at {fmtTime(job.start)} ·{' '}
              {t.crew(job.crew_id)?.name ?? 'No crew yet'}
            </Alert>
          )}
          {req.status === 'rejected' && (
            <Alert tone="danger" title="This request was rejected">
              Reopen it to continue the review.
            </Alert>
          )}

          <Card className="p-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <KeyValue label="Service type">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: service?.color }}
                  />{' '}
                  {service?.name}
                </span>
              </KeyValue>
              <KeyValue label="Received via">
                {SOURCE[req.source].label}
              </KeyValue>
              <KeyValue label="Property address">
                <span className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-(--ink-3)" />{' '}
                  {req.address}
                </span>
              </KeyValue>
              <KeyValue label="Contact">
                {req.prospect ? (
                  <>
                    {req.prospect.email}
                    <br />
                    {req.prospect.phone}
                  </>
                ) : (
                  <>
                    {client?.email}
                    <br />
                    {client?.phone}
                  </>
                )}
              </KeyValue>
              <div className="sm:col-span-2">
                <KeyValue label="Customer notes">
                  <span className="whitespace-pre-wrap">{req.notes}</span>
                </KeyValue>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
              Photos
            </p>
            {req.photos.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {req.photos.map((p) => (
                  <PhotoTile
                    key={p.id}
                    url={p.url}
                    label={p.label}
                    hue={p.hue}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-(--ink-3)">No photos attached.</p>
            )}
          </Card>
          {client && client.status !== 'lead' && (
            <p className="text-[13px] text-(--ink-3)">
              Existing client ·{' '}
              {
                t.jobs.filter(
                  (j) => j.client_id === client.id && j.status === 'completed',
                ).length
              }{' '}
              completed jobs ·{' '}
              <button
                type="button"
                className="cursor-pointer font-semibold text-(--leaf-700)"
                onClick={() =>
                  navigate({ to: '/clients', search: { id: client.id } })
                }
              >
                view profile
              </button>
            </p>
          )}
        </div>
      )}
      {tab === 'estimate' && (
        <EstimateTab
          req={req}
          service={service}
          onSaved={() => setTab('details')}
        />
      )}
    </Drawer>
  )
}

function EstimateTab({
  req,
  service,
  onSaved,
}: {
  req: ServiceRequest
  service: Tenant['services'][number] | undefined
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(!req.quote)
  const locked = req.status === 'scheduled' || req.status === 'converted'
  if (req.quote && !editing) {
    const totals = quoteTotals(req.quote)
    return (
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between bg-(--leaf-900) px-5 py-4 text-(--cream)">
            <div>
              <p className="text-[11px] font-bold tracking-[0.16em] text-(--lime) uppercase">
                Estimate {req.quote.number}
              </p>
              <p className="text-xs text-(--cream)/60">
                Created {relativeTime(req.quote.createdAt)}
              </p>
            </div>
            <p className="crm-display text-3xl font-semibold">
              {money(totals.total, true)}
            </p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {req.quote.lines.map((l) => (
                <tr key={l.id} className="border-t border-(--line)">
                  <td className="px-5 py-2.5">
                    <Badge
                      tone={
                        l.kind === 'labor'
                          ? 'lime'
                          : l.kind === 'materials'
                            ? 'sun'
                            : 'sky'
                      }
                      className="mr-2 capitalize"
                    >
                      {l.kind}
                    </Badge>
                    {l.description}
                  </td>
                  <td className="px-3 py-2.5 text-right text-(--ink-3)">
                    {l.quantity} × {money(l.unit_price_cents, true)}
                  </td>
                  <td className="px-5 py-2.5 text-right font-semibold">
                    {money(Math.round(l.quantity * l.unit_price_cents), true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="space-y-1 border-t border-(--line) bg-(--cream)/60 px-5 py-3 text-sm">
            {[
              ['Labor', totals.labor],
              ['Materials', totals.materials],
              ['Equipment', totals.equipment],
            ].map(([k, v]) => (
              <div
                key={k as string}
                className="flex justify-between text-(--ink-2)"
              >
                <dt>{k}</dt>
                <dd>{money(v as number, true)}</dd>
              </div>
            ))}
            {req.quote.discountCents > 0 && (
              <div className="flex justify-between text-(--ink-2)">
                <dt>Discount</dt>
                <dd>−{money(req.quote.discountCents, true)}</dd>
              </div>
            )}
            <div className="flex justify-between text-(--ink-2)">
              <dt>Tax ({req.quote.taxPercent}%)</dt>
              <dd>{money(totals.tax, true)}</dd>
            </div>
          </dl>
        </Card>
        {!locked && (
          <div className="flex justify-end">
            <Btn variant="outline" onClick={() => setEditing(true)}>
              Edit estimate
            </Btn>
          </div>
        )}
      </div>
    )
  }
  return (
    <QuoteBuilder
      initial={req.quote}
      service={service}
      onCancel={req.quote ? () => setEditing(false) : undefined}
      onSave={(q) => {
        actions.saveQuote(req.id, q)
        toast(req.quote ? 'Estimate updated' : 'Estimate created and sent')
        setEditing(false)
        onSaved()
      }}
    />
  )
}
