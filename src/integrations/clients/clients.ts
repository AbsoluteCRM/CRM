import { useQuery } from '@tanstack/react-query'

import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'

export function useClients() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id

  return useQuery({
    ...trpc.clients.list.queryOptions({ organizationId: organizationId! }),
    enabled: organizationId !== undefined,
  })
}
