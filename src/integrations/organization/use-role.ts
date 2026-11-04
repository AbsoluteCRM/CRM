import { useOrganization } from './context'
import { roleAccess } from './permissions'

import type { RoleAccess } from './permissions'

/**
 * The signed-in user's role in the active organization, from
 * `organization_members.role`. `role` is null while organizations load or when
 * there is no active organization, so the UI gates closed until it is known.
 */
export function useRole(): RoleAccess {
  return roleAccess(useOrganization().organization?.role ?? null)
}

/** The active organization's id, or undefined while loading or with none. */
export function useActiveOrgId(): string | undefined {
  return useOrganization().organization?.id
}
