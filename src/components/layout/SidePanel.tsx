import {
  Calendar,
  HomeIcon,
  Group,
  HardHat,
  Handshake,
  MessageSquareDiff,
  Toolbox
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

function IconRow({
  label,
  icon: Icon,
  route,
}: {
  label: string
  icon: React.ElementType
  route: string
}) {
  return (
    <Link
      to={route}
      className="flex items-center space-x-2 px-4 hover:cursor-pointer text-primary"
    >
      <Icon className="shrink-0" />
      <span className="text-md font-bold whitespace-nowrap opacity-0 max-w-0 overflow-hidden transition-all duration-200 group-hover:opacity-100 group-hover:max-w-xs">
        {label}
      </span>
    </Link>
  )
}

export default function SidePanel() {
  return (
    <div className="group  flex flex-col space-y-4 border-r border-border pt-10 w-16 hover:w-64 overflow-hidden transition-all duration-200">
      <IconRow label="Dashboard" icon={HomeIcon} route="/dashboard" />
      <IconRow label="Requests" icon={MessageSquareDiff} route="/requests" />
      <IconRow label="Calendar" icon={Calendar} route="/calendar" />
      <IconRow label="Jobs" icon={HardHat} route="/jobs" />
      <IconRow label="Clients" icon={Handshake} route="/clients" />
      <IconRow label="Team" icon={Group} route="/teams" />
      <IconRow label="Services" icon={Toolbox} route="/services" />
    </div>
  )
}
