import { useState } from 'react'
import { ArrowRight, ExternalLink, Mail, MapPin, Phone } from 'lucide-react'

import { fmtDuration, fmtPhone, fmtTime, money } from '#/components/crm/format'
import { inSeason } from '#/integrations/services/types'
import { LogoMark } from '#/components/crm/Logo'
import RequestModal, { UNIT_LABEL } from '#/components/portal/RequestModal'
import { textOn } from '#/components/crm/colors'
import { seasonText } from '#/components/services/SeasonBar'
import { WEEKDAYS } from '#/integrations/settings/schema'
import { cn } from '#/lib/utils'
import type { Weekday } from '#/integrations/settings/schema'
import type { Portal, PortalService } from '#/server/trusted/portal'

const FREQ_LABEL: Record<string, string> = {
  one_time: 'One-time',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
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

const toSeasonal = (s: PortalService) => ({
  color: s.color,
  season:
    s.season_start_month !== null && s.season_end_month !== null
      ? { start: s.season_start_month, end: s.season_end_month }
      : null,
})

/** Square-cornered button styles for the public site. */
const btn = {
  base: 'inline-flex items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
  solid: 'h-11 hover:brightness-110',
  outline:
    'h-10 border border-(--ink)/15 bg-white text-(--ink) hover:border-(--ink)/40',
}

/** Day and HH:MM right now in the company's time zone. */
function nowIn(timeZone: string): { day: Weekday; time: string } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const day = get('weekday').toLowerCase().slice(0, 3) as Weekday
    if (!WEEKDAYS.includes(day)) return null
    return { day, time: `${get('hour')}:${get('minute')}` }
  } catch {
    return null
  }
}

function openStatus(portal: Portal) {
  const hours = portal.business_hours
  const now = nowIn(portal.timezone)
  if (!hours || !now) return null
  const today = hours[now.day]
  const open = !today.closed && now.time >= today.open && now.time < today.close
  return {
    open,
    today: now.day,
    text: open ? `Open now · until ${fmtTime(today.close)}` : 'Closed now',
  }
}

const LABEL = 'text-[11px] font-bold tracking-[0.16em] text-(--ink-3) uppercase'

function SectionTitle({
  children,
  id,
}: {
  children: React.ReactNode
  id?: string
}) {
  return (
    <h2 id={id} className={cn(LABEL, 'mb-5')}>
      {children}
    </h2>
  )
}

