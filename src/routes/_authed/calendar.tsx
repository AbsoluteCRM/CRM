import { createFileRoute } from '@tanstack/react-router'

import { WeekCalendar } from '#/components/calendar/WeekCalendar'

export const Route = createFileRoute('/_authed/calendar')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex w-full bg-(--cream) p-6 text-(--ink)">
      <WeekCalendar />
    </div>
  )
}
