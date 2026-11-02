import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Building2,
  Check,
  CreditCard,
  Database,
  Lock,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'

import PageShell from '#/components/crm/PageShell'
import { ServiceAreasSection } from '#/components/service-areas/ServiceAreasSection'
import {
  Alert,
  Avatar,
  Badge,
  Btn,
  Card,
  CardHeader,
  EmptyState,
  Field,
  SelectInput,
  StatusBadge,
  Tabs,
  TextInput,
  Toggle,
} from '#/components/crm/ui'
import { toast } from '#/lib/toast'
import { PLANS } from '#/components/crm/plans'
import OnlineRequestsSettings from '#/components/settings/OnlineRequestsSettings'
import { useOrganization } from '#/integrations/organization/context'
import {
  ROLE_DESCRIPTION,
  ROLE_LABEL,
} from '#/integrations/organization/permissions'
import { useRole } from '#/integrations/organization/use-role'
import { WEEKDAYS } from '#/integrations/settings/schema'
import {
  portalUrl,
  useCompanySettings,
  useSettingsMutations,
  useSettingsOverview,
} from '#/integrations/settings/settings'
import { useTeamMembers } from '#/integrations/teams/teams'
import { cn } from '#/lib/utils'
import type { OrgRole } from '#/integrations/organization/permissions'
import type {
  BusinessHours,
  DayHours,
  Weekday,
} from '#/integrations/settings/schema'
import type {
  CompanyProfile,
  ProfilePatch,
  SettingsPatch,
} from '#/integrations/settings/settings'
import AppThemePicker from '#/components/settings/AppThemePicker'

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsPage,
})

type Tab =
  'company' | 'hours' | 'online' | 'subscription' | 'roles' | 'security'

function SettingsPage() {
  const { organization } = useOrganization()
  const access = useRole()
  const [tab, setTab] = useState<Tab>('company')
  const company = useCompanySettings()
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'company', label: 'Company profile' },
    { value: 'hours', label: 'Hours & service areas' },
    { value: 'online', label: 'Online requests' },
    ...(access.can('manageBilling')
      ? [{ value: 'subscription' as const, label: 'Subscription' }]
      : []),
    { value: 'roles', label: 'Users & roles' },
    { value: 'security', label: 'Data & security' },
  ]

  return (
    <PageShell
      kicker={organization?.name}
      title="Company settings"
      subtitle="Your company profile, hours, online requests, plan, and who can do what."
      allowed={access.can('manageSettings')}
      section="Settings"
    >
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={tabs} />
      {company.isPending ? (
        <p role="status" className="py-16 text-center text-sm text-(--ink-3)">
          Loading settings…
        </p>
      ) : company.isError ? (
        <EmptyState
          title="Couldn’t load your settings"
          body={company.error.message}
          action={
            <Btn variant="outline" onClick={() => void company.refetch()}>
              Try again
            </Btn>
          }
        />
      ) : (
        // Remount per organization so drafts never leak between workspaces.
        <div key={company.data.id}>
          {tab === 'company' && <CompanyTab org={company.data} />}
          {tab === 'hours' && <HoursTab org={company.data} />}
          {tab === 'online' && <OnlineTab org={company.data} />}
          {tab === 'subscription' && <SubscriptionTab />}
          {tab === 'roles' && <RolesTab />}
          {tab === 'security' && <SecurityTab org={company.data} />}
        </div>
      )}
    </PageShell>
  )
}

/** Wraps a save so callers get true/false; the mutation already toasts errors. */
function useSave() {
  const m = useSettingsMutations()
  return {
    ...m,
    profile: (patch: ProfilePatch) =>
      m.saveProfile(patch).then(
        () => true,
        () => false,
      ),
    settings: (patch: SettingsPatch) =>
      m.saveSettings(patch).then(
        () => true,
        () => false,
      ),
  }
}

const TIME_ZONES = [
  'America/Vancouver',
  'America/Edmonton',
  'America/Denver',
  'America/Regina',
  'America/Winnipeg',
  'America/Toronto',
  'America/Halifax',
  'America/St_Johns',
]

/** "Edmonton (10:42 AM)": the zone's city and its current local time. */
function zoneLabel(zone: string, now: Date) {
  const city = zone.split('/').pop()!.replace(/_/g, ' ')
  try {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(now)
    return `${city} (${time})`
  } catch {
    return city
  }
}

