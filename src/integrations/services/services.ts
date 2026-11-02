import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import { toast } from '#/lib/toast'
import type { Service } from '#/integrations/services/types'
import { settleList, useOrgScope } from '#/integrations/organization/org-query'
import { useTRPC } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'

type ServiceRow = inferRouterOutputs<TRPCRouter>['services']['list'][number]
export type ServiceInput = Omit<
  inferRouterInputs<TRPCRouter>['services']['create'],
  'organizationId'
>

export function toService(row: ServiceRow): Service {
  const { season_start_month: start, season_end_month: end } = row
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description ?? '',
    unit: row.unit,
    default_price_cents: row.default_price_cents,
    default_duration_minutes: row.default_duration_minutes ?? 60,
    is_active: row.archived_at === null,
    color: row.color,
    equipment: row.equipment,
    frequencies: row.frequencies,
    precipitation_type: row.precipitation_type,
    precipitation_action: row.precipitation_action,
    season: start !== null && end !== null ? { start, end } : null,
  }
}

export const toSeasonColumns = (season: Service['season']) => ({
  season_start_month: season?.start ?? null,
  season_end_month: season?.end ?? null,
})

export function useServices() {
  const trpc = useTRPC()
  const { input, enabled } = useOrgScope()

  return useQuery({
    ...trpc.services.list.queryOptions(input),
    enabled,
    select: (rows) => rows.map(toService),
  })
}

export function useServiceMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { input: base } = useOrgScope()
  const settle = settleList(
    queryClient,
    trpc.services.list.queryKey(base),
    'services',
  )

  const create = useMutation(
    trpc.services.create.mutationOptions({
      ...settle,
      onError: (e) => toast(`Couldn't add the service: ${e.message}`),
    }),
  )
  const update = useMutation(
    trpc.services.update.mutationOptions({
      ...settle,
      onError: (e) => toast(`Couldn't save the service: ${e.message}`),
    }),
  )
  const setArchived = useMutation(
    trpc.services.setArchived.mutationOptions({
      ...settle,
      onError: (e) => toast(`Couldn't update the service: ${e.message}`),
    }),
  )

  return {
    createService: (input: ServiceInput) =>
      create.mutateAsync({ ...base, ...input }),
    updateService: (id: string, patch: Partial<ServiceInput>) =>
      update.mutateAsync({ ...base, id, ...patch }),
    setActive: (id: string, active: boolean) =>
      setArchived.mutateAsync({ ...base, id, archived: !active }),
    saving: create.isPending || update.isPending || setArchived.isPending,
  }
}
