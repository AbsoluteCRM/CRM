import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck,
  Check,
  Clock,
  Inbox,
  Loader2,
  MapPin,
  Plus,
  Settings,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react'

import { useAuth } from '#/integrations/auth/context'
import {
  Btn,
  btnClass,
  CheckPill,
  Field,
  TextInput,
  Toggle,
} from '#/components/crm/ui'
import { DEFAULT_HOURS, DEFAULT_SERVICES, actions } from '#/mocks/crm-store'
import { fmtDuration, money } from '#/components/crm/format'
import { cn } from '#/lib/utils'
import type { DayHours, Weekday } from '#/mocks/crm-types'
import type { LucideIcon } from 'lucide-react'
import { useOrganization } from '#/integrations/organization/context'
import { createSupabaseBrowserClient } from '#/lib/supabase/client'

export const Route = createFileRoute('/_authed/onboarding')({
  component: OnboardingPage,
})

const STEPS: Array<{ title: string; icon: LucideIcon; blurb: string }> = [
  { title: 'Company', icon: Building2, blurb: 'What’s your business called?' },
  { title: 'Address', icon: MapPin, blurb: 'Where your yard or office is.' },
  { title: 'Service area', icon: MapPin, blurb: 'Where you take on work.' },
  {
    title: 'Team size',
    icon: Users,
    blurb: 'How many people work in the field?',
  },
  {
    title: 'Services',
    icon: Wrench,
    blurb: 'What you offer. You can edit pricing later.',
  },
  {
    title: 'Business hours',
    icon: Clock,
    blurb: 'When crews can be scheduled.',
  },
]

const TEAM_SIZES = [
  { value: '1', label: 'Just me', sub: 'Owner-operator' },
  { value: '2-5', label: '2–5', sub: 'One crew' },
  { value: '6-10', label: '6–10', sub: '2–3 crews' },
  { value: '11-25', label: '11–25', sub: 'Several crews' },
  { value: '26+', label: '26+', sub: 'Multiple branches' },
]

const DAY_LABEL: Array<[Weekday, string]> = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
]

