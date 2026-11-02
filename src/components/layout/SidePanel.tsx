import {
  Calendar,
  HardHat,
  Handshake,
  HomeIcon,
  MessageSquareDiff,
  Settings,
  Toolbox,
  Users,
  Route,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { LogoMark } from '#/components/crm/Logo'
import { useOrganization } from '#/integrations/organization/context'
import OrgAvatar from './OrgAvatar'
import { useNewRequests } from '#/integrations/requests/requests'
import { ROLE_LABEL, canSee, useTenant } from '#/components/crm/store'
import type { Section } from '#/components/crm/store'

const NAV = [
  {
    label: 'Dashboard',
    icon: HomeIcon,
    to: '/dashboard',
    section: 'dashboard',
  },
  {
    label: 'Requests',
    icon: MessageSquareDiff,
    to: '/requests',
    section: 'requests',
  },
  {
    label: 'Route Builder',
    icon: Route,
    to: '/route-builder',
    section: 'route-builder',
  },
  { label: 'Calendar', icon: Calendar, to: '/calendar', section: 'calendar' },
  { label: 'Jobs', icon: HardHat, to: '/jobs', section: 'jobs' },
  { label: 'Clients', icon: Handshake, to: '/clients', section: 'clients' },
  { label: 'Team', icon: Users, to: '/teams', section: 'teams' },
  { label: 'Services', icon: Toolbox, to: '/services', section: 'services' },
] as const satisfies ReadonlyArray<{
  label: string
  icon: React.ElementType
  to: string
  section: Section
}>

function IconRow({
  label,
  icon: Icon,
  route,
  badge,
}: {
  label: string
  icon: React.ElementType
  route: (typeof NAV)[number]['to'] | '/settings'
  badge?: number
}) {
  return (
    <Link
      to={route}
      className="group/item relative flex h-11 items-center gap-3 rounded-2xl px-[13px] text-[14px] font-semibold text-(--cream)/70 no-underline transition-colors hover:bg-white/8 hover:text-(--cream)"
      activeProps={{
        className:
          '!bg-(--lime) !text-(--leaf-950) shadow-[0_8px_20px_-10px_rgba(198,239,106,0.8)]',
      }}
    >
      <Icon className="size-[20px] shrink-0" />
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-xs group-hover:opacity-100">
        {label}
      </span>
      {badge ? (
        <span className="absolute top-1.5 left-7 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--clay) px-1 text-[10px] font-bold text-white group-hover:static group-hover:ml-auto">
          {badge}
        </span>
      ) : null}
    </Link>
  )
}

/**
 * Fixed sidebar. A spacer keeps the page content clear of the collapsed rail;
 * hovering expands the rail over the content.
 */
export default function SidePanel() {
  const t = useTenant()
  const { organization, isLoading } = useOrganization()
  const orgName = organization?.name ?? (isLoading ? 'Loading…' : 'No company')
  const newRequests = useNewRequests().count

  return (
    <>
      <div className="w-[76px] shrink-0" aria-hidden />
      <nav
        aria-label="Main"
        className="group fixed top-0 bottom-0 left-0 z-50 flex w-[76px] flex-col overflow-hidden bg-(--leaf-900) px-[14px] pt-3 pb-4 transition-[width] duration-200 hover:w-60 hover:shadow-2xl"
      >
        <div
          className="crm-leaf-pattern pointer-events-none absolute inset-0 opacity-60"
          aria-hidden
        />
        <Link
          to="/dashboard"
          className="relative mb-6 flex h-10 items-center gap-3 px-[2px] no-underline"
        >
          <LogoMark size={44} className="shrink-0" />
          <span className="crm-display max-w-0 overflow-hidden text-lg font-semibold whitespace-nowrap text-(--cream) opacity-0 transition-all duration-200 group-hover:max-w-xs group-hover:opacity-100">
            Absolute<span className="text-(--lime)">CRM</span>
          </span>
        </Link>

        <div className="relative flex flex-1 flex-col gap-1.5">
          {NAV.filter((n) => canSee(t.role, n.section)).map((n) => (
            <IconRow
              key={n.to}
              label={n.label}
              icon={n.icon}
              route={n.to}
              badge={n.section === 'requests' ? newRequests : undefined}
            />
          ))}
        </div>

        <div className="relative flex flex-col gap-1.5">
          {canSee(t.role, 'settings') && (
            <IconRow label="Settings" icon={Settings} route="/settings" />
          )}
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-white/6 p-1.5">
            <OrgAvatar name={orgName} className="size-9 rounded-xl text-sm" />
            <span className="max-w-0 min-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:max-w-xs group-hover:opacity-100">
              <span className="block truncate text-[13px] font-bold text-(--cream)">
                {orgName}
              </span>
              <span className="block text-[11px] text-(--cream)/55 capitalize">
                {organization ? ROLE_LABEL[organization.role] : 'Workspace'}
              </span>
            </span>
          </div>
        </div>
      </nav>
    </>
  )
}
