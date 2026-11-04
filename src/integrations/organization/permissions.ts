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

/** UI labels for `org_role`. */
export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Manager',
  dispatcher: 'Dispatcher',
  worker: 'Contractor',
}

export const ROLE_DESCRIPTION: Record<OrgRole, string> = {
  owner: 'Full access, including billing and subscription.',
  admin: 'Manages jobs, crews, clients, and services.',
  dispatcher: 'Schedules and dispatches jobs and requests.',
  worker: 'Sees and completes the jobs assigned to their crew.',
}

/**
 * What each role may see or do in the UI. The server checks permissions on
 * its own; these only decide what the UI offers.
 */
export const can = {
  viewRevenue: (r: OrgRole) => r === 'owner' || r === 'admin',
  manageJobs: (r: OrgRole) => r !== 'worker',
  manageClients: (r: OrgRole) => r !== 'worker',
  manageRequests: (r: OrgRole) => r !== 'worker',
  manageCrews: (r: OrgRole) => r !== 'worker',
  manageServices: (r: OrgRole) => r === 'owner' || r === 'admin',
  manageServiceAreas: (r: OrgRole) => r === 'owner' || r === 'admin',
  // Coverage counts properties, which only office staff can read under RLS.
  viewServiceAreaCoverage: (r: OrgRole) => r !== 'worker',
  manageTeam: (r: OrgRole) => r === 'owner' || r === 'admin',
  viewTeam: (r: OrgRole) => r !== 'worker',
  manageSettings: (r: OrgRole) => r === 'owner' || r === 'admin',
  manageBilling: (r: OrgRole) => r === 'owner',
}

export type Permission = keyof typeof can

/** Whether `role` has `permission`. No role (loading, or no active org) has none. */
export function roleCan(role: OrgRole | null, permission: Permission) {
  return role !== null && can[permission](role)
}

/** The permissions `role` holds, in declaration order. */
export function permissionsFor(role: OrgRole): Array<Permission> {
  return (Object.keys(can) as Array<Permission>).filter((p) => can[p](role))
}

export type Section =
  | 'dashboard'
  | 'calendar'
  | 'requests'
  | 'jobs'
  | 'clients'
  | 'teams'
  | 'services'
  | 'settings'
  | 'route-builder'

/** Whether `role` sees a section in the navigation. No role sees none. */
export function canSee(role: OrgRole | null, section: Section) {
  if (role === null) return false
  if (role !== 'worker') return true
  return (
    section === 'dashboard' ||
    section === 'calendar' ||
    section === 'jobs' ||
    section === 'teams'
  )
}

export interface RoleAccess {
  role: OrgRole | null
  can: (permission: Permission) => boolean
  canSee: (section: Section) => boolean
}

/** Permission checks for a role; with no role, every check is false. */
export function roleAccess(role: OrgRole | null): RoleAccess {
  return {
    role,
    can: (permission) => roleCan(role, permission),
    canSee: (section) => canSee(role, section),
  }
}