function OnboardingPage() {
  const { user } = useAuth()
  const { reloadAndSelectOrganization } = useOrganization()
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdOrganizationId, setCreatedOrganizationId] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [addr, setAddr] = useState({
    street: '',
    city: '',
    region: 'AB',
    postal: '',
  })
  const [areas, setAreas] = useState<Array<string>>([])
  const [areaInput, setAreaInput] = useState('')
  const [teamSize, setTeamSize] = useState('2-5')
  const [services, setServices] = useState<Array<string>>(
    DEFAULT_SERVICES.map((s) => s.name),
  )
  const [hours, setHours] = useState<Record<Weekday, DayHours>>(DEFAULT_HOURS)
  const [phase, setPhase] = useState<'form' | 'creating' | 'done'>('form')

  const canNext = [
    name.trim().length > 1,
    addr.street.trim() && addr.city.trim(),
    areas.length > 0,
    !!teamSize,
    services.length > 0,
    Object.values(hours).some((h) => !h.closed),
  ][step]

  const addArea = (v: string) => {
    const a = v.trim()
    if (a && !areas.includes(a)) setAreas((x) => [...x, a])
    setAreaInput('')
  }

  const create = async () => {
    if (!user || phase !== 'form') return

    setCreateError(null)
    setPhase('creating')

    let organizationId = createdOrganizationId

    try {
      if (!organizationId) {
        const supabase = createSupabaseBrowserClient()
        const slugBase = name
          .trim()
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')

        const slug = `${slugBase || 'organization'}-${crypto.randomUUID().slice(0, 8)}`
        const { data, error } = await supabase.rpc('create_organization', {
          p_name: name.trim(),
          p_slug: slug,
          p_timezone: 'America/Edmonton',
          p_currency: 'CAD',
          p_country: 'CA',
        })

        if (error) throw error
        if (!data?.id) throw new Error('Organization creation returned no ID.')
        organizationId = data.id
        setCreatedOrganizationId(organizationId)
      }

      await reloadAndSelectOrganization(organizationId)

      // Other onboarding details still use the local demo store.
      // They are not yet persisted to the hosted Supabase database.
      actions.createOrganization({
        name: name.trim(),
        address_line1: addr.street,
        city: addr.city,
        region: addr.region,
        postal_code: addr.postal,
        serviceAreas: areas,
        teamSize,
        serviceNames: services,
        businessHours: hours,
        ownerName:
          user.user_metadata.full_name ?? user.email?.split('@')[0] ?? 'Owner',
        ownerEmail: user.email ?? '',
      })

      setPhase('done')
    } catch (error) {
      setCreateError(
        organizationId
          ? 'The organization was created, but setup could not finish. Retry to continue without creating a duplicate. Details: ' +
              (error instanceof Error ? error.message : 'Unknown error')
          : error instanceof Error
            ? error.message
            : 'Failed to create organization.',
      )
      setPhase('form')
    }
  }

  return (
    <div className="crm-scroll h-screen min-w-0 flex-1 overflow-y-auto bg-(--cream) pt-16 text-(--ink)">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1200px] gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:py-10">
        {/* Progress rail */}
        <aside className="relative overflow-hidden rounded-[28px] bg-(--leaf-900) p-7 text-(--cream)">
          <div
            className="crm-leaf-pattern pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
          />
          <div className="relative">
            <p className="text-[11px] font-bold tracking-[0.16em] text-(--lime) uppercase">
              Set up your workspace
            </p>
            <h1 className="crm-display mt-2 text-3xl leading-tight font-semibold">
              Let’s get your landscaping company growing.
            </h1>
            <p className="mt-2 text-sm text-(--cream)/65">
              About two minutes. You can change everything later in Settings.
            </p>
            <ol className="mt-8 space-y-1">
              {STEPS.map((s, i) => {
                const done = i < step || phase !== 'form'
                const current = i === step && phase === 'form'
                return (
                  <li
                    key={s.title}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl px-3 py-2.5',
                      current && 'bg-white/10',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        done
                          ? 'bg-(--lime) text-(--leaf-950)'
                          : current
                            ? 'bg-(--cream) text-(--leaf-900)'
                            : 'bg-white/10 text-(--cream)/60',
                      )}
                    >
                      {done ? <Check className="size-4" /> : i + 1}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        !done && !current && 'text-(--cream)/60',
                      )}
                    >
                      {s.title}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
          <svg
            viewBox="0 0 320 120"
            className="pointer-events-none absolute right-0 bottom-0 left-0 w-full opacity-90"
            aria-hidden
          >
            <path d="M0 80 Q80 50 160 70 T320 60 V120 H0Z" fill="#18402a" />
            <path d="M0 98 Q90 78 180 94 T320 88 V120 H0Z" fill="#235a3c" />
            <circle cx="60" cy="72" r="16" fill="#2f7350" />
            <rect x="58" y="84" width="4" height="12" fill="#0a1d12" />
            <circle cx="250" cy="66" r="22" fill="#2f7350" />
            <rect x="248" y="84" width="5" height="14" fill="#0a1d12" />
            <circle cx="282" cy="78" r="12" fill="#4a9467" />
          </svg>
        </aside>

        {/* Step content */}
        <section className="flex flex-col rounded-[28px] border border-(--line) bg-(--paper) p-6 shadow-[0_10px_30px_-18px_rgba(17,48,31,0.25)] sm:p-10">
          {phase === 'form' ? (
            <>
              <p className="text-xs font-bold tracking-[0.16em] text-(--leaf-600) uppercase">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 className="crm-display mt-2 text-3xl font-semibold">
                {STEPS[step].blurb}
              </h2>
              <div key={step} className="crm-rise mt-8 flex-1">
                {step === 0 && (
                  <Field
                    label="Company name"
                    hint="This is how customers and your team will see you."
                  >
                    <TextInput
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Evergreen Lawn & Landscape"
                      autoFocus
                      className="h-12 text-base"
                    />
                  </Field>
                )}
                {step === 1 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Street address" className="sm:col-span-2">
                      <TextInput
                        value={addr.street}
                        onChange={(e) =>
                          setAddr((a) => ({ ...a, street: e.target.value }))
                        }
                        placeholder="2150 Industrial Way SE"
                        autoFocus
                      />
                    </Field>
                    <Field label="City">
                      <TextInput
                        value={addr.city}
                        onChange={(e) =>
                          setAddr((a) => ({ ...a, city: e.target.value }))
                        }
                        placeholder="Calgary"
                      />
                    </Field>
                    <Field label="Province / state">
                      <TextInput
                        value={addr.region}
                        onChange={(e) =>
                          setAddr((a) => ({ ...a, region: e.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Postal code">
                      <TextInput
                        value={addr.postal}
                        onChange={(e) =>
                          setAddr((a) => ({ ...a, postal: e.target.value }))
                        }
                      />
                    </Field>
                  </div>
                )}
                {step === 2 && (
                  <div>
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        addArea(areaInput)
                      }}
                    >
                      <TextInput
                        value={areaInput}
                        onChange={(e) => setAreaInput(e.target.value)}
                        placeholder="City, neighbourhood, or postal prefix"
                        autoFocus
                        aria-label="Service area"
                      />
                      <Btn
                        type="submit"
                        variant="outline"
                        icon={Plus}
                        disabled={!areaInput.trim()}
                      >
                        Add
                      </Btn>
                    </form>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {areas.map((a) => (
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
                              setAreas((x) => x.filter((y) => y !== a))
                            }
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    {addr.city && !areas.includes(addr.city) && (
                      <p className="mt-4 text-[13px] text-(--ink-3)">
                        Suggestion:{' '}
                        <button
                          type="button"
                          className="cursor-pointer font-semibold text-(--leaf-700)"
                          onClick={() => addArea(addr.city)}
                        >
                          + {addr.city}
                        </button>
                      </p>
                    )}
                  </div>
                )}
                {step === 3 && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {TEAM_SIZES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setTeamSize(s.value)}
                        className={cn(
                          'cursor-pointer rounded-2xl border p-5 text-left transition-colors',
                          teamSize === s.value
                            ? 'border-(--leaf-700) bg-(--lime-100) ring-2 ring-(--lime)'
                            : 'border-(--line-2) hover:border-(--leaf-500)',
                        )}
                      >
                        <p className="crm-display text-3xl font-semibold">
                          {s.label}
                        </p>
                        <p className="mt-1 text-sm text-(--ink-3)">{s.sub}</p>
                      </button>
                    ))}
                  </div>
                )}
                {step === 4 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DEFAULT_SERVICES.map((s) => (
                      <CheckPill
                        key={s.name}
                        checked={services.includes(s.name)}
                        onChange={(v) =>
                          setServices((x) =>
                            v ? [...x, s.name] : x.filter((y) => y !== s.name),
                          )
                        }
                      >
                        <span className="flex flex-1 items-center justify-between gap-3">
                          <span>{s.name}</span>
                          <span className="text-xs font-medium text-(--ink-3)">
                            {money(s.default_price_cents)} ·{' '}
                            {fmtDuration(s.default_duration_minutes)}
                          </span>
                        </span>
                      </CheckPill>
                    ))}
                  </div>
                )}
                {step === 5 && (
                  <div className="divide-y divide-(--line) rounded-2xl border border-(--line)">
                    {DAY_LABEL.map(([d, label]) => (
                      <div
                        key={d}
                        className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                      >
                        <span className="w-12 text-sm font-bold">{label}</span>
                        <Toggle
                          checked={!hours[d].closed}
                          label={`Open ${label}`}
                          onChange={(v) =>
                            setHours((h) => ({
                              ...h,
                              [d]: { ...h[d], closed: !v },
                            }))
                          }
                        />
                        {hours[d].closed ? (
                          <span className="text-sm text-(--ink-3)">Closed</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <TextInput
                              type="time"
                              value={hours[d].open}
                              onChange={(e) =>
                                setHours((h) => ({
                                  ...h,
                                  [d]: { ...h[d], open: e.target.value },
                                }))
                              }
                              className="h-9 w-32"
                              aria-label={`${label} opens`}
                            />
                            <span className="text-(--ink-3)">–</span>
                            <TextInput
                              type="time"
                              value={hours[d].close}
                              onChange={(e) =>
                                setHours((h) => ({
                                  ...h,
                                  [d]: { ...h[d], close: e.target.value },
                                }))
                              }
                              className="h-9 w-32"
                              aria-label={`${label} closes`}
                            />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {createError && (
                <p role="alert" className="mt-4 text-sm text-red-600">
                  {createError}
                </p>
              )}
              <div className="mt-10 flex items-center justify-between gap-3 border-t border-(--line) pt-6">
                <Btn
                  variant="ghost"
                  icon={ArrowLeft}
                  disabled={step === 0}
                  onClick={() => setStep((s) => s - 1)}
                >
                  Back
                </Btn>
                {step < STEPS.length - 1 ? (
                  <Btn
                    size="lg"
                    iconRight={ArrowRight}
                    disabled={!canNext}
                    onClick={() => setStep((s) => s + 1)}
                  >
                    Continue
                  </Btn>
                ) : (
                  <Btn
                    size="lg"
                    variant="accent"
                    icon={Sparkles}
                    disabled={!canNext}
                    onClick={create}
                  >
                    Create my workspace
                  </Btn>
                )}
              </div>
            </>
          ) : (
            <Creating
              name={name}
              serviceCount={services.length}
              done={phase === 'done'}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function Creating({
  name,
  serviceCount,
  done,
}: {
  name: string
  serviceCount: number
  done: boolean
}) {
  const items = [
    `Company workspace for ${name}`,
    'Admin account (you, as Owner)',
    `${serviceCount} default services`,
    'CRM records: clients, jobs, crews, invoices',
  ]
  const shown = done ? items.length : 0

  const next: Array<{
    icon: LucideIcon
    title: string
    body: string
    to: '/settings' | '/teams' | '/requests' | '/calendar'
  }> = [
    {
      icon: Settings,
      title: 'Build your company profile',
      body: 'Logo, contact details, and hours.',
      to: '/settings',
    },
    {
      icon: UserPlus,
      title: 'Invite team members',
      body: 'Add managers and crew members.',
      to: '/teams',
    },
    {
      icon: Inbox,
      title: 'Accept customer requests',
      body: 'Review, quote, and approve.',
      to: '/requests',
    },
    {
      icon: CalendarCheck,
      title: 'Schedule and dispatch jobs',
      body: 'Drag jobs onto crews.',
      to: '/calendar',
    },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <p className="text-xs font-bold tracking-[0.16em] text-(--leaf-600) uppercase">
        {done ? 'All set' : 'Setting things up'}
      </p>
      <h2 className="crm-display mt-2 text-3xl font-semibold">
        {done ? `Welcome to ${name}!` : 'Creating your workspace…'}
      </h2>
      <ul className="mt-8 space-y-3">
        {items.map((it, i) => (
          <li
            key={it}
            className={cn(
              'flex items-center gap-3 text-[15px] transition-opacity',
              i < shown
                ? 'opacity-100'
                : i === shown
                  ? 'opacity-100'
                  : 'opacity-40',
            )}
          >
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-full',
                i < shown
                  ? 'bg-(--lime) text-(--leaf-950)'
                  : 'bg-(--sage) text-(--ink-3)',
              )}
            >
              {i < shown ? (
                <Check className="size-4" />
              ) : i === shown ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
            </span>
            {it}
          </li>
        ))}
      </ul>
      {done && (
        <div className="crm-rise mt-10">
          <p className="mb-3 text-sm font-bold">Your next steps</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {next.map((n, i) => (
              <Link
                key={n.to}
                to={n.to}
                className="group flex items-start gap-3 rounded-2xl border border-(--line) p-4 text-(--ink) no-underline hover:border-(--leaf-500) hover:bg-(--lime-100)"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--leaf-900) text-(--lime)">
                  <n.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold">
                    {i + 1}. {n.title}
                  </span>
                  <span className="block text-xs text-(--ink-3)">{n.body}</span>
                </span>
              </Link>
            ))}
          </div>
          <Link to="/dashboard" className={btnClass('primary', 'lg', 'mt-8')}>
            Go to dashboard <ArrowRight className="size-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
