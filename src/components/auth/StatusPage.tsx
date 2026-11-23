import { Link } from '@tanstack/react-router'
import { Compass, Home, LinkIcon, RotateCcw, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Btn, btnClass } from '#/components/crm/ui'
import AuthShell from './AuthShell'

const KINDS = {
  'not-found': {
    icon: Compass,
    code: '404',
    title: 'We couldn’t find that page',
    body: 'The link may be broken, or the page may have moved.',
  },
  error: {
    icon: TriangleAlert,
    code: 'Error',
    title: 'Something went wrong',
    body: 'An unexpected error stopped this page from loading. Try again, or head back home.',
  },
  'link-expired': {
    icon: LinkIcon,
    code: 'Link',
    title: 'This link is no longer valid',
    body: 'It may have expired or been replaced by a newer one. Ask the sender for a new link.',
  },
} satisfies Record<
  string,
  { icon: LucideIcon; code: string; title: string; body: string }
>

/**
 * Full-page status screen in the sign-in design. Used for the router's
 * error and not-found pages and for expired links.
 */
export default function StatusPage({
  kind,
  title,
  body,
  onRetry,
  actions,
  details,
}: {
  kind: keyof typeof KINDS
  title?: string
  body?: ReactNode
  onRetry?: () => void
  /** Replaces the default actions; `false` shows none. */
  actions?: ReactNode | false
  /** Technical detail, shown collapsed (dev only). */
  details?: string
}) {
  const k = KINDS[kind]
  const Icon = k.icon
  return (
    <AuthShell
      aside={
        <>
          <p className="crm-display text-[120px] leading-none font-semibold text-(--lime)/90 xl:text-[160px]">
            {k.code}
          </p>
          <p className="mt-4 max-w-sm text-(--cream)/70">
            Lost a step? Everything you need is a click away.
          </p>
        </>
      }
    >
      <div className="rounded-[28px] border border-(--line) bg-(--paper) p-6 text-center shadow-[0_24px_60px_-30px_rgba(17,48,31,0.35)] sm:p-10">
        <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-(--lime-100) text-(--leaf-700)">
          <Icon className="size-7" />
        </span>
        <h1 className="crm-display mt-5 text-3xl font-semibold">
          {title ?? k.title}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-(--ink-2)">
          {body ?? k.body}
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          {actions === false ? null : actions !== undefined ? (
            actions
          ) : (
            <>
              {onRetry && (
                <Btn icon={RotateCcw} onClick={onRetry}>
                  Try again
                </Btn>
              )}
              <Link
                to="/"
                className={btnClass(onRetry ? 'outline' : 'primary')}
              >
                <Home className="size-4" /> Go home
              </Link>
              <Link to="/dashboard" className={btnClass('ghost')}>
                Dashboard
              </Link>
            </>
          )}
        </div>
        {details && (
          <details className="mt-6 text-left text-xs text-(--ink-3)">
            <summary className="cursor-pointer">Technical details</summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-(--cream) p-3 whitespace-pre-wrap">
              {details}
            </pre>
          </details>
        )}
      </div>
    </AuthShell>
  )
}
