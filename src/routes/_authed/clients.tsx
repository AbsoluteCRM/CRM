import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Building2,
  CalendarPlus,
  CheckCircle2,
  DollarSign,
  Home,
  Mail,
  MessageSquareDiff,
  Phone,
  Receipt,
  StickyNote,
  UserPlus,
} from 'lucide-react'

import PageShell from '#/components/crm/PageShell'
import JobFormModal from '#/components/crm/JobFormModal'
import {
  Alert,
  Avatar,
  Badge,
  Btn,
  btnClass,
  Card,
  Drawer,
  EmptyState,
  Field,
  FilterChip,
  Modal,
  SearchInput,
  SelectInput,
  StatusBadge,
  Tabs,
  TextArea,
  TextInput,
} from '#/components/crm/ui'
import { toast } from '#/lib/toast'
import {
  actions,
  can,
  invoiceBalance,
  isOverdue,
  useTenant,
} from '#/components/crm/store'
import { fmtDate, fmtTime, money, todayISO } from '#/components/crm/format'
import { useClientMutations, useClients } from '#/integrations/clients/clients'
import { cn } from '#/lib/utils'
import type { ClientRow } from '#/integrations/clients/clients'
import type { Tenant } from '#/components/crm/store'
import type {
  ClientKind,
  ClientStatus,
  Invoice,
  Payment,
} from '#/components/crm/types'

export const Route = createFileRoute('/_authed/clients')({
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
  component: ClientsPage,
})

type StatusFilter = 'all' | ClientStatus
type KindFilter = 'all' | ClientKind
type Sort = 'name' | 'ltv' | 'recent'

const KIND_LABEL: Record<ClientKind, string> = {
  individual: 'Residential',
  company: 'Commercial',
}

