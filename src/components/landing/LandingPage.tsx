import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudRain,
  Mail,
  MapPinned,
  Menu,
  Quote,
  Repeat,
  Route as RouteIcon,
  Smartphone,
  Users,
  X,
} from 'lucide-react'

import { Logo } from '#/components/crm/Logo'
import { PLANS } from '#/components/crm/plans'
import { cn } from '#/lib/utils'
import type { LucideIcon } from 'lucide-react'

/**
 * Public marketing page. Rendered by `src/routes/index.tsx`.
 * Visual direction: LeafLife garden template (deep forest green, lime accent,
 * cream surfaces, big rounded panels, pill buttons with arrow chips).
 */

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: RouteIcon,
    title: 'Route optimization',
    body: 'Order every crew’s stops by drive time, with ETAs your office and customers can trust.',
  },
  {
    icon: CalendarDays,
    title: 'Crew scheduling',
    body: 'Drag jobs between days and crews. Double-bookings and time off are flagged before they cost you.',
  },
  {
    icon: Users,
    title: 'Customer management',
    body: 'Every property, gate code, pet, note, invoice, and visit in one profile.',
  },
  {
    icon: Repeat,
    title: 'Recurring services',
    body: 'Weekly mowing, monthly fertilization, seasonal snow removal. Set it once and it fills the calendar.',
  },
  {
    icon: CheckCircle2,
    title: 'Job tracking',
    body: 'Crews start, finish, and upload before and after photos from the field. Invoices go out automatically.',
  },
  {
    icon: MapPinned,
    title: 'Client portal',
    body: 'Customers request work, approve quotes, and see their service history without calling the office.',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Create your company',
    body: 'Name, service area, hours, and team size. Your own private workspace in minutes.',
  },
  {
    n: '02',
    title: 'Set up services',
    body: 'Start from our landscaping catalog: mowing, cleanups, snow removal. Adjust pricing.',
  },
  {
    n: '03',
    title: 'Invite your crews',
    body: 'Add managers and crew members, build crews, assign trucks.',
  },
  {
    n: '04',
    title: 'Schedule & get paid',
    body: 'Turn requests into quotes and jobs, dispatch crews, and invoice on completion.',
  },
]

// Placeholder testimonials for the template. Replace with real customer quotes before launch.
const TESTIMONIALS = [
  {
    quote:
      'We used to run four crews off a whiteboard and a group chat. Now the schedule, routes, and invoices all live in one place, and rain days take five minutes to replan.',
    name: 'Owner, residential lawn care company',
    meta: '4 crews · Alberta',
  },
  {
    quote:
      'Snow season is where it shines. We see who’s available, push the plow routes out the night before, and every completed visit is billed.',
    name: 'Operations manager, grounds & snow contractor',
    meta: '12 staff · Saskatchewan',
  },
  {
    quote:
      'Our crew leads actually use it. Before and after photos go straight to the client file, so disputes basically disappeared.',
    name: 'Founder, design-build landscaping firm',
    meta: '20+ staff · British Columbia',
  },
]

const FAQ = [
  {
    q: 'How many employees can I add?',
    a: 'Starter includes up to 5 users, Professional up to 25, and Enterprise is unlimited. Crew members who only view and complete their own jobs count as users.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Plans are month-to-month unless you choose annual billing. Cancel from Settings and you can export all of your data first.',
  },
  {
    q: 'Is there mobile support?',
    a: 'Yes. The app works on any phone or tablet browser, so crews can see their route, start and complete jobs, and upload photos from the field.',
  },
  {
    q: 'Is my company’s data kept separate?',
    a: 'Every company gets its own isolated workspace. Your customers, jobs, and pricing are never visible to another company.',
  },
  {
    q: 'Can I import my existing customers?',
    a: 'Yes. Upload a spreadsheet of clients and properties during setup, or our team can help you migrate on Professional and Enterprise.',
  },
]

function ArrowChip({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        'flex size-8 items-center justify-center rounded-full transition-transform group-hover:rotate-45',
        dark
          ? 'bg-(--leaf-900) text-(--lime)'
          : 'bg-(--lime) text-(--leaf-950)',
      )}
    >
      <ArrowUpRight className="size-4" />
    </span>
  )
}

