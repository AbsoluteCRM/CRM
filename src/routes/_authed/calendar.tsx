import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarPlus } from 'lucide-react'
import { useCallback, useState } from 'react'

import type {
  DayRoute,
  RouteStop,
  StopStatus,
  StopUpdate,
} from '#/components/calendar/mock-routes'
import { WeekCalendar } from '#/components/calendar/WeekCalendar'
import { addDays, startOfWeek, toISODate } from '#/components/crm/format'
import JobFormModal from '#/components/crm/JobFormModal'
import { depotLonLat } from '#/components/crm/route'
import PageShell from '#/components/crm/PageShell'
import type { Tenant } from '#/components/crm/store'
import { actions, can, useTenant } from '#/components/crm/store'
import type { Job } from '#/components/crm/types'
import { Btn } from '#/components/crm/ui'

export const Route = createFileRoute('/_authed/calendar')({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({
    new: search.new === true || search.new === 'true' ? true : undefined,
  }),
  component: RouteComponent,
})

const UNASSIGNED = { id: 'unassigned', name: 'Unassigned', color: '#a3ab9c' }

function toStopStatus(status: Job['status']): StopStatus {
  if (status === 'completed') return 'completed'
  if (status === 'in_progress') return 'in-progress'
  return 'scheduled'
}

/** Shapes the tenant's jobs into the calendar's week of routes. */
function weekRoutes(t: Tenant, anchor: Date): Array<DayRoute> {
  const monday = startOfWeek(toISODate(anchor))
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const stops = t.visibleJobs
      .filter((j) => j.date === date && j.status !== 'cancelled')
      .map((j): RouteStop => {
        const property = t.property(j.property_id)
        const crew = t.crew(j.crew_id)
        return {
          id: j.id,
          time: j.start,
          customer: t.client(j.client_id)?.display_name ?? 'Client',
          address: property
            ? `${property.address_line1}, ${property.city}, ${property.region}, Canada`
            : '',
          jobType: t
            .jobServices(j)
            .map((s) => s.name)
            .join(', '),
          status: toStopStatus(j.status),
          durationMinutes: j.durationMinutes,
          notes: j.notes || undefined,
          location: property?.location ?? null,
          crew: crew
            ? { id: crew.id, name: crew.name, color: crew.color }
            : UNASSIGNED,
        }
      })
    return { date, stops }
  })
}

function RouteComponent() {
  const t = useTenant()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(!!search.new)
  const manage = can.manageJobs(t.role)

  const getWeekRoutes = useCallback(
    (anchor: Date) => weekRoutes(t, anchor),
    [t],
  )

  /** Saves an "Update" from a stop card back to the job (and invoices on completion). */
  const updateStop = (stop: RouteStop, u: StopUpdate) => {
    const job = t.jobs.find((j) => j.id === stop.id)
    if (!job) return
    if (manage && (u.date !== job.date || u.time !== job.start)) {
      actions.moveJob(job.id, { date: u.date, start: u.time })
    }
    if (manage && u.durationMinutes !== job.durationMinutes) {
      actions.updateJob(job.id, { durationMinutes: u.durationMinutes })
    }
    if (u.notes !== job.notes) actions.updateJob(job.id, { notes: u.notes })
    if (u.status !== toStopStatus(job.status)) {
      if (u.status === 'completed') actions.completeJob(job.id, {})
      else if (u.status === 'in-progress')
        actions.setJobStatus(job.id, 'in_progress')
      else actions.setJobStatus(job.id, job.crew_id ? 'assigned' : 'scheduled')
    }
  }

  const closeCreate = () => {
    setCreating(false)
    if (search.new) navigate({ to: '/calendar', search: {} })
  }

  return (
    <PageShell
      kicker="Scheduling & dispatch"
      title="Calendar"
      subtitle={
        manage
          ? 'Pick a day to see each crew’s route in driving order. Update any stop to change its status, time, or notes.'
          : 'Your crew’s route for each day. Update stops as you work through them.'
      }
      actions={
        manage && (
          <Btn icon={CalendarPlus} onClick={() => setCreating(true)}>
            New job
          </Btn>
        )
      }
    >
      <WeekCalendar
        depot={depotLonLat(t.org.city)}
        getWeekRoutes={getWeekRoutes}
        onUpdateStop={updateStop}
        canReschedule={manage}
        completeHint="Marking a job complete sends the client its invoice."
      />
      {creating && <JobFormModal open onClose={closeCreate} />}
    </PageShell>
  )
}
