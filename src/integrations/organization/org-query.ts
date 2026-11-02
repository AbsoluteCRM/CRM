import type { QueryClient, QueryKey } from '@tanstack/react-query'

import { useActiveOrgId } from './use-role'

/**
 * The active organization as tRPC input for an org-scoped query. `enabled` is
 * false while there is no active organization, so the placeholder id in
 * `input` is never sent.
 */
export function useOrgScope() {
  const organizationId = useActiveOrgId()
  return {
    organizationId,
    enabled: organizationId !== undefined,
    input: { organizationId: organizationId ?? '' },
  }
}

/**
 * Shared options for a mutation that edits a cached list: mutations with the
 * same scope run one at a time, and the list refetches when each settles so
 * the cache ends on the server's truth.
 */
export function settleList(
  queryClient: QueryClient,
  queryKey: QueryKey,
  scope: string,
) {
  return {
    scope: { id: scope },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  }
}