function ClientsPage() {
  const t = useTenant()
  const { id } = Route.useSearch()
  const navigate = useNavigate()
  const clients = useClients()
  const { createClient, updateClient, creating } = useClientMutations()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [adding, setAdding] = useState(false)

  const clientRows = clients.data ?? []
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return clientRows
      .map((c) => ({
        client: c,
        property: t.propertiesOf(c.id).at(0),
        ltv: t.clientLifetimeValue(c.id),
      }))
      .filter(({ client }) => {
        if (status !== 'all' && client.status !== status) return false
        if (kind !== 'all' && client.kind !== kind) return false
        if (!needle) return true
        const addresses = t
          .propertiesOf(client.id)
          .map((p) => p.address_line1)
          .join(' ')
        return `${client.display_name} ${(client.phone ?? '').replace(/\D/g, '')} ${client.phone ?? ''} ${client.email ?? ''} ${addresses}`
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) =>
        sort === 'ltv'
          ? b.ltv - a.ltv
          : sort === 'recent'
            ? b.client.created_at.localeCompare(a.client.created_at)
            : a.client.display_name.localeCompare(b.client.display_name),
      )
  }, [clientRows, t, q, status, kind, sort])

  const counts = {
    all: clientRows.length,
    active: clientRows.filter((c) => c.status === 'active').length,
    inactive: clientRows.filter((c) => c.status === 'inactive').length,
    lead: clientRows.filter((c) => c.status === 'lead').length,
  }
  const totalLtv = clientRows.reduce(
    (s, c) => s + t.clientLifetimeValue(c.id),
    0,
  )
  const commercial = clientRows.filter((c) => c.kind === 'company').length
  // Scoped to the real list's ids (D5): mock invoices never reference a real client, so this reads $0.
  const outstanding = t.invoices
    .filter((i) => clientRows.some((c) => c.id === i.client_id))
    .reduce(
      (s, i) =>
        s +
        (i.status === 'paid' || i.status === 'void' ? 0 : invoiceBalance(i)),
      0,
    )
  const selectedClient = clientRows.find((c) => c.id === id)

  return (
    <PageShell
      kicker="Customer management"
      title="Clients"
      subtitle="Homeowners and commercial properties, with service history, invoices, and notes in one place."
      allowed={can.manageClients(t.role)}
      section="Clients"
      actions={
        <Btn icon={UserPlus} onClick={() => setAdding(true)}>
          Add client
        </Btn>
      }
    >
      {clients.isError ? (
        <Alert
          tone="danger"
          title="Couldn't load clients"
          action={
            <Btn variant="outline" onClick={() => void clients.refetch()}>
              Try again
            </Btn>
          }
        >
          Please try again.
        </Alert>
      ) : clients.isPending ? (
        <p className="py-20 text-center text-sm text-(--ink-3)" role="status">
          Loading clients…
        </p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              {
                label: 'Active clients',
                value: String(counts.active),
                sub: `${counts.lead} leads · ${counts.inactive} inactive`,
              },
              {
                label: 'Commercial accounts',
                value: String(commercial),
                sub: `${clientRows.length - commercial} residential`,
              },
              {
                label: 'Lifetime value',
                value: can.viewRevenue(t.role) ? money(totalLtv) : '—',
                sub: 'Collected payments, all clients',
              },
              {
                label: 'Outstanding',
                value: can.viewRevenue(t.role) ? money(outstanding) : '—',
                sub: `${t.invoices.filter(isOverdue).length} invoices overdue`,
              },
            ].map((k) => (
              <Card key={k.label} className="p-4">
                <p className="text-xs font-semibold text-(--ink-3)">
                  {k.label}
                </p>
                <p className="crm-display mt-1 text-2xl font-semibold">
                  {k.value}
                </p>
                <p className="mt-0.5 text-xs text-(--ink-3)">{k.sub}</p>
              </Card>
            ))}
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-(--line) p-4">
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder="Search by name, address, or phone"
                className="w-full sm:w-80"
              />
              <div className="flex flex-wrap gap-2">
                {(['all', 'active', 'inactive', 'lead'] as const).map((s) => (
                  <FilterChip
                    key={s}
                    active={status === s}
                    onClick={() => setStatus(s)}
                  >
                    {s === 'all'
                      ? 'All'
                      : s === 'lead'
                        ? 'Leads'
                        : s[0].toUpperCase() + s.slice(1)}{' '}
                    <span className="opacity-60">{counts[s]}</span>
                  </FilterChip>
                ))}
              </div>
              <span className="hidden h-6 w-px bg-(--line) md:block" />
              <div className="flex flex-wrap gap-2">
                {(['all', 'individual', 'company'] as const).map((k) => (
                  <FilterChip
                    key={k}
                    active={kind === k}
                    onClick={() => setKind(k)}
                  >
                    {k === 'all' ? 'All types' : KIND_LABEL[k]}
                  </FilterChip>
                ))}
              </div>
              <SelectInput
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="ml-auto w-44"
                aria-label="Sort clients"
              >
                <option value="name">Sort: Name</option>
                <option value="ltv">Sort: Lifetime value</option>
                <option value="recent">Sort: Newest</option>
              </SelectInput>
            </div>

            <div className="crm-scroll overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
                    <th className="px-5 py-3">Name</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Address</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Lifetime value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ client, property, ltv }) => (
                    <tr
                      key={client.id}
                      onClick={() =>
                        navigate({ to: '/clients', search: { id: client.id } })
                      }
                      className="cursor-pointer border-t border-(--line) transition-colors hover:bg-(--cream)"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={client.display_name}
                            color={
                              client.kind === 'company'
                                ? 'var(--sky-100)'
                                : 'var(--lime-200)'
                            }
                            size={34}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-bold">
                              {client.display_name}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-(--ink-3)">
                              {client.kind === 'company' ? (
                                <Building2 className="size-3" />
                              ) : (
                                <Home className="size-3" />
                              )}
                              {KIND_LABEL[client.kind]}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-(--ink-2)">
                        {client.phone ?? ''}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-(--ink-2)">
                        {client.email ?? ''}
                      </td>
                      <td className="max-w-[240px] truncate px-3 py-3 text-(--ink-2)">
                        {property?.address_line1}
                        {t.propertiesOf(client.id).length > 1 && (
                          <Badge className="ml-2">
                            +{t.propertiesOf(client.id).length - 1}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={client.status} />
                      </td>
                      <td className="px-5 py-3 text-right font-semibold">
                        {can.viewRevenue(t.role) ? money(ltv) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <EmptyState
                  title={
                    clientRows.length ? 'No clients match' : 'No clients yet'
                  }
                  body={
                    clientRows.length
                      ? 'Try a different search or filter.'
                      : 'Add your first client, or convert one from a request.'
                  }
                  action={
                    !clientRows.length && (
                      <Btn icon={UserPlus} onClick={() => setAdding(true)}>
                        Add client
                      </Btn>
                    )
                  }
                />
              )}
            </div>
          </Card>
        </>
      )}

      {adding && (
        <AddClientModal
          onClose={() => setAdding(false)}
          onCreated={(cid) => navigate({ to: '/clients', search: { id: cid } })}
          createClient={createClient}
          creating={creating}
        />
      )}
      {id && selectedClient && (
        <ClientProfile
          t={t}
          client={selectedClient}
          updateClient={updateClient}
          onClose={() => navigate({ to: '/clients', search: {} })}
        />
      )}
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Add client
// ---------------------------------------------------------------------------