function HeroIllustration() {
  return (
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-[36px]">
      <svg
        viewBox="0 0 500 400"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="hero-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#e1f7ae" />
            <stop offset="1" stopColor="#f4f2ea" />
          </linearGradient>
        </defs>
        <rect
          x="0"
          y="0"
          width="500"
          height="400"
          rx="36"
          fill="url(#hero-sky)"
        />
        <circle cx="400" cy="90" r="38" fill="#fffdf8" opacity="0.9" />
        <path d="M0 250 Q120 190 250 230 T500 210 V400 H0Z" fill="#9cc8a8" />
        <path d="M0 290 Q140 240 270 280 T500 268 V400 H0Z" fill="#4a9467" />
        <path d="M0 330 Q160 300 300 330 T500 320 V400 H0Z" fill="#235a3c" />
        {/* mowed stripes */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path
            key={i}
            d={`M${i * 90 - 40} 400 L${i * 90 + 30} 330 L${i * 90 + 75} 330 L${i * 90 + 5} 400Z`}
            fill="#18402a"
            opacity="0.35"
          />
        ))}
        {/* trees */}
        <g>
          <rect x="86" y="210" width="8" height="46" rx="3" fill="#18402a" />
          <circle cx="90" cy="196" r="34" fill="#2f7350" />
          <circle cx="72" cy="214" r="20" fill="#235a3c" />
        </g>
        <g>
          <rect x="406" y="190" width="8" height="54" rx="3" fill="#18402a" />
          <path d="M410 110 L450 200 L370 200Z" fill="#235a3c" />
          <path d="M410 140 L456 222 L364 222Z" fill="#2f7350" />
        </g>
        {/* hedge row */}
        {[180, 214, 248, 282].map((x) => (
          <circle key={x} cx={x} cy="262" r="20" fill="#2f7350" />
        ))}
      </svg>

      {/* floating UI cards */}
      <div className="absolute top-[9%] left-[5%] w-[52%] rounded-2xl bg-(--paper) p-3 shadow-xl sm:p-4">
        <p className="text-[10px] font-bold tracking-wider text-(--ink-3) uppercase sm:text-[11px]">
          Today · Crew A
        </p>
        {[
          ['8:00', 'Bennett · Mowing', '#7fb547', true],
          ['9:30', 'Maple Ridge HOA', '#5b9bc4', true],
          ['12:15', 'Chen · Fall Cleanup', '#e0a03c', false],
        ].map(([time, label, color, done]) => (
          <div
            key={label as string}
            className="mt-2 flex items-center gap-2 rounded-xl px-2 py-1.5"
            style={{ background: `color-mix(in oklab, ${color} 16%, white)` }}
          >
            <span
              className="h-6 w-1 rounded-full"
              style={{ background: color as string }}
            />
            <span className="text-[10px] font-semibold text-(--ink-3) sm:text-[11px]">
              {time}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-(--ink) sm:text-xs">
              {label}
            </span>
            {done ? <Check className="size-3.5 text-(--leaf-600)" /> : null}
          </div>
        ))}
      </div>
      <div className="absolute right-[5%] bottom-[30%] rounded-2xl bg-(--leaf-900) px-4 py-3 text-(--cream) shadow-xl">
        <p className="text-[10px] font-bold tracking-wider text-(--lime) uppercase">
          This month
        </p>
        <p className="crm-display text-2xl font-semibold sm:text-3xl">
          $48,920
        </p>
        <p className="text-[11px] text-(--cream)/60">212 jobs completed</p>
      </div>
      <div className="absolute top-[12%] right-[6%] flex items-center gap-2 rounded-full bg-(--paper) py-1.5 pr-3 pl-1.5 shadow-lg">
        <span className="flex size-7 items-center justify-center rounded-full bg-(--sky-100) text-(--sky)">
          <CloudRain className="size-4" />
        </span>
        <span className="text-[11px] font-semibold text-(--ink)">
          Rain Thu · 6 jobs moved
        </span>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [annual, setAnnual] = useState(true)
  const [open, setOpen] = useState<number | null>(0)
  const [menu, setMenu] = useState(false)
  const [demo, setDemo] = useState({
    name: '',
    email: '',
    company: '',
    crews: '1-2',
  })
  const [demoSent, setDemoSent] = useState(false)

  const nav = [
    ['Features', '#features'],
    ['How it works', '#how'],
    ['Pricing', '#pricing'],
    ['Reviews', '#reviews'],
    ['FAQ', '#faq'],
  ]

  return (
    <div className="min-h-screen bg-(--cream) text-(--ink)">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-(--line)/70 bg-(--cream)/85 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-[1240px] items-center gap-2 px-4 py-4 sm:gap-3 sm:px-8 lg:gap-6">
          {/* Small screens: menu button first, then the logo. */}
          <button
            type="button"
            className="-ml-1.5 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-(--paper) lg:hidden"
            aria-label={menu ? 'Close menu' : 'Open menu'}
            aria-expanded={menu}
            aria-controls="landing-menu"
            onClick={() => setMenu((m) => !m)}
          >
            {menu ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <Link
            to="/"
            className="shrink-0 no-underline"
            aria-label="AbsoluteCRM home"
          >
            <Logo className="min-[360px]:hidden" compact size="sm" />
            <Logo
              className="hidden min-[360px]:inline-flex sm:hidden"
              size="sm"
            />
            <Logo className="hidden sm:inline-flex" />
          </Link>
          <nav
            className="mx-auto hidden items-center gap-1 lg:flex"
            aria-label="Primary"
          >
            {nav.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-full px-4 py-2 text-sm font-semibold text-(--ink-2) no-underline hover:bg-(--paper) hover:text-(--ink)"
              >
                {label}
              </a>
            ))}
          </nav>
          {/* Always top right, at every size. */}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-0">
            <Link
              to="/sign-in"
              className="rounded-full px-2.5 py-2 text-sm font-semibold whitespace-nowrap text-(--ink) no-underline hover:bg-(--paper) sm:px-4"
            >
              Sign in
            </Link>
            <Link
              to="/sign-up"
              className="group inline-flex h-10 items-center gap-2 rounded-full bg-(--leaf-900) px-4 text-sm font-semibold whitespace-nowrap text-(--cream) no-underline hover:bg-(--leaf-800) sm:h-11 sm:py-1.5 sm:pr-1.5 sm:pl-5"
            >
              <span>
                <span className="hidden sm:inline">Start </span>
                <span className="sm:hidden">Free trial</span>
                <span className="hidden sm:inline">free trial</span>
              </span>
              <span className="hidden sm:flex">
                <ArrowChip />
              </span>
            </Link>
          </div>
        </div>
        {menu && (
          <nav
            id="landing-menu"
            aria-label="Primary"
            className="border-t border-(--line) px-4 pb-4 lg:hidden"
          >
            {nav.map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenu(false)}
                className="block rounded-xl px-3 py-3 font-semibold text-(--ink) no-underline hover:bg-(--paper)"
              >
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[1240px] px-5 pt-8 sm:px-8 sm:pt-12">
          <div className="relative overflow-hidden rounded-[36px] bg-(--leaf-900) px-6 py-12 text-(--cream) sm:px-12 sm:py-16 lg:py-20">
            <div
              className="crm-leaf-pattern pointer-events-none absolute inset-0 opacity-50"
              aria-hidden
            />
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
              <div className="crm-rise">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-(--lime)">
                  <span className="size-1.5 rounded-full bg-(--lime)" /> CRM
                  built for landscaping companies
                </span>
                <h1 className="crm-display mt-6 text-[44px] leading-[1.02] font-semibold sm:text-[64px] lg:text-[72px]">
                  Grow your landscaping business,{' '}
                  <span className="text-(--lime) italic">
                    not your paperwork.
                  </span>
                </h1>
                <p className="mt-6 max-w-xl text-base text-(--cream)/75 sm:text-lg">
                  Requests, quotes, crew scheduling, routes, and invoices in one
                  place, so you spend less time in the office and more time on
                  the lawn.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    to="/sign-up"
                    className="group inline-flex items-center gap-3 rounded-full bg-(--lime) py-2 pr-2 pl-6 text-[15px] font-bold text-(--leaf-950) no-underline hover:bg-(--lime-400)"
                  >
                    Start free trial <ArrowChip dark />
                  </Link>
                  <a
                    href="#demo"
                    className="group inline-flex items-center gap-3 rounded-full border border-white/25 py-2 pr-2 pl-6 text-[15px] font-bold text-(--cream) no-underline hover:bg-white/10"
                  >
                    Book a demo <ArrowChip />
                  </a>
                </div>
                <p className="mt-5 text-[13px] text-(--cream)/55">
                  14-day free trial · No credit card required · Cancel anytime
                </p>
              </div>
              <HeroIllustration />
            </div>
          </div>
        </section>

        {/* Trades strip */}
        <section className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8">
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-semibold text-(--ink-2)">
            <span className="mr-2 text-(--ink-3)">Built for</span>
            {[
              'Lawn care',
              'Snow removal',
              'Landscape design',
              'Hardscaping',
              'Tree care',
              'Irrigation',
              'Commercial grounds',
            ].map((x) => (
              <span
                key={x}
                className="rounded-full border border-(--line-2) bg-(--paper) px-4 py-2"
              >
                {x}
              </span>
            ))}
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="mx-auto max-w-[1240px] scroll-mt-24 px-5 py-12 sm:px-8 sm:py-16"
        >
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.16em] text-(--leaf-600) uppercase">
                Features
              </p>
              <h2 className="crm-display mt-3 text-4xl leading-tight font-semibold sm:text-5xl">
                Everything your crews and office need, nothing they don’t.
              </h2>
            </div>
            <p className="max-w-sm text-(--ink-2)">
              Designed around how landscaping actually runs: seasons, weather,
              recurring routes, and crews in the field.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <article
                key={f.title}
                className={cn(
                  'group rounded-[28px] border p-7 transition-transform hover:-translate-y-1',
                  i === 0
                    ? 'border-transparent bg-(--leaf-900) text-(--cream)'
                    : 'border-(--line) bg-(--paper)',
                )}
              >
                <span
                  className={cn(
                    'flex size-12 items-center justify-center rounded-2xl',
                    i === 0
                      ? 'bg-(--lime) text-(--leaf-950)'
                      : 'bg-(--lime-100) text-(--leaf-700)',
                  )}
                >
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-6 text-xl font-bold">{f.title}</h3>
                <p
                  className={cn(
                    'mt-2 text-[15px]',
                    i === 0 ? 'text-(--cream)/70' : 'text-(--ink-2)',
                  )}
                >
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-24 bg-(--sage) py-16 sm:py-20">
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
            <p className="text-xs font-bold tracking-[0.16em] text-(--leaf-600) uppercase">
              How it works
            </p>
            <h2 className="crm-display mt-3 max-w-2xl text-4xl leading-tight font-semibold sm:text-5xl">
              From sign-up to your first paid job in an afternoon.
            </h2>
            <ol className="mt-10 grid gap-4 md:grid-cols-4">
              {STEPS.map((s) => (
                <li key={s.n} className="rounded-[28px] bg-(--paper) p-6">
                  <span className="crm-display text-4xl font-semibold text-(--leaf-500)">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm text-(--ink-2)">{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap items-center gap-2 rounded-[28px] bg-(--leaf-900) p-5 text-sm font-semibold text-(--cream)">
              {[
                'Request',
                'Quote',
                'Approved',
                'Job scheduled',
                'Crew dispatched',
                'Completed + photos',
                'Invoiced',
                'Paid',
              ].map((x, i, arr) => (
                <span key={x} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-3 py-1.5',
                      i === arr.length - 1
                        ? 'bg-(--lime) text-(--leaf-950)'
                        : 'bg-white/10',
                    )}
                  >
                    {x}
                  </span>
                  {i < arr.length - 1 && (
                    <ArrowRight className="size-4 text-(--lime)" />
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section
          id="pricing"
          className="mx-auto max-w-[1240px] scroll-mt-24 px-5 py-16 sm:px-8 sm:py-20"
        >
          <div className="text-center">
            <p className="text-xs font-bold tracking-[0.16em] text-(--leaf-600) uppercase">
              Pricing
            </p>
            <h2 className="crm-display mt-3 text-4xl font-semibold sm:text-5xl">
              Simple plans that grow with your crews.
            </h2>
            <div className="mt-6 inline-flex rounded-full border border-(--line) bg-(--paper) p-1">
              {[
                [false, 'Monthly'],
                [true, 'Annual · save 20%'],
              ].map(([v, label]) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setAnnual(v as boolean)}
                  className={cn(
                    'h-9 cursor-pointer rounded-full px-5 text-sm font-semibold',
                    annual === v
                      ? 'bg-(--leaf-900) text-(--cream)'
                      : 'text-(--ink-2)',
                  )}
                >
                  {label as string}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => {
              const price = annual ? p.annual : p.monthly
              return (
                <div
                  key={p.id}
                  className={cn(
                    'relative flex flex-col rounded-[28px] border p-8',
                    p.highlight
                      ? 'border-transparent bg-(--leaf-900) text-(--cream) lg:-my-4 lg:py-12'
                      : 'border-(--line) bg-(--paper)',
                  )}
                >
                  {p.highlight && (
                    <span className="absolute top-6 right-6 rounded-full bg-(--lime) px-3 py-1 text-xs font-bold text-(--leaf-950)">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  <p
                    className={cn(
                      'mt-1 text-sm',
                      p.highlight ? 'text-(--cream)/65' : 'text-(--ink-3)',
                    )}
                  >
                    {p.blurb}
                  </p>
                  <p className="crm-display mt-6 text-5xl font-semibold">
                    {price === null ? 'Let’s talk' : `$${price}`}
                    {price !== null && (
                      <span
                        className={cn(
                          'ml-1 font-sans text-base font-medium',
                          p.highlight ? 'text-(--cream)/60' : 'text-(--ink-3)',
                        )}
                      >
                        /mo
                      </span>
                    )}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      p.highlight ? 'text-(--cream)/55' : 'text-(--ink-3)',
                    )}
                  >
                    {price !== null
                      ? annual
                        ? 'Billed annually'
                        : 'Billed monthly'
                      : 'Custom contract'}{' '}
                    · {p.users}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-[15px]">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
                            p.highlight
                              ? 'bg-(--lime) text-(--leaf-950)'
                              : 'bg-(--lime-200) text-(--leaf-900)',
                          )}
                        >
                          <Check className="size-3" />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {p.id === 'enterprise' ? (
                    <a
                      href="#demo"
                      className="mt-8 rounded-full border border-(--line-2) py-3 text-center font-bold text-(--ink) no-underline hover:bg-(--sage)"
                    >
                      Contact sales
                    </a>
                  ) : (
                    <Link
                      to="/sign-up"
                      className={cn(
                        'mt-8 rounded-full py-3 text-center font-bold no-underline',
                        p.highlight
                          ? 'bg-(--lime) text-(--leaf-950) hover:bg-(--lime-400)'
                          : 'bg-(--leaf-900) text-(--cream) hover:bg-(--leaf-800)',
                      )}
                    >
                      Start free trial
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Testimonials */}
        <section
          id="reviews"
          className="scroll-mt-24 bg-(--leaf-900) py-16 text-(--cream) sm:py-20"
        >
          <div className="mx-auto max-w-[1240px] px-5 sm:px-8">
            <p className="text-xs font-bold tracking-[0.16em] text-(--lime) uppercase">
              From landscaping companies
            </p>
            <h2 className="crm-display mt-3 max-w-2xl text-4xl leading-tight font-semibold sm:text-5xl">
              Less time in the truck cab doing paperwork.
            </h2>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {TESTIMONIALS.map((tm) => (
                <figure
                  key={tm.name}
                  className="flex flex-col rounded-[28px] bg-white/6 p-7 ring-1 ring-white/10"
                >
                  <Quote className="size-8 text-(--lime)" />
                  <blockquote className="mt-4 flex-1 text-[17px] leading-relaxed text-(--cream)/90">
                    “{tm.quote}”
                  </blockquote>
                  <figcaption className="mt-6 border-t border-white/10 pt-4">
                    <p className="font-bold">{tm.name}</p>
                    <p className="text-sm text-(--cream)/55">{tm.meta}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          className="mx-auto grid max-w-[1240px] scroll-mt-24 gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.4fr]"
        >
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-(--leaf-600) uppercase">
              FAQ
            </p>
            <h2 className="crm-display mt-3 text-4xl font-semibold sm:text-5xl">
              Questions, answered.
            </h2>
            <p className="mt-4 text-(--ink-2)">
              Something else? Email{' '}
              <a
                href="mailto:hello@absolutecrm.app"
                className="font-semibold text-(--leaf-700)"
              >
                hello@absolutecrm.app
              </a>
              .
            </p>
          </div>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <div
                key={f.q}
                className="rounded-[22px] border border-(--line) bg-(--paper)"
              >
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-[17px] font-bold"
                >
                  {f.q}
                  <ChevronDown
                    className={cn(
                      'size-5 shrink-0 transition-transform',
                      open === i && 'rotate-180',
                    )}
                  />
                </button>
                {open === i && (
                  <p className="px-6 pb-5 text-(--ink-2)">{f.a}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Demo / CTA */}
        <section
          id="demo"
          className="mx-auto max-w-[1240px] scroll-mt-24 px-5 pb-16 sm:px-8"
        >
          <div className="grid gap-8 overflow-hidden rounded-[36px] bg-(--lime) p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <h2 className="crm-display text-4xl leading-tight font-semibold text-(--leaf-950) sm:text-5xl">
                See it with your own schedule.
              </h2>
              <p className="mt-4 text-(--leaf-900)/80">
                Book a 30-minute walkthrough. We’ll load a sample of your
                services and crews so you can see a real week.
              </p>
              <ul className="mt-6 space-y-2 text-(--leaf-950)">
                {[
                  'Mobile app for every crew member',
                  'Import clients from a spreadsheet',
                  'Set up in an afternoon',
                ].map((x) => (
                  <li key={x} className="flex items-center gap-2 font-semibold">
                    <Smartphone className="size-4" /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <form
              className="rounded-[28px] bg-(--paper) p-6"
              onSubmit={(e) => {
                e.preventDefault()
                setDemoSent(true)
              }}
            >
              {demoSent ? (
                <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 className="size-10 text-(--leaf-600)" />
                  <p className="mt-3 text-lg font-bold">
                    Thanks, {demo.name.split(' ')[0] || 'there'}!
                  </p>
                  <p className="text-sm text-(--ink-2)">
                    We’ll email {demo.email} within one business day to pick a
                    time.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['name', 'Your name', 'text'],
                      ['email', 'Work email', 'email'],
                      ['company', 'Company', 'text'],
                    ] as const
                  ).map(([k, label, type]) => (
                    <label
                      key={k}
                      className={cn(
                        'text-[13px] font-semibold text-(--ink-2)',
                        k === 'company' && 'sm:col-span-2',
                      )}
                    >
                      {label}
                      <input
                        required
                        type={type}
                        value={demo[k]}
                        onChange={(e) =>
                          setDemo((d) => ({ ...d, [k]: e.target.value }))
                        }
                        className="mt-1.5 h-11 w-full rounded-xl border border-(--line-2) bg-(--paper) px-3 text-sm text-(--ink) outline-none focus:border-(--leaf-500) focus:ring-[3px] focus:ring-(--lime-200)"
                      />
                    </label>
                  ))}
                  <label className="text-[13px] font-semibold text-(--ink-2) sm:col-span-2">
                    How many crews?
                    <select
                      value={demo.crews}
                      onChange={(e) =>
                        setDemo((d) => ({ ...d, crews: e.target.value }))
                      }
                      className="mt-1.5 h-11 w-full cursor-pointer rounded-xl border border-(--line-2) bg-(--paper) px-3 text-sm text-(--ink) outline-none"
                    >
                      {['1-2', '3-5', '6-10', '10+'].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="group mt-2 inline-flex cursor-pointer items-center justify-center gap-3 rounded-full bg-(--leaf-900) py-2 pr-2 pl-6 font-bold text-(--cream) hover:bg-(--leaf-800) sm:col-span-2"
                  >
                    Book my demo <ArrowChip />
                  </button>
                </div>
              )}
            </form>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-(--line) bg-(--paper)">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-(--ink-3)">
              The CRM for landscaping companies. Scheduling, dispatch, and
              invoicing for crews of every size.
            </p>
          </div>
          <div>
            <p className="text-sm font-bold">Product</p>
            <ul className="mt-3 space-y-2 text-sm">
              {nav.slice(0, 3).map(([l, h]) => (
                <li key={h}>
                  <a
                    href={h}
                    className="text-(--ink-2) no-underline hover:text-(--ink)"
                  >
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold">Company</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a
                  href="mailto:hello@absolutecrm.app"
                  className="inline-flex items-center gap-1.5 text-(--ink-2) no-underline hover:text-(--ink)"
                >
                  <Mail className="size-3.5" /> Contact
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@absolutecrm.app"
                  className="text-(--ink-2) no-underline hover:text-(--ink)"
                >
                  Support
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-bold">Legal</p>
            <ul className="mt-3 space-y-2 text-sm">
              {/* TODO: point these at real /terms and /privacy routes once they exist. */}
              <li>
                <a
                  href="#terms"
                  className="text-(--ink-2) no-underline hover:text-(--ink)"
                >
                  Terms of service
                </a>
              </li>
              <li>
                <a
                  href="#privacy"
                  className="text-(--ink-2) no-underline hover:text-(--ink)"
                >
                  Privacy policy
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-(--line) py-5 text-center text-xs text-(--ink-3)">
          © {new Date().getFullYear()} AbsoluteCRM. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
