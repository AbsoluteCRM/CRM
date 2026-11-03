import { Link, useRouter } from '@tanstack/react-router'
import { Check, TriangleAlert, Wand2, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Btn, Card } from '#/components/crm/ui'
import { fmtDate } from '#/components/crm/format'
import type { AvailableVisit, DraftResult } from '#/integrations/routes/routes'

/** Where the panel is in a "Build routes from service areas" run. */
export type DraftRun =
  | { state: 'idle' }
  | { state: 'building' }
  | { state: 'done'; result: DraftResult }
  | { state: 'error'; message: string }

type Unassigned = DraftResult['unassigned'][number]

type Fix = {
  /** Why the visit was left out, in words. */
  title: string
  /** What to do about it. */
  hint: string
  /** Where to do it; none when the fix is on this page. */
  link?: (visit: AvailableVisit | undefined) => ReactNode
}

function Go({
  to,
  search,
  children,
}: {
  to: '/clients' | '/settings' | '/teams'
  search?: { id: string }
  children: ReactNode
}) {
  // Stories and tests render without a router; fall back to a plain anchor.
  const router = useRouter({ warn: false }) as unknown
  const className = 'font-semibold text-(--leaf-700) underline'
  if (!router) {
    const query = search ? `?id=${encodeURIComponent(search.id)}` : ''
    return (
      <a href={`${to}${query}`} className={className}>
        {children}
      </a>
    )
  }
  return to === '/clients' ? (
    <Link to="/clients" search={search ?? { id: '' }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}

const FIXES: Record<string, Fix> = {
  no_location: {
    title: 'No map location',
    hint: 'Set a location for the address so it can be matched to a service area.',
    link: (v) =>
      v?.clientId ? (
        <Go to="/clients" search={{ id: v.clientId }}>
          Open the client to set a location
        </Go>
      ) : null,
  },
  no_area: {
    title: 'Outside every service area',
    hint: 'No service area covers this address. Draw or extend an area, or give the job a preferred crew.',
    link: () => <Go to="/settings">Edit service areas</Go>,
  },
  area_has_no_crew: {
    title: 'Area has no crew',
    hint: 'The service area it falls in has no crew for this weekday. Assign a crew to the area.',
    link: () => <Go to="/settings">Assign a crew to the area</Go>,
  },
  crew_archived: {
    title: 'Crew is archived',
    hint: 'The crew that owns this visit is archived. Move the area to an active crew, or add the visit to a route by hand.',
    link: () => <Go to="/teams">Open Teams</Go>,
  },
  route_locked: {
    title: 'Crew’s route is already published',
    hint: 'Its crew’s route for this date is no longer a draft. Add the visit to an open route by hand.',
  },
}

const fixFor = (reason: string): Fix =>
  FIXES[reason] ?? {
    title: 'Could not be placed',
    hint: 'Add this visit to a route by hand.',
  }

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

/**
 * The "Build routes from service areas" button and what came of the last run.
 * The page keeps the run state; `visits` is the current pool, which lets an
 * unassigned visit show its customer and address.
 */
export function DraftRoutesPanel({
  date,
  run,
  visits,
  disabled,
  onBuild,
  onDismiss,
}: {
  date: string
  run: DraftRun
  visits: Array<AvailableVisit>
  disabled: boolean
  onBuild: () => void
  onDismiss: () => void
}) {
  const building = run.state === 'building'
  return (
    <section aria-label="Build routes from service areas">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="crm-display text-xl font-semibold">
              Build routes from service areas
            </h2>
            <p className="mt-1 max-w-xl text-xs text-(--ink-3)">
              Puts each scheduled visit on {fmtDate(date)} that is not on a
              route onto a draft route for the crew that owns its service area.
              A job’s preferred crew comes first, then the area’s weekday
              rotation, then the area’s crew. Stops already on routes, locked
              stops and published routes are left alone. Safe to run again.
            </p>
          </div>
          <Btn
            icon={Wand2}
            disabled={disabled || building}
            aria-busy={building}
            onClick={onBuild}
          >
            {building ? 'Building routes…' : 'Build routes from service areas'}
          </Btn>
        </div>
        {run.state === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-(--line-2) bg-(--paper) p-3 text-xs"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Routes were not built</p>
              <p className="mt-0.5 text-(--ink-2)">
                {run.message.replace(/[.\s]+$/, '')}. Nothing was changed. Press
                the button to try again.
              </p>
            </div>
          </div>
        )}
        {run.state === 'done' && (
          <DraftSummary
            result={run.result}
            visits={visits}
            onDismiss={onDismiss}
          />
        )}
      </Card>
    </section>
  )
}

function DraftSummary({
  result,
  visits,
  onDismiss,
}: {
  result: DraftResult
  visits: Array<AvailableVisit>
  onDismiss: () => void
}) {
  const byId = new Map(visits.map((v) => [v.visitId, v]))
  const nothing = result.assigned === 0 && result.unassigned.length === 0
  return (
    <div
      role="status"
      aria-label="Build result"
      className="space-y-3 rounded-xl border border-(--line) bg-(--sage) p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Check className="size-4 text-(--leaf-700)" aria-hidden />
          {nothing
            ? 'Nothing to place'
            : `${plural(result.assigned, 'visit', 'visits')} placed on ${plural(
                result.routesCreated,
                'new route',
                'new routes',
              )}`}
        </p>
        <button
          type="button"
          aria-label="Dismiss result"
          className="rounded-md p-1 text-(--ink-3) hover:bg-(--paper)"
          onClick={onDismiss}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {nothing && (
        <p className="text-xs text-(--ink-2)">
          Every scheduled visit on this date is already on a route.
        </p>
      )}
      {!nothing && result.routesCreated === 0 && result.assigned > 0 && (
        <p className="text-xs text-(--ink-2)">
          They went onto routes that already existed, after the stops there.
        </p>
      )}
      {result.remaining > 0 && (
        <p className="text-xs font-semibold text-(--ink-2)">
          {plural(result.remaining, 'more visit is', 'more visits are')}{' '}
          waiting. Build again to place {result.remaining === 1 ? 'it' : 'them'}
          .
        </p>
      )}
      {result.unassigned.length > 0 && (
        <div>
          <h3 className="text-xs font-bold">
            {plural(result.unassigned.length, 'visit needs', 'visits need')}{' '}
            attention
          </h3>
          <ul
            aria-label="Visits that could not be placed"
            className="mt-2 space-y-2"
          >
            {result.unassigned.map((u) => (
              <UnassignedRow
                key={u.visitId}
                item={u}
                visit={byId.get(u.visitId)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function UnassignedRow({
  item,
  visit,
}: {
  item: Unassigned
  visit: AvailableVisit | undefined
}) {
  const fix = fixFor(item.reason)
  return (
    <li
      data-reason={item.reason}
      className="rounded-lg border border-(--line) bg-(--paper) p-3 text-xs"
    >
      <p className="font-bold">
        {visit?.clientName ?? 'A visit'}
        {visit?.address && (
          <span className="font-normal text-(--ink-3)">
            {' '}
            · {visit.address}
            {visit.city ? `, ${visit.city}` : ''}
          </span>
        )}
      </p>
      <p className="mt-1 font-semibold text-(--ink-2)">{fix.title}</p>
      <p className="mt-0.5 text-(--ink-3)">{fix.hint}</p>
      {fix.link && <p className="mt-1">{fix.link(visit)}</p>}
    </li>
  )
}
