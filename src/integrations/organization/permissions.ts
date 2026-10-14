import type { Database } from '#/types/database'

export type OrgRole = Database['public']['Enums']['org_role']

export function isOrgRole(role: unknown): role is OrgRole {
  return (
    role === 'owner' ||
    role === 'admin' ||
    role === 'dispatcher' ||
    role === 'worker'
  )
}

export const can = {
  viewRevenue: (r: OrgRole) => r === 'owner' || r === 'admin',
  manageJobs: (r: OrgRole) => r !== 'worker',
  manageClients: (r: OrgRole) => r !== 'worker',
  manageRequests: (r: OrgRole) => r !== 'worker',
  manageCrews: (r: OrgRole) => r !== 'worker',
  manageServices: (r: OrgRole) => r === 'owner' || r === 'admin',
  manageTeam: (r: OrgRole) => r === 'owner' || r === 'admin',
  viewTeam: (r: OrgRole) => r !== 'worker',
  manageSettings: (r: OrgRole) => r === 'owner' || r === 'admin',
  manageBilling: (r: OrgRole) => r === 'owner',
}
