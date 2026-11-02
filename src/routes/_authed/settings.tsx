import { useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Building2,
  Check,
  CreditCard,
  Database,
  Lock,
  MapPin,
  Plus,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'

import { useRole } from '#/integrations/organization/use-role'
import PageShell from '#/components/crm/PageShell'
import {
  Alert,
  Avatar,
  Badge,
  Btn,
  Card,
  CardHeader,
  Field,
  Segmented,
  SelectInput,
  StatusBadge,
  Tabs,
  TextInput,
  Toggle,
} from '#/components/crm/ui'
import { toast } from '#/lib/toast'
import { PLANS } from '#/components/crm/plans'
import {
  ROLE_DESCRIPTION,
  ROLE_LABEL,
} from '#/integrations/organization/permissions'
import { actions, useCrmState, useTenant } from '#/mocks/crm-store'
import { diffDays, fmtDate, todayISO } from '#/components/crm/format'
import { cn } from '#/lib/utils'
import type { Tenant } from '#/mocks/crm-store'
import type { BillingCycle, Weekday } from '#/mocks/crm-types'
import type { OrgRole } from '#/integrations/organization/permissions'

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
})

type Tab = 'company' | 'hours' | 'subscription' | 'roles' | 'security'

function SettingsPage() {
  const t = useTenant()
  const access = useRole()
  const [tab, setTab] = useState<Tab>('company')
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'company', label: 'Company profile' },
    { value: 'hours', label: 'Hours & service areas' },
    ...(access.can('manageBilling')
      ? [{ value: 'subscription' as const, label: 'Subscription' }]
      : []),
    { value: 'roles', label: 'Users & roles' },
    { value: 'security', label: 'Data & security' },
  ]
  return (
    <PageShell
      kicker={t.org.name}
      title="Company settings"
      subtitle="Your company profile, hours, service areas, plan, and who can do what."
      allowed={access.can('manageSettings')}
      section="Settings"
    >
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'company' && <CompanyTab t={t} />}
      {tab === 'hours' && <HoursTab t={t} />}
      {tab === 'subscription' && <SubscriptionTab t={t} />}
      {tab === 'roles' && <RolesTab t={t} />}
      {tab === 'security' && <SecurityTab t={t} />}
    </PageShell>
  )
}

