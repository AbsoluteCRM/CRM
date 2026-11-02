import { Link } from '@tanstack/react-router'
import { CalendarCheck2, ClipboardList, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'

import { Logo } from '#/components/crm/Logo'
import { cn } from '#/lib/utils'

const POINTS = [
  {
    icon: ClipboardList,
    title: 'Requests to quotes in minutes',
    body: 'Online requests land in one inbox, ready to estimate and send.',
  },
  {
    icon: CalendarCheck2,
    title: 'Crews on the right route',
    body: 'Drag-and-drop scheduling with weather and conflicts in view.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data stays yours',
    body: 'Every company is an isolated workspace with role-based access.',
  },
]

/**
 * Two-panel layout for sign-in, sign-up, and full-page status screens
 * (errors, not found, expired links). The brand panel collapses to a band on
 * small screens.
 */
export default function AuthShell({
  children,
  aside,
  className,
}: {
  children: ReactNode
  /** Replaces the default brand copy in the left panel. */
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr] bg-(--cream) text-(--ink) lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-1">
      <aside className="relative overflow-hidden bg-(--leaf-900) text-(--cream)">
        <div
          className="crm-leaf-pattern pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 -bottom-24 size-80 rounded-full bg-(--lime)/15 blur-3xl"
          aria-hidden
        />
        <div className="relative flex h-full flex-col gap-10 px-6 py-5 sm:px-10 lg:py-10">
          <Link to="/" className="w-fit no-underline" aria-label="Home">
            <Logo dark />
          </Link>
          <div className="hidden flex-1 flex-col justify-center lg:flex">
            {aside ?? (
              <>
                <p className="text-[11px] font-bold tracking-[0.18em] text-(--lime) uppercase">
                  Built for landscaping teams
                </p>
                <h2 className="crm-display mt-3 max-w-md text-4xl leading-[1.1] font-semibold xl:text-5xl">
                  Run the whole season from one place.
                </h2>
                <ul className="mt-10 flex max-w-md flex-col gap-6">
                  {POINTS.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex gap-4">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-(--lime)">
                        <Icon className="size-5" />
                      </span>
                      <span>
                        <span className="block font-semibold">{title}</span>
                        <span className="text-sm text-(--cream)/65">
                          {body}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <p className="hidden text-xs text-(--cream)/45 lg:block">
            © {new Date().getFullYear()} AbsoluteCRM
          </p>
        </div>
      </aside>
      <main
        className={cn(
          'flex items-start justify-center px-4 py-8 sm:px-8 sm:py-12 lg:items-center',
          className,
        )}
      >
        <div className="crm-rise w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}

/** The white card most auth screens sit in. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="rounded-[28px] border border-(--line) bg-(--paper) p-6 shadow-[0_24px_60px_-30px_rgba(17,48,31,0.35)] sm:p-8">
      <h1 className="crm-display text-3xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-(--ink-2)">{subtitle}</p>}
      <div className="mt-6">{children}</div>
      {footer && (
        <div className="mt-6 border-t border-(--line) pt-5 text-center text-sm text-(--ink-2)">
          {footer}
        </div>
      )}
    </div>
  )
}
