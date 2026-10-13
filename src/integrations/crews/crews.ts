import { useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'

import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'

export type Crew = inferRouterOutputs<TRPCRouter>['crews']['list'][number]

export function useCrews() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id

  return useQuery({
    ...trpc.crews.list.queryOptions({ organizationId: organizationId! }),
    enabled: organizationId !== undefined,
  })
}
