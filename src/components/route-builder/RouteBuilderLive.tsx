import { useState } from 'react'

import { RouteBuilder } from '#/components/route-builder/RouteBuilder'
import { todayISO } from '#/components/crm/format'
import { useCrewsFor } from '#/integrations/crews/crews'
import { useOrgScope } from '#/integrations/organization/org-query'
import { useRole } from '#/integrations/organization/use-role'
import {
  useAvailableVisits,
  useDayRoutes,
  useOptimization,
  useRouteMutations,
} from '#/integrations/routes/routes'
import type { OrgScope } from '#/integrations/routes/routes'

/** Route Builder wired to the database for the active organization. */
export function RouteBuilderLive() {
  const access = useRole()
  return (
    <RouteBoard scope={useOrgScope()} canBuild={access.can('manageJobs')} />
  )
}

/** The board for one organization; stories pass a fixed scope. */
export function RouteBoard({
  scope,
  initialDate,
  canBuild = true,
}: {
  scope: OrgScope
  initialDate?: string
  canBuild?: boolean
}) {
  const [date, setDate] = useState(initialDate ?? todayISO())
  const routes = useDayRoutes(scope, date)
  const pool = useAvailableVisits(scope, date)
  const crews = useCrewsFor(scope)
  const actions = useRouteMutations(scope, date)
  const optimization = useOptimization(scope, date)

  const failed = routes.isError || pool.isError || crews.isError
  const ready = routes.data && pool.data && crews.data
  const error = routes.error ?? pool.error ?? crews.error

  return (
    <RouteBuilder
      date={date}
      onDateChange={setDate}
      routes={routes.data ?? []}
      available={pool.data ?? []}
      crews={crews.data ?? []}
      status={ready ? 'ready' : failed ? 'error' : 'loading'}
      errorMessage={error?.message}
      onRetry={() => {
        void routes.refetch()
        void pool.refetch()
        void crews.refetch()
      }}
      canBuild={canBuild}
      optimization={optimization}
      actions={actions}
    />
  )
}
