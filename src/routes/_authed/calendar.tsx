import { createFileRoute } from '@tanstack/react-router'

import { WeekCalendar } from '#/features/calendar/WeekCalendar'

export const Route = createFileRoute('/_authed/calendar')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="space-y-4 p-6 flex w-full">
      <WeekCalendar />
    </div>
  )
}
