import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleUser,
  HardHat,
  Handshake,
  LogOut,
  MessageSquareDiff,
  Plus,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react'

import { useAuth } from '#/integrations/auth/context'
import { useOrganization } from '#/integrations/organization/context'
import { cn } from '#/lib/utils'
import { ROLE_LABEL } from '#/integrations/organization/permissions'
import { useRole } from '#/integrations/organization/use-role'
import { useTenant } from '#/mocks/crm-store'
import { Toaster } from '#/lib/toast'
import { fmtDate } from '#/components/crm/format'

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}

function Menu({
  trigger,
  children,
  align = 'right',
  width = 260,
}: {
  trigger: (open: boolean, toggle: () => void) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))
  return (
    <div ref={ref} className="relative">
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={cn(
            'crm-pop absolute top-full z-50 mt-2 overflow-hidden rounded-2xl border border-(--line) bg-(--paper) p-1.5 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

const menuItem =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold text-(--ink) no-underline hover:bg-(--sage)'

function GlobalSearch() {
  const t = useTenant()
  const searchAll = useRole().can('manageClients')
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    const clients = t.clients
      .filter((c) => {
        const addr = t
          .propertiesOf(c.id)
          .map((p) => p.address_line1)
          .join(' ')
        return `${c.display_name} ${c.phone} ${c.email} ${addr}`
          .toLowerCase()
          .includes(needle)
      })
      .slice(0, 5)
      .map((c) => ({
        kind: 'client' as const,
        id: c.id,
        title: c.display_name,
        sub: t.propertiesOf(c.id)[0]?.address_line1 ?? c.email,
      }))
    const jobs = t.visibleJobs
      .filter((j) =>
        `${j.number} ${t.client(j.client_id)?.display_name ?? ''}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(-4)
      .reverse()
      .map((j) => ({
        kind: 'job' as const,
        id: j.id,
        title: `${j.number} · ${t.client(j.client_id)?.display_name ?? ''}`,
        sub: fmtDate(j.date, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }),
      }))
    const requests = t.requests
      .filter((r) =>
        `${r.prospect?.name ?? t.client(r.client_id)?.display_name ?? ''} ${r.address}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 3)
      .map((r) => ({
        kind: 'request' as const,
        id: r.id,
        title:
          r.prospect?.name ?? t.client(r.client_id)?.display_name ?? 'Request',
        sub: t.service(r.service_id)?.name ?? '',
      }))
    return searchAll ? [...clients, ...jobs, ...requests] : jobs
  }, [q, t, searchAll])

  const go = (r: (typeof results)[number]) => {
    setOpen(false)
    setQ('')
    if (r.kind === 'client') navigate({ to: '/clients', search: { id: r.id } })
    if (r.kind === 'job') navigate({ to: '/jobs', search: { id: r.id } })
    if (r.kind === 'request')
      navigate({ to: '/requests', search: { id: r.id } })
  }

  const Icon = { client: Handshake, job: HardHat, request: MessageSquareDiff }

  return (
    <div ref={ref} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-(--ink-3)" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0])
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Search clients, jobs, addresses…"
        aria-label="Search clients, jobs, and requests"
        className="h-10 w-full rounded-full border border-(--line) bg-(--cream) pr-4 pl-10 text-sm text-(--ink) outline-none placeholder:text-(--ink-3) focus:border-(--leaf-500) focus:bg-(--paper) focus:ring-[3px] focus:ring-(--lime-200)"
      />
      {open && q.trim().length >= 2 && (
        <div className="crm-pop absolute top-full right-0 left-0 z-50 mt-2 overflow-hidden rounded-2xl border border-(--line) bg-(--paper) p-1.5 shadow-xl">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-(--ink-3)">
              No matches for “{q}”
            </p>
          ) : (
            results.map((r) => {
              const I = Icon[r.kind]
              return (
                <button
                  key={r.kind + r.id}
                  type="button"
                  onClick={() => go(r)}
                  className={menuItem}
                >
                  <span className="flex size-8 items-center justify-center rounded-lg bg-(--sage) text-(--leaf-700)">
                    <I className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{r.title}</span>
                    <span className="block truncate text-xs font-medium text-(--ink-3)">
                      {r.sub}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

const ORG_AVATAR = 'bg-(--leaf-700)'

export default function Header() {
  const t = useTenant()
  const access = useRole()
  const {
    organizations,
    organization,
    isLoading: orgLoading,
    setActiveOrganization,
  } = useOrganization()
  const orgName = organization?.name ?? (orgLoading ? 'Loading…' : 'No company')
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const newRequests = t.requests.filter((r) => r.status === 'submitted')
  const displayName =
    access.role === 'owner' && user?.email
      ? user.email
      : (t.me?.display_name ?? 'You')

  return (
    <header className="fixed top-0 right-0 left-0 z-40 flex h-16 items-center gap-3 border-b border-(--line) bg-(--paper)/90 pr-4 pl-[92px] backdrop-blur-md sm:pr-6">
      <Toaster />

      {/* Workspace (tenant) switcher */}
      <Menu
        align="left"
        width={300}
        trigger={(open, toggle) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 hover:bg-(--sage)"
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white',
                ORG_AVATAR,
              )}
            >
              {orgName.charAt(0)}
            </span>
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block max-w-[200px] truncate text-[13px] font-bold text-(--ink)">
                {orgName}
              </span>
              <span className="block text-[11px] font-medium text-(--ink-3)">
                Workspace
              </span>
            </span>
            <ChevronDown className="size-4 text-(--ink-3)" />
          </button>
        )}
      >
        {(close) => (
          <>
            <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wider text-(--ink-3) uppercase">
              Your companies
            </p>
            {organizations.length === 0 && (
              <p className="px-3 py-2 text-[13px] text-(--ink-3)">
                {orgLoading ? 'Loading companies…' : 'No companies yet.'}
              </p>
            )}
            {organizations.map((o) => (
              <button
                key={o.id}
                type="button"
                className={menuItem}
                onClick={() => {
                  setActiveOrganization(o.id)
                  close()
                }}
              >
                <span
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full text-xs font-bold text-white',
                    ORG_AVATAR,
                  )}
                >
                  {o.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {o.id === organization?.id && (
                  <Check className="size-4 text-(--leaf-600)" />
                )}
              </button>
            ))}
            <div className="my-1 h-px bg-(--line)" />
            <Link to="/onboarding" className={menuItem} onClick={close}>
              <span className="flex size-7 items-center justify-center rounded-full bg-(--lime-200) text-(--leaf-900)">
                <Plus className="size-4" />
              </span>
              Add a company
            </Link>
            <p className="flex items-start gap-2 px-3 pt-2 pb-2 text-[11px] leading-snug text-(--ink-3)">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-(--leaf-600)" />
              Each company is an isolated workspace. Data never crosses between
              them.
            </p>
          </>
        )}
      </Menu>

      <div className="flex flex-1 justify-center">
        <GlobalSearch />
      </div>

      {/* Notifications */}
      <Menu
        width={320}
        trigger={(open, toggle) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`Notifications, ${newRequests.length} new requests`}
            className="relative flex size-10 cursor-pointer items-center justify-center rounded-full text-(--ink-2) hover:bg-(--sage)"
          >
            <Bell className="size-5" />
            {newRequests.length > 0 && access.can('manageRequests') && (
              <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-(--clay) text-[10px] font-bold text-white">
                {newRequests.length}
              </span>
            )}
          </button>
        )}
      >
        {(close) => (
          <>
            <p className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wider text-(--ink-3) uppercase">
              Recent activity
            </p>
            {t.activity.slice(0, 5).map((a) => (
              <div
                key={a.id}
                className="rounded-xl px-3 py-2 text-[13px] text-(--ink)"
              >
                {a.text}
                <span className="block text-[11px] text-(--ink-3)">
                  {a.actor}
                </span>
              </div>
            ))}
            {access.can('manageRequests') && (
              <Link
                to="/requests"
                onClick={close}
                className={cn(menuItem, 'justify-center text-(--leaf-700)')}
              >
                Review {newRequests.length} new request
                {newRequests.length === 1 ? '' : 's'}
              </Link>
            )}
          </>
        )}
      </Menu>

      {/* User menu */}
      <Menu
        width={260}
        trigger={(open, toggle) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label="Account menu"
            className="flex cursor-pointer items-center gap-2 rounded-full p-1 hover:bg-(--sage)"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-(--leaf-900) text-(--lime)">
              <CircleUser className="size-5" />
            </span>
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="px-3 pt-2 pb-2">
              <p className="truncate text-[13px] font-bold text-(--ink)">
                {displayName}
              </p>
              <p className="text-xs text-(--ink-3)">
                {access.role ? `${ROLE_LABEL[access.role]} · ` : ''}
                {orgName}
              </p>
            </div>
            <div className="my-1 h-px bg-(--line)" />
            {access.can('manageSettings') && (
              <Link to="/settings" onClick={close} className={menuItem}>
                <Settings className="size-4 text-(--ink-3)" /> Company settings
              </Link>
            )}
            <Link to="/onboarding" onClick={close} className={menuItem}>
              <Building2 className="size-4 text-(--ink-3)" /> Set up a new
              company
            </Link>
            <button
              type="button"
              className={menuItem}
              onClick={async () => {
                close()
                await signOut()
                navigate({ to: '/' })
              }}
            >
              <LogOut className="size-4 text-(--ink-3)" /> Sign out
            </button>
          </>
        )}
      </Menu>
    </header>
  )
}