function CompanyTab({ t }: { t: Tenant }) {
  const org = t.org
  const file = useRef<HTMLInputElement>(null)
  const save = (patch: Partial<typeof org>) => {
    actions.updateOrganization(org.id, patch)
    toast('Company profile saved', 'info')
  }
  const field = (
    key:
      | 'name'
      | 'email'
      | 'phone'
      | 'address_line1'
      | 'city'
      | 'region'
      | 'postal_code',
    label: string,
    className?: string,
  ) => (
    <Field label={label} className={className}>
      <TextInput
        key={org.id + key}
        defaultValue={org[key]}
        onBlur={(e) =>
          e.target.value !== org[key] && save({ [key]: e.target.value })
        }
      />
    </Field>
  )
  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="p-5">
        <p className="mb-4 text-sm font-bold">Logo & brand</p>
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-(--cream) p-6">
          <span
            className="flex size-24 items-center justify-center overflow-hidden rounded-3xl text-4xl font-bold text-white shadow-md"
            style={{ background: org.brandColor }}
          >
            {org.logoDataUrl ? (
              <img
                src={org.logoDataUrl}
                alt={`${org.name} logo`}
                className="size-full object-cover"
              />
            ) : (
              org.name.charAt(0)
            )}
          </span>
          <div className="flex gap-2">
            <Btn
              variant="outline"
              size="sm"
              icon={Upload}
              onClick={() => file.current?.click()}
            >
              Upload logo
            </Btn>
            {org.logoDataUrl && (
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => save({ logoDataUrl: null })}
              >
                Remove
              </Btn>
            )}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const reader = new FileReader()
              reader.onload = () => save({ logoDataUrl: String(reader.result) })
              reader.readAsDataURL(f)
            }}
          />
        </div>
        <Field
          label="Brand color"
          className="mt-4"
          hint="Used on your workspace badge. Full branding (portal, invoices) is a future enhancement."
        >
          <div className="flex flex-wrap gap-2">
            {[
              '#2f7350',
              '#245a7a',
              '#7a4a24',
              '#5b3f8c',
              '#8c3f4f',
              '#3f6b8c',
              '#11301f',
            ].map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Brand color ${c}`}
                aria-pressed={org.brandColor === c}
                onClick={() => save({ brandColor: c })}
                className={cn(
                  'size-8 cursor-pointer rounded-full border-2',
                  org.brandColor === c
                    ? 'border-(--ink)'
                    : 'border-transparent',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
      </Card>
      <Card className="p-5">
        <p className="mb-4 text-sm font-bold">Company profile</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Company name', 'sm:col-span-2')}
          {field('email', 'Contact email')}
          {field('phone', 'Phone')}
          {field('address_line1', 'Street address', 'sm:col-span-2')}
          {field('city', 'City')}
          {field('region', 'Province / state')}
          {field('postal_code', 'Postal code')}
          <Field label="Time zone">
            <SelectInput
              value={org.timezone}
              onChange={(e) => save({ timezone: e.target.value })}
            >
              {[
                'America/Vancouver',
                'America/Edmonton',
                'America/Denver',
                'America/Winnipeg',
                'America/Toronto',
                'America/Halifax',
              ].map((z) => (
                <option key={z} value={z}>
                  {z.replace('America/', '').replace('_', ' ')}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Card>
    </div>
  )
}

const DAYS: Array<[Weekday, string]> = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
]

function HoursTab({ t }: { t: Tenant }) {
  const org = t.org
  const [area, setArea] = useState('')
  const setDay = (
    d: Weekday,
    patch: Partial<(typeof org.businessHours)[Weekday]>,
  ) =>
    actions.updateOrganization(org.id, {
      businessHours: {
        ...org.businessHours,
        [d]: { ...org.businessHours[d], ...patch },
      },
    })
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Business hours"
          subtitle="Shaded outside these hours on the calendar."
        />
        <div className="divide-y divide-(--line) px-5 pt-2 pb-4">
          {DAYS.map(([d, label]) => {
            const h = org.businessHours[d]
            return (
              <div key={d} className="flex items-center gap-3 py-2.5">
                <span className="w-24 text-sm font-semibold">{label}</span>
                <Toggle
                  checked={!h.closed}
                  label={`Open on ${label}`}
                  onChange={(v) => setDay(d, { closed: !v })}
                />
                {h.closed ? (
                  <span className="text-sm text-(--ink-3)">Closed</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <TextInput
                      type="time"
                      value={h.open}
                      onChange={(e) => setDay(d, { open: e.target.value })}
                      className="h-9 w-32"
                      aria-label={`${label} open`}
                    />
                    <span className="text-(--ink-3)">to</span>
                    <TextInput
                      type="time"
                      value={h.close}
                      onChange={(e) => setDay(d, { close: e.target.value })}
                      className="h-9 w-32"
                      aria-label={`${label} close`}
                    />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Service areas"
          subtitle="Requests outside these areas are flagged during review."
        />
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {org.serviceAreas.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded-full bg-(--lime-100) py-1.5 pr-1.5 pl-3 text-[13px] font-semibold text-(--leaf-900)"
              >
                <MapPin className="size-3.5" /> {a}
                <button
                  type="button"
                  aria-label={`Remove ${a}`}
                  className="cursor-pointer rounded-full p-0.5 hover:bg-white"
                  onClick={() =>
                    actions.updateOrganization(org.id, {
                      serviceAreas: org.serviceAreas.filter((x) => x !== a),
                    })
                  }
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const v = area.trim()
              if (v && !org.serviceAreas.includes(v))
                actions.updateOrganization(org.id, {
                  serviceAreas: [...org.serviceAreas, v],
                })
              setArea('')
            }}
          >
            <TextInput
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Neighbourhood, city, or postal prefix (e.g. T3H)"
              aria-label="Add service area"
            />
            <Btn
              type="submit"
              variant="outline"
              icon={Plus}
              disabled={!area.trim()}
            >
              Add
            </Btn>
          </form>
        </div>
      </Card>
    </div>
  )
}

function SubscriptionTab({ t }: { t: Tenant }) {
  const org = t.org
  const daysLeft = diffDays(org.trialEndsAt, todayISO())
  const [cycle, setCycle] = useState<BillingCycle>(org.billingCycle)
  return (
    <div className="space-y-5">
      {daysLeft >= 0 && (
        <div className="relative overflow-hidden rounded-[22px] bg-(--leaf-900) p-6 text-(--cream)">
          <div
            className="crm-leaf-pattern pointer-events-none absolute inset-0 opacity-50"
            aria-hidden
          />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.16em] text-(--lime) uppercase">
                Free trial
              </p>
              <p className="crm-display mt-1 text-3xl font-semibold">
                {daysLeft} day{daysLeft === 1 ? '' : 's'} left on your{' '}
                {PLANS.find((p) => p.id === org.plan)?.name} trial
              </p>
              <p className="mt-1 text-sm text-(--cream)/70">
                Trial ends{' '}
                {fmtDate(org.trialEndsAt, {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
                . Add a payment method to keep your workspace running.
              </p>
            </div>
            <Btn
              variant="accent"
              icon={CreditCard}
              onClick={() => toast('Stripe checkout would open here', 'info')}
            >
              Add payment method
            </Btn>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Plans</h2>
        <Segmented
          value={cycle}
          onChange={(v) => {
            setCycle(v)
            actions.updateOrganization(org.id, { billingCycle: v })
          }}
          options={[
            { value: 'monthly', label: 'Monthly billing' },
            { value: 'annual', label: 'Annual · save 20%' },
          ]}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const current = p.id === org.plan
          const price = cycle === 'annual' ? p.annual : p.monthly
          return (
            <Card
              key={p.id}
              className={cn(
                'flex flex-col p-6',
                current && 'border-(--leaf-600) ring-2 ring-(--lime)',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold">{p.name}</p>
                {current ? (
                  <Badge tone="dark">Current plan</Badge>
                ) : p.highlight ? (
                  <Badge tone="lime">Most popular</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-[13px] text-(--ink-3)">{p.blurb}</p>
              <p className="crm-display mt-4 text-4xl font-semibold">
                {price === null ? 'Custom' : `$${price}`}
                {price !== null && (
                  <span className="ml-1 font-sans text-sm font-medium text-(--ink-3)">
                    / month
                  </span>
                )}
              </p>
              <p className="text-xs text-(--ink-3)">
                {price !== null && cycle === 'annual'
                  ? `Billed $${price * 12} yearly · `
                  : ''}
                {p.users}
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-[13px]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-(--leaf-600)" />{' '}
                    {f}
                  </li>
                ))}
              </ul>
              <Btn
                className="mt-6"
                variant={
                  current
                    ? 'outline'
                    : p.id === 'enterprise'
                      ? 'outline'
                      : 'primary'
                }
                disabled={current}
                onClick={() => {
                  if (p.id === 'enterprise')
                    return toast(
                      'Our team will reach out about Enterprise',
                      'info',
                    )
                  actions.updateOrganization(org.id, { plan: p.id })
                  toast(`Switched to ${p.name}`)
                }}
              >
                {current
                  ? 'Current plan'
                  : p.id === 'enterprise'
                    ? 'Contact sales'
                    : `Switch to ${p.name}`}
              </Btn>
            </Card>
          )
        })}
      </div>
      <Card>
        <CardHeader title="Billing history" />
        <p className="px-5 pt-2 pb-5 text-sm text-(--ink-3)">
          No invoices yet. Your first invoice is issued when the trial ends.
        </p>
      </Card>
    </div>
  )
}

const PERMISSIONS: Array<{ label: string; roles: Array<OrgRole> }> = [
  {
    label: 'View assigned jobs, upload photos, complete jobs',
    roles: ['owner', 'admin', 'dispatcher', 'worker'],
  },
  {
    label: 'Schedule, dispatch, and reassign jobs',
    roles: ['owner', 'admin', 'dispatcher'],
  },
  {
    label: 'Manage clients, requests, and estimates',
    roles: ['owner', 'admin', 'dispatcher'],
  },
  { label: 'See revenue, prices, and invoices', roles: ['owner', 'admin'] },
  { label: 'Manage services and pricing', roles: ['owner', 'admin'] },
  { label: 'Manage team, crews, and invitations', roles: ['owner', 'admin'] },
  { label: 'Company settings', roles: ['owner', 'admin'] },
  { label: 'Subscription and billing', roles: ['owner'] },
]

function RolesTab({ t }: { t: Tenant }) {
  const roles: Array<OrgRole> = ['owner', 'admin', 'dispatcher', 'worker']
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="overflow-hidden">
        <CardHeader
          title="What each role can do"
          subtitle="Customer portal access (view services and invoices) is planned."
        />
        <div className="crm-scroll overflow-x-auto p-2">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-(--ink-3) uppercase">
                  Permission
                </th>
                {roles.map((r) => (
                  <th
                    key={r}
                    className="px-3 py-3 text-center text-xs font-bold"
                    title={ROLE_DESCRIPTION[r]}
                  >
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.label} className="border-t border-(--line)">
                  <td className="px-3 py-2.5 text-[13px]">{p.label}</td>
                  {roles.map((r) => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      {p.roles.includes(r) ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-(--lime-200) text-(--leaf-900)">
                          <Check className="size-3.5" aria-label="Allowed" />
                        </span>
                      ) : (
                        <span
                          className="text-(--line-2)"
                          aria-label="Not allowed"
                        >
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <CardHeader
          title="People"
          subtitle={`${t.members.length} in this workspace`}
          action={
            <Link
              to="/teams"
              className="text-[13px] font-semibold text-(--leaf-700)"
            >
              Manage team →
            </Link>
          }
        />
        <ul className="divide-y divide-(--line) px-5 pb-3">
          {t.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={m.display_name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">
                  {m.display_name}
                </span>
                <span className="block truncate text-xs text-(--ink-3)">
                  {m.email}
                </span>
              </span>
              {m.status !== 'active' ? (
                <StatusBadge status={m.status} />
              ) : (
                <Badge tone={m.role === 'owner' ? 'dark' : 'gray'}>
                  {ROLE_LABEL[m.role]}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function SecurityTab({ t }: { t: Tenant }) {
  const all = useCrmState()
  const [twoFactor, setTwoFactor] = useState(false)
  const ownRows =
    t.clients.length +
    t.jobs.length +
    t.members.length +
    t.services.length +
    t.invoices.length
  const totalRows =
    all.clients.length +
    all.jobs.length +
    all.members.length +
    all.services.length +
    all.invoices.length
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="size-4 text-(--leaf-600)" /> Workspace
          isolation
        </p>
        <p className="mt-2 text-[13px] text-(--ink-2)">
          Every record belongs to exactly one company. Each screen reads only
          rows whose <code>organization_id</code> matches this workspace, and
          Postgres row-level security enforces the same rule on the server.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-(--cream) p-3">
            <dt className="text-xs font-semibold text-(--ink-3)">
              Workspace ID
            </dt>
            <dd className="mt-1 truncate font-mono text-[13px]">{t.org.id}</dd>
          </div>
          <div className="rounded-2xl bg-(--cream) p-3">
            <dt className="text-xs font-semibold text-(--ink-3)">Slug</dt>
            <dd className="mt-1 font-mono text-[13px]">{t.org.slug}</dd>
          </div>
          <div className="rounded-2xl bg-(--lime-100) p-3">
            <dt className="text-xs font-semibold text-(--ink-3)">
              Records visible here
            </dt>
            <dd className="crm-display mt-1 text-2xl font-semibold">
              {ownRows.toLocaleString()}
            </dd>
          </div>
          <div className="rounded-2xl bg-(--cream) p-3">
            <dt className="text-xs font-semibold text-(--ink-3)">
              Other companies’ records
            </dt>
            <dd className="crm-display mt-1 flex items-center gap-2 text-2xl font-semibold">
              <Lock className="size-4 text-(--ink-3)" />{' '}
              {(totalRows - ownRows).toLocaleString()} hidden
            </dd>
          </div>
        </dl>
        <Alert tone="info" className="mt-4" title="Demo data">
          This preview runs on sample data. Switch companies from the workspace
          menu in the header to see isolation in action.
        </Alert>
      </Card>
      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Database className="size-4 text-(--leaf-600)" /> Account security
        </p>
        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">
                Require two-factor sign-in
              </span>
              <span className="text-xs text-(--ink-3)">
                For owners and managers
              </span>
            </span>
            <Toggle
              checked={twoFactor}
              label="Require two-factor sign-in"
              onChange={setTwoFactor}
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">
                Export company data
              </span>
              <span className="text-xs text-(--ink-3)">
                Clients, jobs, and invoices as CSV
              </span>
            </span>
            <Btn
              variant="outline"
              size="sm"
              icon={Building2}
              onClick={() =>
                toast(
                  'Export started. You’ll get an email when it’s ready.',
                  'info',
                )
              }
            >
              Export
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}
