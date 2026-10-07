import { cn } from '#/lib/utils'
import { NoAccess } from './ui'
import { AppFooter } from '#/components/layout/Footer'

import type { ReactNode } from 'react'

/**
 * Scrollable page frame for every `_authed` screen. The header is fixed
 * (64px), so the frame pads the top and scrolls independently of the sidebar.
 */
export default function PageShell({
  kicker,
  title,
  subtitle,
  actions,
  children,
  allowed = true,
  section,
  className,
}: {
  kicker?: string
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** When false, renders a "no access" card instead of the page (role gating). */
  allowed?: boolean
  section?: string
  className?: string
}) {
  return (
    <div className="crm-scroll h-screen min-w-0 flex-1 overflow-y-auto bg-(--cream) pt-16 text-(--ink)">
      <div
        className={cn(
          'mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8',
          className,
        )}
      >
        <header className="crm-rise mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {kicker && (
              <p className="mb-1.5 text-[11px] font-bold tracking-[0.16em] text-(--leaf-600) uppercase">
                {kicker}
              </p>
            )}
            <h1 className="crm-display text-[30px] leading-tight font-semibold text-(--ink) sm:text-[36px]">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1.5 max-w-2xl text-sm text-(--ink-2)">
                {subtitle}
              </p>
            )}
          </div>
          {actions && allowed && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </header>
        {allowed ? children : <NoAccess section={section ?? 'This page'} />}
        <AppFooter />
      </div>
    </div>
  )
}