function ServiceRow({
  service: s,
  month,
  brand,
  onRequest,
}: {
  service: PortalService
  month: number
  brand: string
  onRequest: () => void
}) {
  const seasonal = toSeasonal(s)
  const available = inSeason(seasonal, month)
  const meta = [
    s.frequencies.map((f) => FREQ_LABEL[f]).join(' or '),
    s.default_duration_minutes ? fmtDuration(s.default_duration_minutes) : null,
    seasonal.season ? seasonText(seasonal) : 'Year-round',
  ].filter(Boolean)

  return (
    <li className="grid gap-4 border-t border-(--ink)/10 py-6 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-4">
        <span
          className="mt-1.5 h-10 w-1 shrink-0 rounded-sm"
          style={{ background: s.color }}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className="crm-display text-xl font-semibold text-(--ink)">
            {s.name}
            {!available && (
              <span className="ml-2 align-middle font-sans text-xs font-semibold text-(--sun)">
                Off-season now
              </span>
            )}
          </h3>
          {s.description && (
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-(--ink-2)">
              {s.description}
            </p>
          )}
          <p className="mt-2 text-xs text-(--ink-3)">{meta.join('  ·  ')}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-5 pl-5 sm:justify-end sm:pl-0">
        <div className="text-right">
          {s.default_price_cents === null ? (
            <p className="text-sm font-semibold text-(--ink)">Free estimate</p>
          ) : (
            <>
              <p className="text-xl font-semibold text-(--ink) tabular-nums">
                {s.default_price_cents ? money(s.default_price_cents) : 'Quote'}
              </p>
              <p className="text-xs text-(--ink-3)">
                {UNIT_LABEL[s.unit] ?? ''}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onRequest}
          aria-label={`Request ${s.name}`}
          className={cn(btn.base, btn.solid, 'cursor-pointer')}
          style={{ background: brand, color: textOn(brand) }}
        >
          Request <ArrowRight className="size-4" />
        </button>
      </div>
    </li>
  )
}

function Sidebar({ portal }: { portal: Portal }) {
  const { business_hours: hours, service_areas: areas } = portal
  const status = openStatus(portal)
  if (!hours && !(areas && areas.length > 0)) return null
  return (
    <aside className="flex flex-col gap-8 lg:sticky lg:top-24 lg:self-start">
      {hours && (
        <section
          aria-labelledby="hours-heading"
          className="border border-(--ink)/8 bg-white p-6"
        >
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="hours-heading" className={LABEL}>
              Hours
            </h2>
            {status && (
              <span
                className={cn(
                  'text-xs font-semibold',
                  status.open ? 'text-(--leaf-700)' : 'text-(--ink-3)',
                )}
              >
                {status.text}
              </span>
            )}
          </div>
          <dl className="divide-y divide-(--ink)/8 text-sm">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className={cn(
                  'flex justify-between gap-3 py-2',
                  status?.today === d && 'font-semibold text-(--ink)',
                )}
              >
                <dt className="text-(--ink-2)">{DAY_LABEL[d]}</dt>
                <dd className={cn(hours[d].closed && 'text-(--ink-3)')}>
                  {hours[d].closed
                    ? 'Closed'
                    : `${fmtTime(hours[d].open)} – ${fmtTime(hours[d].close)}`}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {areas && areas.length > 0 && (
        <section
          aria-labelledby="areas-heading"
          className="border border-(--ink)/8 bg-white p-6"
        >
          <h2 id="areas-heading" className={cn(LABEL, 'mb-3')}>
            Areas we serve
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-(--ink-2)">
            {areas.map((a) => (
              <li key={a} className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-(--ink-3)" /> {a}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

function Footer({ portal }: { portal: Portal }) {
  const { contact } = portal
  const hasContact =
    contact && (contact.phone || contact.email || contact.address)
  return (
    <footer
      className="border-t border-current/10"
      style={{
        background: portal.palette.secondary,
        color: textOn(portal.palette.secondary),
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-8 opacity-90 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <p className="crm-display text-xl font-semibold">
            {portal.organization_name}
          </p>
          {portal.accepting && (
            <p className="mt-1 text-sm">
              Request a service any time. We reply by email, usually within one
              business day.
            </p>
          )}
        </div>
        {hasContact && (
          <section aria-labelledby="contact-heading" className="text-sm">
            <h2
              id="contact-heading"
              className={cn(LABEL, 'mb-3 text-current opacity-60')}
            >
              Contact
            </h2>
            <ul className="space-y-2">
              {contact.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="size-4 opacity-60" />
                  <a
                    href={telHref(contact.phone)}
                    className="text-current underline-offset-4 hover:underline"
                  >
                    {fmtPhone(contact.phone)}
                  </a>
                </li>
              )}
              {contact.email && (
                <li className="flex items-center gap-2">
                  <Mail className="size-4 opacity-60" />
                  <a
                    href={`mailto:${contact.email}`}
                    className="break-all text-current underline-offset-4 hover:underline"
                  >
                    {contact.email}
                  </a>
                </li>
              )}
              {contact.address && (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 opacity-60" />
                  <span>{contact.address}</span>
                </li>
              )}
            </ul>
          </section>
        )}
      </div>
      <div className="border-t border-current/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs opacity-60">
          <span>
            © {new Date().getFullYear()} {portal.organization_name}
          </span>
          <span className="flex items-center gap-2">
            Powered by <LogoMark size={14} />
            <span className="font-semibold opacity-80">AbsoluteCRM</span>
          </span>
        </div>
      </div>
    </footer>
  )
}

/** The public request page for one company. `embed` renders the iframe version. */
export default function PortalView({
  orgSlug,
  portal,
  embed = false,
  month = new Date().getMonth() + 1,
}: {
  orgSlug: string
  portal: Portal
  embed?: boolean
  month?: number
}) {
  const [selected, setSelected] = useState<PortalService | null>(null)
  const { primary, secondary, accent } = portal.palette
  const brand = primary
  const fullPage = `/portal/${orgSlug}`
  const canRequest = portal.accepting && portal.services.length > 0

  if (embed && !portal.embed.enabled) {
    return (
      <div className="flex flex-col items-start gap-3 border border-(--ink)/10 bg-white p-6">
        <p className="font-semibold text-(--ink)">
          Request a service from {portal.organization_name}
        </p>
        <p className="text-sm text-(--ink-2)">
          Open the request page to see services and send a request.
        </p>
        <a
          href={fullPage}
          target="_blank"
          rel="noopener"
          className={cn(btn.base, btn.solid)}
          style={{ background: brand, color: textOn(brand) }}
        >
          Open request page <ExternalLink className="size-4" />
        </a>
      </div>
    )
  }

  const compact = embed && portal.embed.compact

  const services = !portal.accepting ? (
    <div className="border-l-2 border-(--sun) bg-white px-5 py-4">
      <p className="font-semibold text-(--ink)">Online requests are paused</p>
      <p className="mt-1 text-sm text-(--ink-2)">
        {portal.organization_name} isn’t taking requests online right now.
        Please call or email them instead.
      </p>
    </div>
  ) : portal.services.length === 0 ? (
    <div className="border-l-2 border-(--ink)/20 bg-white px-5 py-4">
      <p className="font-semibold text-(--ink)">No services listed yet</p>
      <p className="mt-1 text-sm text-(--ink-2)">
        This business hasn’t published any services. Please check back soon.
      </p>
    </div>
  ) : (
    <ul>
      {portal.services.map((s) => (
        <ServiceRow
          key={s.id}
          service={s}
          month={month}
          brand={brand}
          onRequest={() => setSelected(s)}
        />
      ))}
    </ul>
  )

  const modal = portal.accepting && (
    <RequestModal
      orgSlug={orgSlug}
      orgName={portal.organization_name}
      service={selected}
      onClose={() => setSelected(null)}
    />
  )

  if (embed) {
    return (
      <div className="bg-white px-5 py-6 text-(--ink)">
        {!compact && (
          <div className="mb-6 border-b border-(--ink)/10 pb-5">
            <p className="text-xl font-semibold">{portal.organization_name}</p>
            {portal.tagline && (
              <p className="mt-1 text-sm text-(--ink-2)">{portal.tagline}</p>
            )}
          </div>
        )}
        <section id="services" aria-label="Services">
          {services}
        </section>
        {modal}
      </div>
    )
  }

  const areas = portal.service_areas ?? []
  const phone = portal.contact?.phone
  const onPrimary = textOn(primary)
  const onSecondary = textOn(secondary)
  const scrollToServices = () =>
    document
      .getElementById('services')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="min-h-svh bg-[#f7f6f2] text-(--ink)">
      {/* Top bar */}
      <header
        className="sticky top-0 z-30"
        style={{ background: primary, color: onPrimary }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
            {portal.logo_url ? (
              <img
                src={portal.logo_url}
                alt={`${portal.organization_name} logo`}
                className="size-full object-contain"
              />
            ) : (
              <span
                className="crm-display text-base font-semibold"
                style={{ color: onPrimary === '#ffffff' ? primary : undefined }}
              >
                {portal.organization_name.charAt(0)}
              </span>
            )}
          </span>
          <p className="crm-display min-w-0 truncate text-lg font-semibold">
            {portal.organization_name}
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-4">
            {phone && (
              <a
                href={telHref(phone)}
                aria-label={`Call ${fmtPhone(phone)}`}
                className="flex items-center gap-2 text-sm font-medium text-current no-underline opacity-80 hover:opacity-100"
              >
                <Phone className="size-4" />
                <span className="hidden md:inline">{fmtPhone(phone)}</span>
              </a>
            )}
            {canRequest && (
              <button
                type="button"
                onClick={scrollToServices}
                aria-label="Request an estimate"
                className={cn(
                  btn.base,
                  'h-10 cursor-pointer whitespace-nowrap hover:brightness-105',
                )}
                style={{ background: accent, color: textOn(accent) }}
              >
                <span className="hidden sm:inline">Request an estimate</span>
                <span className="sm:hidden">Estimate</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Intro */}
      <section style={{ background: secondary, color: onSecondary }}>
        <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <h1
            className="crm-display max-w-3xl text-3xl leading-tight font-semibold sm:text-[2.6rem]"
            style={{ color: onSecondary === '#ffffff' ? onSecondary : primary }}
          >
            {portal.tagline ??
              (portal.accepting ? 'Request a service online' : 'Get in touch')}
          </h1>
          <p className="mt-3 max-w-2xl opacity-80">
            {canRequest
              ? 'Pick a service below and send a request. No account needed. We reply with an estimate, usually within one business day.'
              : 'Call or email us about your project.'}
          </p>
          {areas.length > 0 && (
            <p className="mt-5 flex items-center gap-1.5 text-sm opacity-80">
              <MapPin className="size-4" /> Serving{' '}
              {areas.slice(0, 3).join(', ')}
              {areas.length > 3 && ' and more'}
            </p>
          )}
        </div>
      </section>

      {/* Body with sidebar */}
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-14">
          {(portal.mission || portal.about) && (
            <section aria-labelledby="about-heading">
              <SectionTitle id="about-heading">About us</SectionTitle>
              {portal.mission && (
                <blockquote
                  className="crm-display border-l-[3px] pl-5 text-2xl leading-snug font-medium whitespace-pre-line text-(--ink)"
                  style={{ borderColor: accent }}
                >
                  <span className="sr-only">Our mission: </span>
                  {portal.mission}
                </blockquote>
              )}
              {portal.about && (
                <p
                  className={cn(
                    'max-w-2xl leading-relaxed whitespace-pre-line text-(--ink-2)',
                    portal.mission && 'mt-6',
                  )}
                >
                  {portal.about}
                </p>
              )}
            </section>
          )}

          <section
            id="services"
            aria-labelledby="services-heading"
            className="scroll-mt-24"
          >
            <SectionTitle id="services-heading">Services</SectionTitle>
            {services}
          </section>
        </main>

        <Sidebar portal={portal} />
      </div>

      <Footer portal={portal} />
      {modal}
    </div>
  )
}