function AddClientModal({
  onClose,
  onCreated,
  createClient,
  creating,
}: {
  onClose: () => void
  onCreated: (id: string) => void
  createClient: ReturnType<typeof useClientMutations>['createClient']
  creating: boolean
}) {
  const [form, setForm] = useState({
    display_name: '',
    kind: 'individual' as ClientKind,
    email: '',
    phone: '',
  })
  const set =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))
  const valid = form.display_name.trim().length > 0

  const submit = async () => {
    try {
      const client = await createClient({
        display_name: form.display_name.trim(),
        kind: form.kind,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
      })
      toast(`${client.display_name} added`)
      onClose()
      onCreated(client.id)
    } catch {
      // The mutation's onError already toasted; keep the modal open to retry.
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add a client"
      subtitle="Contact details for the client you’ll be servicing."
      width={620}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            icon={UserPlus}
            disabled={!valid || creating}
            onClick={() => void submit()}
          >
            Add client
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <TextInput
            value={form.display_name}
            onChange={set('display_name')}
            placeholder="Jane Smith or Acme Property Group"
            autoFocus
          />
        </Field>
        <Field label="Type">
          <SelectInput value={form.kind} onChange={set('kind')}>
            <option value="individual">Residential</option>
            <option value="company">Commercial</option>
          </SelectInput>
        </Field>
        <Field label="Phone">
          <TextInput
            type="tel"
            value={form.phone}
            onChange={set('phone')}
            placeholder="(403) 555-0100"
          />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <TextInput
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="name@example.com"
          />
        </Field>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Client profile
// ---------------------------------------------------------------------------

type ProfileTab =
  'overview' | 'history' | 'scheduled' | 'invoices' | 'notes' | 'timeline'

function ClientProfile({
  t,
  client,
  updateClient,
  onClose,
}: {
  t: Tenant
  client: ClientRow
  updateClient: ReturnType<typeof useClientMutations>['updateClient']
  onClose: () => void
}) {
  const [tab, setTab] = useState<ProfileTab>('overview')
  const [scheduling, setScheduling] = useState(false)
  const today = todayISO()
  const jobs = t.jobs.filter((j) => j.client_id === client.id)
  const history = jobs
    .filter((j) => j.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date))
  const upcoming = jobs
    .filter(
      (j) =>
        j.date >= today &&
        (j.status === 'scheduled' ||
          j.status === 'assigned' ||
          j.status === 'in_progress'),
    )
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  const invoices = t.invoices
    .filter((i) => i.client_id === client.id)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  const ltv = t.clientLifetimeValue(client.id)
  const balance = invoices.reduce(
    (s, i) => s + (i.status === 'void' ? 0 : invoiceBalance(i)),
    0,
  )

  return (
    <Drawer
      open
      onClose={onClose}
      width={760}
      title={client.display_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={client.status} />
          <Badge tone={client.kind === 'company' ? 'sky' : 'lime'}>
            {KIND_LABEL[client.kind]}
          </Badge>
          <span>
            Client since{' '}
            {fmtDate(client.created_at.slice(0, 10), {
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </span>
      }
      header={
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-(--lime-100) px-4 py-3">
              <p className="text-xs font-semibold text-(--ink-3)">
                Lifetime value
              </p>
              <p className="crm-display text-xl font-semibold">
                {can.viewRevenue(t.role) ? money(ltv) : '—'}
              </p>
            </div>
            <div className="rounded-2xl bg-(--cream) px-4 py-3">
              <p className="text-xs font-semibold text-(--ink-3)">
                Balance due
              </p>
              <p
                className={cn(
                  'crm-display text-xl font-semibold',
                  balance > 0 && 'text-(--clay)',
                )}
              >
                {can.viewRevenue(t.role) ? money(balance) : '—'}
              </p>
            </div>
            <div className="rounded-2xl bg-(--cream) px-4 py-3">
              <p className="text-xs font-semibold text-(--ink-3)">
                Jobs completed
              </p>
              <p className="crm-display text-xl font-semibold">
                {history.length}
              </p>
            </div>
          </div>
          <Tabs
            className="mt-4 -mb-4"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              {
                value: 'history',
                label: 'Service history',
                count: history.length,
              },
              {
                value: 'scheduled',
                label: 'Scheduled',
                count: upcoming.length,
              },
              { value: 'invoices', label: 'Invoices', count: invoices.length },
              { value: 'notes', label: 'Notes' },
              { value: 'timeline', label: 'Timeline' },
            ]}
          />
        </>
      }
      footer={
        <>
          <SelectInput
            value={client.status}
            onChange={(e) => {
              updateClient(client.id, {
                status: e.target.value as ClientStatus,
              })
              toast(`Marked ${e.target.value}`, 'info')
            }}
            className="w-40"
            aria-label="Client status"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="lead">Lead</option>
          </SelectInput>
          <span className="flex-1" />
          <Btn icon={CalendarPlus} onClick={() => setScheduling(true)}>
            Schedule job
          </Btn>
        </>
      }
    >
      {tab === 'overview' && (
        <OverviewTab t={t} client={client} updateClient={updateClient} />
      )}
      {tab === 'history' && (
        <JobList
          t={t}
          jobs={history}
          empty="No completed jobs yet."
          showNotes
        />
      )}
      {tab === 'scheduled' && (
        <JobList t={t} jobs={upcoming} empty="Nothing scheduled." />
      )}
      {tab === 'invoices' && <InvoicesTab t={t} invoices={invoices} />}
      {tab === 'notes' && (
        <NotesTab client={client} updateClient={updateClient} />
      )}
      {tab === 'timeline' && <TimelineTab t={t} client={client} />}
      {scheduling && (
        <JobFormModal
          open
          onClose={() => setScheduling(false)}
          defaults={{ client_id: client.id }}
        />
      )}
    </Drawer>
  )
}

function InlineEdit({
  value,
  onSave,
  label,
  type = 'text',
  multiline,
  placeholder,
}: {
  value: string
  onSave: (v: string) => void
  label: string
  type?: string
  multiline?: boolean
  placeholder?: string
}) {
  return multiline ? (
    <TextArea
      aria-label={label}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
      className="min-h-16"
    />
  ) : (
    <TextInput
      aria-label={label}
      type={type}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
    />
  )
}

function OverviewTab({
  t,
  client,
  updateClient,
}: {
  t: Tenant
  client: ClientRow
  updateClient: ReturnType<typeof useClientMutations>['updateClient']
}) {
  const properties = t.propertiesOf(client.id)
  const saved = () => toast('Saved', 'info')
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="mb-4 text-xs font-bold tracking-wider text-(--ink-3) uppercase">
          Contact information
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <InlineEdit
              label="Name"
              value={client.display_name}
              onSave={(v) => {
                updateClient(client.id, { display_name: v })
                saved()
              }}
            />
          </Field>
          <Field label="Type">
            <SelectInput
              value={client.kind}
              onChange={(e) => {
                const nextKind = e.target.value as ClientKind
                updateClient(client.id, {
                  kind: nextKind,
                  // D1: auto-supply company_name so the DB's non-empty-for-company check never trips from this page.
                  ...(nextKind === 'company' && {
                    company_name: client.display_name,
                  }),
                })
                saved()
              }}
            >
              <option value="individual">Residential</option>
              <option value="company">Commercial</option>
            </SelectInput>
          </Field>
          <Field label="Phone">
            <InlineEdit
              label="Phone"
              type="tel"
              value={client.phone ?? ''}
              onSave={(v) => {
                updateClient(client.id, { phone: v })
                saved()
              }}
            />
          </Field>
          <Field label="Email">
            <InlineEdit
              label="Email"
              type="email"
              value={client.email ?? ''}
              onSave={(v) => {
                updateClient(client.id, { email: v })
                saved()
              }}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`tel:${client.phone ?? ''}`}
            className={btnClass('outline', 'sm')}
          >
            <Phone className="size-3.5" /> Call
          </a>
          <a
            href={`mailto:${client.email ?? ''}`}
            className={btnClass('outline', 'sm')}
          >
            <Mail className="size-3.5" /> Email
          </a>
        </div>
      </Card>

      {properties.map((p) => (
        <Card key={p.id} className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-bold tracking-wider text-(--ink-3) uppercase">
              Property · {p.label}
            </p>
            <Badge tone="green">
              <Home className="size-3" />{' '}
              {p.lawnSqft
                ? `${p.lawnSqft.toLocaleString()} sq ft`
                : 'Size unknown'}
            </Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address" className="sm:col-span-2">
              <InlineEdit
                label="Address"
                value={p.address_line1}
                onSave={(v) => {
                  actions.updateProperty(p.id, { address_line1: v })
                  saved()
                }}
              />
            </Field>
            <Field label="Front lawn size (sq ft)">
              <InlineEdit
                label="Lawn size"
                type="number"
                value={String(p.lawnSqft || '')}
                onSave={(v) => {
                  actions.updateProperty(p.id, { lawnSqft: Number(v) || 0 })
                  saved()
                }}
              />
            </Field>
            <Field label="Gate code">
              <InlineEdit
                label="Gate code"
                value={p.gateCode}
                onSave={(v) => {
                  actions.updateProperty(p.id, { gateCode: v })
                  saved()
                }}
              />
            </Field>
            <Field label="Pets present">
              <InlineEdit
                label="Pets"
                value={p.pets}
                onSave={(v) => {
                  actions.updateProperty(p.id, { pets: v })
                  saved()
                }}
              />
            </Field>
            <Field label="Access">
              <InlineEdit
                label="Access notes"
                value={p.accessNotes}
                onSave={(v) => {
                  actions.updateProperty(p.id, { accessNotes: v })
                  saved()
                }}
              />
            </Field>
            <Field label="Special instructions" className="sm:col-span-2">
              <InlineEdit
                label="Special instructions"
                multiline
                value={p.instructions}
                onSave={(v) => {
                  actions.updateProperty(p.id, { instructions: v })
                  saved()
                }}
              />
            </Field>
          </div>
        </Card>
      ))}
    </div>
  )
}

