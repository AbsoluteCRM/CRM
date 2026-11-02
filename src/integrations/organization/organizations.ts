/**
 * Pure helpers behind OrganizationProvider: parsing membership rows and
 * choosing the active organization. Kept free of React and Supabase so they
 * can be unit tested.
 */
import { isOrgRole, permissionsFor } from './permissions'

import type { OrgRole } from './permissions'

export interface Organization {
  id: string
  name: string
  role: OrgRole
  permissions: Array<string>
}

/**
 * Turns one `organization_members` row (with its joined `organizations`)
 * into an Organization, or null when the row is malformed or the role is
 * unknown.
 */
export function membershipOrganization(row: unknown): Organization | null {
  if (typeof row !== 'object' || row === null || !('role' in row)) return null
  if (!isOrgRole(row.role) || !('organizations' in row)) return null
  const org = row.organizations
  if (
    typeof org !== 'object' ||
    org === null ||
    !('id' in org) ||
    typeof org.id !== 'string' ||
    !org.id ||
    !('name' in org) ||
    typeof org.name !== 'string'
  ) {
    return null
  }
  const role = row.role
  return {
    id: org.id,
    name: org.name,
    role,
    permissions: permissionsFor(role),
  }
}

/** Parses membership rows, dropping any that are malformed. */
export function membershipOrganizations(
  rows: ReadonlyArray<unknown>,
): Array<Organization> {
  return rows
    .map(membershipOrganization)
    .filter((org): org is Organization => org !== null)
}

/**
 * The organization to open: the saved one if the user still belongs to it,
 * otherwise the first membership, otherwise none.
 */
export function pickActiveOrganizationId(
  organizations: ReadonlyArray<Pick<Organization, 'id'>>,
  savedId: string | null,
): string | null {
  return (
    organizations.find((org) => org.id === savedId)?.id ??
    organizations.at(0)?.id ??
    null
  )
}
