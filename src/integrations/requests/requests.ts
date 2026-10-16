import { useQuery } from '@tanstack/react-query'

import { useTRPC } from '#/integrations/trpc/react'

export function useRequests(
  organizationId: string | undefined,
  canView: boolean,
) {
  const trpc = useTRPC()
  const enabled = canView && organizationId !== undefined
  const input = { organizationId: organizationId ?? '' }

  const requests = useQuery({
    ...trpc.requests.list.queryOptions(input),
    enabled,
    retry: false,
  })
  const services = useQuery({
    ...trpc.services.list.queryOptions(input),
    enabled,
    retry: false,
  })

  return { requests, services }
}