function JobList({
  t,
  jobs,
  empty,
  showNotes,
}: {
  t: Tenant
  jobs: Tenant['jobs']
  empty: string
  showNotes?: boolean
}) {
  const navigate = useNavigate()
  if (!jobs.length) return <EmptyState title={empty} />
  return (
    <ul className="space-y-2">
      {jobs.slice(0, 40).map((j) => (
        <li key={j.id}>
          <button
            type="button"
            onClick={() => navigate({ to: '/jobs', search: { id: j.id } })}
            className="flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-(--line) bg-(--paper) px-4 py-3 text-left hover:border-(--leaf-500)"
          >
            <div className="w-14 shrink-0 text-center">
              <p className="text-[11px] font-semibold text-(--ink-3) uppercase">
                {fmtDate(j.date, { month: 'short' })}
              </p>
              <p className="crm-display text-2xl leading-none font-semibold">
                {fmtDate(j.date, { day: 'numeric' })}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {t
                  .jobServices(j)
                  .map((s) => s.name)
                  .join(', ')}
              </p>
              <p className="truncate text-xs text-(--ink-3)">
                {j.number} · {fmtTime(j.start)} ·{' '}
                {t.crew(j.crew_id)?.name ?? 'Unassigned'}
              </p>
              {showNotes && j.completionNotes && (
                <p className="mt-1 truncate text-xs text-(--ink-2)">
                  “{j.completionNotes}”
                </p>
              )}
            </div>
            <div className="text-right">
              <StatusBadge status={j.status} />
              {can.viewRevenue(t.role) && (
                <p className="mt-1 text-xs font-semibold text-(--ink-2)">
                  {money(j.price_cents)}
                </p>
              )}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function InvoicesTab({ t, invoices }: { t: Tenant; invoices: Array<Invoice> }) {
  const [paying, setPaying] = useState<Invoice | null>(null)
  if (!invoices.length)
    return (
      <EmptyState
        icon={Receipt}
        title="No invoices yet"
        body="Invoices are created when jobs are completed."
      />
    )
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-(--line) bg-(--paper)">
        <table className="w-full text-left text-sm">
          <thead className="bg-(--cream) text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
            <tr>
              <th className="px-4 py-2.5">Invoice</th>
              <th className="px-3 py-2.5">Issued</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-4 py-2.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const bal = invoiceBalance(inv)
              return (
                <tr key={inv.id} className="border-t border-(--line)">
                  <td className="px-4 py-2.5 font-semibold">{inv.number}</td>
                  <td className="px-3 py-2.5 text-(--ink-2)">
                    {fmtDate(inv.issuedAt, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      status={isOverdue(inv) ? 'overdue' : inv.status}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {money(inv.total_cents)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {bal > 0 && can.viewRevenue(t.role) ? (
                      <Btn
                        size="sm"
                        variant="subtle"
                        icon={DollarSign}
                        onClick={() => setPaying(inv)}
                      >
                        {money(bal)}
                      </Btn>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-(--leaf-600)">
                        <CheckCircle2 className="size-3.5" /> Paid
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {paying && (
        <PaymentModal invoice={paying} onClose={() => setPaying(null)} />
      )}
    </>
  )
}

function PaymentModal({
  invoice,
  onClose,
}: {
  invoice: Invoice
  onClose: () => void
}) {
  const balance = invoiceBalance(invoice)
  const [amount, setAmount] = useState((balance / 100).toFixed(2))
  const [method, setMethod] = useState<Payment['method']>('card')
  const cents = Math.round(Number(amount) * 100)
  return (
    <Modal
      open
      onClose={onClose}
      width={440}
      title={`Record payment · ${invoice.number}`}
      subtitle={`Balance ${money(balance, true)}`}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            icon={CheckCircle2}
            disabled={!(cents > 0 && cents <= balance)}
            onClick={() => {
              actions.recordPayment(invoice.id, cents, method)
              toast(`Payment of ${money(cents, true)} recorded`)
              onClose()
            }}
          >
            Record payment
          </Btn>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Amount">
          <TextInput
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Method">
          <SelectInput
            value={method}
            onChange={(e) => setMethod(e.target.value as Payment['method'])}
          >
            <option value="card">Card</option>
            <option value="etransfer">e-Transfer</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
          </SelectInput>
        </Field>
      </div>
    </Modal>
  )
}

function NotesTab({
  client,
  updateClient,
}: {
  client: ClientRow
  updateClient: ReturnType<typeof useClientMutations>['updateClient']
}) {
  const notes = client.notes ?? ''
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <InlineEdit
          label="Notes"
          multiline
          value={notes}
          placeholder="Add a note about this client…"
          onSave={(v) => updateClient(client.id, { notes: v })}
        />
      </Card>
      {notes === '' && <EmptyState icon={StickyNote} title="No notes yet" />}
    </div>
  )
}

function TimelineTab({ t, client }: { t: Tenant; client: ClientRow }) {
  const today = todayISO()
  type Ev = {
    at: string
    icon: typeof Receipt
    title: string
    sub?: string
    tone: string
  }
  const events: Array<Ev> = [
    {
      at: client.created_at,
      icon: UserPlus,
      title: 'Became a client',
      tone: 'var(--lime-200)',
    },
    ...t.requests
      .filter((r) => r.client_id === client.id)
      .map((r) => ({
        at: r.submittedAt,
        icon: MessageSquareDiff,
        title: `Requested ${t.service(r.service_id)?.name}`,
        sub: r.notes,
        tone: 'var(--violet-100)',
      })),
    ...t.jobs
      .filter((j) => j.client_id === client.id && j.status !== 'cancelled')
      .map((j) => ({
        at: `${j.date}T${j.start}:00`,
        icon: j.status === 'completed' ? CheckCircle2 : CalendarPlus,
        title: `${j.status === 'completed' ? 'Job completed' : j.date >= today ? 'Service booked' : 'Service'}: ${t
          .jobServices(j)
          .map((s) => s.name)
          .join(', ')}`,
        sub: `${j.number} · ${t.crew(j.crew_id)?.name ?? 'Unassigned'}`,
        tone: j.status === 'completed' ? 'var(--sage)' : 'var(--sky-100)',
      })),
    ...t.invoices
      .filter((i) => i.client_id === client.id)
      .flatMap((i) => [
        ...i.payments.map((p) => ({
          at: p.at,
          icon: DollarSign,
          title: `Invoice paid · ${i.number}`,
          sub: money(p.amount_cents),
          tone: 'var(--lime-100)',
        })),
      ]),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <ol className="relative ml-4 border-l-2 border-(--line) pl-6">
      {events.slice(0, 60).map((e, i) => (
        <li key={i} className="relative pb-5">
          <span
            className="absolute top-0 -left-[39px] flex size-7 items-center justify-center rounded-full border-2 border-(--cream) text-(--leaf-800)"
            style={{ background: e.tone }}
          >
            <e.icon className="size-3.5" />
          </span>
          <p className="text-sm font-semibold">{e.title}</p>
          {e.sub && (
            <p className="mt-0.5 line-clamp-2 text-xs text-(--ink-2)">
              {e.sub}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-(--ink-3)">
            {fmtDate(e.at.slice(0, 10), {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </li>
      ))}
    </ol>
  )
}
