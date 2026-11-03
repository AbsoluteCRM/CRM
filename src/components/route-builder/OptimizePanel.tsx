import { Check, Info, Loader2, Navigation, TriangleAlert } from 'lucide-react'

import { Badge, Btn, Card } from '#/components/crm/ui'
import { fmtDate } from '#/components/crm/format'
import {
  fmtClock,
  fmtKm,
  fmtSeconds,
} from '#/components/route-builder/optimize-format'
import { isActiveRun } from '#/integrations/routes/routes'
import type {
  DayRoute,
  OptimizationControl,
} from '#/integrations/routes/routes'

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

const routeName = (route: DayRoute) => route.crew?.name ?? 'Route'

/**
 * The "Optimize routes" card: what the button does, whether it can run (and
 * if not, why), the latest run's state, and each optimized route's road
 * distance and time with a stale flag. The page owns the run state
 * (`useOptimization`); this view only renders it.
 */
export function OptimizePanel({
  date,
  routes,
  control,
  disabled,
}: {
  date: string
  routes: Array<DayRoute>
  control: OptimizationControl
  /** The board is not ready (loading or failed to load). */
  disabled: boolean
}) {
  const { info, run, starting, error, onOptimize } = control
  const active = starting || isActiveRun(run)
  const open = routes.filter((r) => r.editable && r.stops.length > 0)
  const unavailable = info !== null && !info.available
  const optimized = routes.filter((r) => r.road)
  const stale = optimized.filter((r) => r.road?.stale)

  const blocker = unavailable
    ? info.reason
    : !disabled && info && open.length === 0
      ? 'Add stops to a draft or optimized route first.'
      : null

  return (
    <section aria-label="Optimize routes">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="crm-display text-xl font-semibold">
              Optimize routes
            </h2>
            <p className="mt-1 max-w-xl text-xs text-(--ink-3)">
              Orders each open route’s stops for {fmtDate(date)} by real road
              travel time, not straight-line distance. It uses the crew’s start
              location and shift length and each visit’s duration and arrival
              window, then sets arrival times, drive times and a road line on
              the map. Stops stay with their crew. Locked stops keep their
              place, and published routes are not changed.
            </p>
          </div>
          <Btn
            icon={active ? Loader2 : Navigation}
            disabled={
              disabled || !info || unavailable || open.length === 0 || active
            }
            aria-busy={active}
            onClick={onOptimize}
          >
            {active ? 'Optimizing…' : 'Optimize routes'}
          </Btn>
        </div>

        {blocker && (
          <p
            role="note"
            className="flex items-start gap-2 rounded-xl border border-(--line) bg-(--cream) p-3 text-xs text-(--ink-2)"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{blocker}</span>
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-(--line-2) bg-(--paper) p-3 text-xs"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-bold">The optimization did not start</p>
              <p className="mt-0.5 text-(--ink-2)">
                {error.replace(/[.\s]+$/, '')}. Nothing was changed.
              </p>
            </div>
          </div>
        )}

        {run && <RunState run={run} />}

        {stale.length > 0 && (
          <p
            role="note"
            className="rounded-xl border border-(--line) bg-(--sun-100) p-3 text-xs text-(--ink-2)"
          >
            {plural(stale.length, 'route was', 'routes were')} edited after{' '}
            {stale.length === 1 ? 'its' : 'their'} last optimization, so the
            times below may be wrong. Optimize again to refresh them.
          </p>
        )}

        {optimized.length > 0 && (
          <ul aria-label="Optimized routes" className="space-y-2">
            {optimized.map((route) => (
              <li
                key={route.id}
                data-stale={route.road?.stale ? 'true' : 'false'}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--line) bg-(--paper) px-3 py-2 text-xs"
              >
                <span className="font-bold">{routeName(route)}</span>
                <span className="flex flex-wrap items-center gap-2 text-(--ink-2)">
                  {route.road?.distanceM != null && (
                    <span>{fmtKm(route.road.distanceM)}</span>
                  )}
                  {route.road && (
                    <span>{fmtSeconds(route.road.durationS)} total</span>
                  )}
                  {route.road?.stale ? (
                    <Badge tone="sun">Out of date</Badge>
                  ) : (
                    <Badge tone="success">Up to date</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  )
}

function RunState({ run }: { run: NonNullable<OptimizationControl['run']> }) {
  if (run.status === 'queued' || run.status === 'running') {
    return (
      <p
        role="status"
        aria-label="Optimization status"
        className="flex items-center gap-2 rounded-xl border border-(--line) bg-(--sage) p-3 text-xs font-semibold"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {run.status === 'queued'
          ? 'Waiting for the optimizer to start…'
          : 'Working out the best order on real roads…'}
      </p>
    )
  }
  if (run.status === 'failed') {
    return (
      <div
        role="alert"
        aria-label="Optimization status"
        className="flex items-start gap-2 rounded-xl border border-(--line-2) bg-(--paper) p-3 text-xs"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Routes were not optimized</p>
          <p className="mt-0.5 text-(--ink-2)">
            {run.error?.replace(/[.\s]+$/, '') ?? 'Something went wrong'}.
            Routes were not changed. Press the button to try again.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div
      role="status"
      aria-label="Optimization status"
      className="space-y-1 rounded-xl border border-(--line) bg-(--sage) p-3 text-xs"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <Check className="size-4 text-(--leaf-700)" aria-hidden />
        Optimized
        {run.finishedAt && (
          <span className="text-xs font-normal text-(--ink-3)">
            at {fmtClock(run.finishedAt)}
          </span>
        )}
      </p>
      {run.error && <p className="text-(--ink-2)">{run.error}</p>}
      {run.unassignedVisitIds.length > 0 && (
        <p className="text-(--ink-2)">
          {plural(
            run.unassignedVisitIds.length,
            'visit could not',
            'visits could not',
          )}{' '}
          be fit into the crew’s day or has no map location. They stay at the
          end of their route with no arrival time.
        </p>
      )}
    </div>
  )
}