/** The current time, refreshed every 30 seconds. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function CompanyTab({ org }: { org: CompanyProfile }) {
  const save = useSave()
  const file = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const brand = org.settings.brand_color

  const { organization, reloadAndSelectOrganization } = useOrganization()
  const now = useNow()
  const initial = {
    name: org.name,
    email: org.email ?? '',
    phone: org.phone ?? '',
    address_line1: org.address_line1 ?? '',
    city: org.city ?? '',
    region: org.region ?? '',
    postal_code: org.postal_code ?? '',
    timezone: org.timezone,
  }
  type Draft = typeof initial
  const [draft, setDraft] = useState<Draft>(initial)
  const changed = (Object.keys(initial) as Array<keyof Draft>).filter(
    (k) => draft[k].trim() !== initial[k],
  )
  const nameMissing = draft.name.trim() === ''

  const saveProfile = async () => {
    const patch = Object.fromEntries(
      changed.map((k) => [k, draft[k].trim()]),
    ) as ProfilePatch
    if (!(await save.profile(patch))) return
    toast('Company profile saved')
    // The company switcher caches the name; reload it so it shows the new one.
    if (changed.includes('name') && organization) {
      await reloadAndSelectOrganization(organization.id).catch(() => {})
    }
  }

  const field = (
    key: Exclude<keyof Draft, 'timezone'>,
    label: string,
    opts: { className?: string; type?: string } = {},
  ) => (
    <Field label={label} className={opts.className} htmlFor={`org-${key}`}>
      <TextInput
        id={`org-${key}`}
        type={opts.type}
        value={draft[key]}
        aria-invalid={key === 'name' && nameMissing ? true : undefined}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      />
    </Field>
  )

  const upload = async (f: File) => {
    setUploading(true)
    try {
      await save.uploadLogo(f)
      toast('Logo updated')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t upload the logo')
    } finally {
      setUploading(false)
      if (file.current) file.current.value = ''
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="p-5">
        <p className="mb-4 text-sm font-bold">Logo & brand</p>
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-(--cream) p-6">
          <span
            className="flex size-24 items-center justify-center overflow-hidden rounded-3xl text-4xl font-bold text-white shadow-md"
            style={{ background: org.logo_url ? '#fff' : brand }}
          >
            {org.logo_url ? (
              <img
                src={org.logo_url}
                alt={`${org.name} logo`}
                className="size-full object-contain"
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
              disabled={uploading}
              onClick={() => file.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Upload logo'}
            </Btn>
            {org.logo_url && (
              <Btn
                variant="ghost"
                size="sm"
                disabled={uploading || save.saving}
                onClick={() =>
                  void save
                    .removeLogo()
                    .then(() => toast('Logo removed', 'info'))
                    .catch(() => {})
                }
              >
                Remove
              </Btn>
            )}
          </div>
          <p className="text-center text-xs text-(--ink-3)">
            PNG, JPG, or WebP, up to 2 MB.
          </p>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
            }}
          />
        </div>
        <Field
          label="Colour theme"
          className="mt-4"
          hint="Colours your team’s menu, buttons and highlights. Your public request page has its own colours under Online requests."
        >
          <AppThemePicker
            value={brand}
            disabled={save.saving}
            onPick={(c) =>
              void save
                .settings({ brand_color: c })
                .then((ok) => ok && toast('Colour theme saved', 'info'))
            }
          />
        </Field>
      </Card>
      <Card className="p-5">
        <p className="mb-4 text-sm font-bold">Company profile</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Company name', { className: 'sm:col-span-2' })}
          {field('email', 'Contact email', { type: 'email' })}
          {field('phone', 'Phone', { type: 'tel' })}
          {field('address_line1', 'Street address', {
            className: 'sm:col-span-2',
          })}
          {field('city', 'City')}
          {field('region', 'Province / state')}
          {field('postal_code', 'Postal code')}
          <Field label="Time zone" htmlFor="org-timezone">
            <SelectInput
              id="org-timezone"
              value={draft.timezone}
              onChange={(e) =>
                setDraft((d) => ({ ...d, timezone: e.target.value }))
              }
            >
              {[...new Set([org.timezone, ...TIME_ZONES])].map((z) => (
                <option key={z} value={z}>
                  {zoneLabel(z, now)}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-(--line) pt-4">
          <p className="mr-auto text-xs text-(--ink-3)">
            {nameMissing
              ? 'Company name can’t be empty.'
              : changed.length > 0
                ? 'You have unsaved changes.'
                : ''}
          </p>
          <Btn
            variant="ghost"
            disabled={changed.length === 0 || save.saving}
            onClick={() => setDraft(initial)}
          >
            Discard
          </Btn>
          <Btn
            icon={Save}
            disabled={changed.length === 0 || nameMissing || save.saving}
            onClick={() => void saveProfile()}
          >
            {save.saving ? 'Saving…' : 'Save changes'}
          </Btn>
        </div>
      </Card>
    </div>
  )
}

const DAY_LABEL: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

function HoursTab({ org }: { org: CompanyProfile }) {
  const save = useSave()
  const saved = org.settings.business_hours
  const [hours, setHours] = useState<BusinessHours>(saved)
  const [area, setArea] = useState('')
  const areas = org.settings.service_areas
  const dirty = WEEKDAYS.some(
    (d) => JSON.stringify(hours[d]) !== JSON.stringify(saved[d]),
  )
  const invalid = WEEKDAYS.filter(
    (d) => !hours[d].closed && hours[d].open >= hours[d].close,
  )
  const setDay = (d: Weekday, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [d]: { ...h[d], ...patch } }))
  const saveAreas = (next: Array<string>, message: string) =>
    void save
      .settings({ service_areas: next })
      .then((ok) => ok && toast(message, 'info'))

  return (
    <div className="grid gap-5">
      <Card className="max-w-3xl">
        <CardHeader
          title="Business hours"
          subtitle="Shown on your public request page. Closed days are days off for the whole team."
        />
        <div className="divide-y divide-(--line) px-5 pt-2">
          {WEEKDAYS.map((d) => {
            const h = hours[d]
            const label = DAY_LABEL[d]
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 py-2.5">
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
                      aria-invalid={invalid.includes(d) || undefined}
                    />
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 pt-2 pb-5">
          {invalid.length > 0 && (
            <p className="mr-auto text-xs font-semibold text-(--clay)">
              Closing time must be after opening time.
            </p>
          )}
          <Btn
            variant="ghost"
            disabled={!dirty || save.saving}
            onClick={() => setHours(saved)}
          >
            Discard
          </Btn>
          <Btn
            icon={Save}
            disabled={!dirty || invalid.length > 0 || save.saving}
            onClick={() =>
              void save
                .settings({ business_hours: hours })
                .then((ok) => ok && toast('Business hours saved'))
            }
          >
            Save hours
          </Btn>
        </div>
      </Card>
      <ServiceAreasSection />
      <Card>
        <CardHeader
          title="Public request areas"
          subtitle="Listed on your public request page so customers know you cover them."
        />
        <div className="p-5">
          {areas.length === 0 ? (
            <p className="text-sm text-(--ink-3)">No service areas yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {areas.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1.5 rounded-full bg-(--lime-100) py-1.5 pr-1.5 pl-3 text-[13px] font-semibold text-(--leaf-900)"
                >
                  <MapPin className="size-3.5" /> {a}
                  <button
                    type="button"
                    aria-label={`Remove ${a}`}
                    disabled={save.saving}
                    className="cursor-pointer rounded-full p-0.5 hover:bg-white"
                    onClick={() =>
                      saveAreas(
                        areas.filter((x) => x !== a),
                        `${a} removed`,
                      )
                    }
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const v = area.trim()
              if (!v) return
              if (areas.some((x) => x.toLowerCase() === v.toLowerCase())) {
                toast(`${v} is already listed`, 'info')
              } else if (areas.length >= 50) {
                toast('You can list up to 50 service areas', 'info')
              } else {
                saveAreas([...areas, v], `${v} added`)
              }
              setArea('')
            }}
          >
            <TextInput
              value={area}
              maxLength={80}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Neighbourhood, city, or postal prefix (e.g. T3H)"
              aria-label="Add service area"
            />
            <Btn
              type="submit"
              variant="outline"
              icon={Plus}
              disabled={!area.trim() || save.saving}
            >
              Add
            </Btn>
          </form>
        </div>
      </Card>
    </div>
  )
}

function OnlineTab({ org }: { org: CompanyProfile }) {
  const save = useSave()
  return (
    <OnlineRequestsSettings
      orgName={org.name}
      slug={org.slug}
      brandColor={org.settings.brand_color}
      settings={org.settings.online_requests}
      pageUrl={portalUrl(org.slug)}
      embedUrl={portalUrl(org.slug, { embed: true })}
      saving={save.saving}
      onSave={(online_requests) => save.settings({ online_requests })}
    />
  )
}

function SubscriptionTab() {
  return (
    <div className="space-y-5">
      <Alert tone="info" title="Billing isn’t connected yet">
        Plans are listed for reference. Subscriptions, trials, and invoices will
        appear here once Stripe billing is set up for AbsoluteCRM.
      </Alert>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card
            key={p.id}
            className={cn(
              'flex flex-col p-6',
              p.highlight && 'border-(--leaf-600)',
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">{p.name}</p>
              {p.highlight && <Badge tone="lime">Most popular</Badge>}
            </div>
            <p className="mt-1 text-[13px] text-(--ink-3)">{p.blurb}</p>
            <p className="crm-display mt-4 text-4xl font-semibold">
              {p.monthly === null ? 'Custom' : `$${p.monthly}`}
              {p.monthly !== null && (
                <span className="ml-1 font-sans text-sm font-medium text-(--ink-3)">
                  / month
                </span>
              )}
            </p>
            <p className="text-xs text-(--ink-3)">
              {p.annual !== null && `$${p.annual}/mo billed yearly · `}
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
            <Btn className="mt-6" variant="outline" icon={CreditCard} disabled>
              Available soon
            </Btn>
          </Card>
        ))}
      </div>
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
  {
    label: 'Company settings and online requests',
    roles: ['owner', 'admin'],
  },
  { label: 'Subscription and billing', roles: ['owner'] },
]

const ROLES: Array<OrgRole> = ['owner', 'admin', 'dispatcher', 'worker']

function RolesTab() {
  const members = useTeamMembers()
  const people = members.data ?? []
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="overflow-hidden">
        <CardHeader
          title="What each role can do"
          subtitle="Enforced by the server and by row-level security in the database."
        />
        <div className="crm-scroll overflow-x-auto p-2">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-(--ink-3) uppercase">
                  Permission
                </th>
                {ROLES.map((r) => (
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
                  {ROLES.map((r) => (
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
          subtitle={
            members.isPending
              ? 'Loading…'
              : `${people.length} in this workspace`
          }
          action={
            <Link
              to="/teams"
              className="text-[13px] font-semibold text-(--leaf-700)"
            >
              Manage team →
            </Link>
          }
        />
        {members.isError ? (
          <p className="px-5 py-4 text-sm text-(--clay)">
            Couldn’t load team members.
          </p>
        ) : (
          <ul className="divide-y divide-(--line) px-5 pb-3">
            {people.map((m) => (
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
        )}
      </Card>
    </div>
  )
}

function SecurityTab({ org }: { org: CompanyProfile }) {
  const overview = useSettingsOverview()
  const stats: Array<[string, number | undefined]> = [
    ['Clients', overview.data?.clients],
    ['Requests', overview.data?.requests],
    ['Services', overview.data?.services],
    ['Team members', overview.data?.members],
  ]
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="size-4 text-(--leaf-600)" /> Workspace
          isolation
        </p>
        <p className="mt-2 text-[13px] text-(--ink-2)">
          Every record belongs to exactly one company. The server checks your
          membership on every request, and Postgres row-level security only
          returns rows whose <code>organization_id</code> is a workspace you
          belong to.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-(--cream) p-3">
            <dt className="text-xs font-semibold text-(--ink-3)">
              Workspace ID
            </dt>
            <dd className="mt-1 truncate font-mono text-[13px]" title={org.id}>
              {org.id}
            </dd>
          </div>
          <div className="rounded-2xl bg-(--cream) p-3">
            <dt className="text-xs font-semibold text-(--ink-3)">Slug</dt>
            <dd className="mt-1 truncate font-mono text-[13px]">{org.slug}</dd>
          </div>
          {stats.map(([label, n]) => (
            <div key={label} className="rounded-2xl bg-(--lime-100) p-3">
              <dt className="text-xs font-semibold text-(--ink-3)">{label}</dt>
              <dd className="crm-display mt-1 text-2xl font-semibold">
                {overview.isError ? '—' : (n?.toLocaleString() ?? '…')}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-(--ink-3)">
          <Lock className="size-3.5" /> Counts come straight from the database
          and include only this workspace.
        </p>
      </Card>
      <Card className="p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Database className="size-4 text-(--leaf-600)" /> Account security
        </p>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">
                Require two-factor sign-in
              </span>
              <span className="text-xs text-(--ink-3)">
                For owners and managers
              </span>
            </span>
            <Badge tone="gray">Coming soon</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">
                Export company data
              </span>
              <span className="text-xs text-(--ink-3)">
                Clients, jobs, and invoices as CSV
              </span>
            </span>
            <Btn variant="outline" size="sm" icon={Building2} disabled>
              Coming soon
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  )
}
