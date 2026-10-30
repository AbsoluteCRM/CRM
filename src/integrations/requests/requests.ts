import { useQuery } from '@tanstack/react-query'

import { useOrganization } from '#/integrations/organization/context'
import { can } from '#/integrations/organization/permissions'
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

/**
 * New (submitted) requests for the active company, for the header and sidebar
 * badges. Shares the Requests page's query, so status changes there update it.
 * Zero for roles that can't see requests.
 */
export function useNewRequests() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const enabled = organization !== null && can.manageRequests(organization.role)
  const requests = useQuery({
    ...trpc.requests.list.queryOptions({
      organizationId: organization?.id ?? '',
    }),
    enabled,
    retry: false,
    refetchInterval: 60_000,
  })
  const fresh = enabled
    ? (requests.data ?? []).filter((r) => r.status === 'submitted')
    : []
  return { count: fresh.length, latest: fresh.slice(0, 5) }
}
