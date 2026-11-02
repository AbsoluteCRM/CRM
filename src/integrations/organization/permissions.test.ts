import { describe, expect, it } from 'vitest'

import {
  can,
  canSee,
  isOrgRole,
  permissionsFor,
  roleAccess,
  roleCan,
} from './permissions'

import type { OrgRole, Permission, Section } from './permissions'

const ROLES: Array<OrgRole> = ['owner', 'admin', 'dispatcher', 'worker']
const SECTIONS: Array<Section> = [
  'dashboard',
  'calendar',
  'requests',
  'jobs',
  'clients',
  'teams',
  'services',
  'settings',
  'route-builder',
]

describe('isOrgRole', () => {
  it('accepts the four org roles and nothing else', () => {
    for (const role of ROLES) expect(isOrgRole(role)).toBe(true)
    for (const value of ['Owner', 'member', '', null, undefined, 1, {}])
      expect(isOrgRole(value)).toBe(false)
  })
})

describe('permissionsFor', () => {
  it('gives each role its permissions', () => {
    expect(permissionsFor('owner')).toEqual(Object.keys(can))
    expect(permissionsFor('admin')).toEqual(
      Object.keys(can).filter((p) => p !== 'manageBilling'),
    )
    expect(permissionsFor('dispatcher')).toEqual([
      'manageJobs',
      'manageClients',
      'manageRequests',
      'manageCrews',
      'viewTeam',
    ])
    expect(permissionsFor('worker')).toEqual([])
  })
})

describe('roleCan', () => {
  it('matches can for every role and permission', () => {
    for (const role of ROLES)
      for (const permission of Object.keys(can) as Array<Permission>)
        expect(roleCan(role, permission)).toBe(can[permission](role))
  })

  it('denies everything without a role', () => {
    for (const permission of Object.keys(can) as Array<Permission>)
      expect(roleCan(null, permission)).toBe(false)
  })
})

describe('canSee', () => {
  it('shows every section to non-workers', () => {
    for (const role of ['owner', 'admin', 'dispatcher'] as const)
      for (const section of SECTIONS) expect(canSee(role, section)).toBe(true)
  })

  it('shows workers only the dashboard, calendar and jobs', () => {
    expect(SECTIONS.filter((s) => canSee('worker', s))).toEqual([
      'dashboard',
      'calendar',
      'jobs',
    ])
  })

  it('shows nothing without a role', () => {
    for (const section of SECTIONS) expect(canSee(null, section)).toBe(false)
  })
})

describe('roleAccess', () => {
  it('binds the checks to the role', () => {
    const owner = roleAccess('owner')
    expect(owner.role).toBe('owner')
    expect(owner.can('manageBilling')).toBe(true)
    expect(owner.canSee('settings')).toBe(true)

    const worker = roleAccess('worker')
    expect(worker.can('manageJobs')).toBe(false)
    expect(worker.canSee('jobs')).toBe(true)
    expect(worker.canSee('clients')).toBe(false)
  })

  it('gates closed without a role', () => {
    const none = roleAccess(null)
    expect(none.role).toBeNull()
    expect(none.can('viewTeam')).toBe(false)
    expect(none.canSee('dashboard')).toBe(false)
  })
})
