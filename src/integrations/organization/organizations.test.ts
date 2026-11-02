import { describe, expect, it } from 'vitest'

import {
  membershipOrganization,
  membershipOrganizations,
  pickActiveOrganizationId,
} from './organizations'

const row = (role: unknown, organizations: unknown) => ({
  role,
  organizations,
})

describe('membershipOrganization', () => {
  it('maps a membership row to an organization with its permissions', () => {
    expect(
      membershipOrganization(row('dispatcher', { id: 'org-1', name: 'Acme' })),
    ).toEqual({
      id: 'org-1',
      name: 'Acme',
      role: 'dispatcher',
      permissions: [
        'manageJobs',
        'manageClients',
        'manageRequests',
        'manageCrews',
        'viewTeam',
      ],
    })
  })

  it('gives a worker no permissions', () => {
    expect(
      membershipOrganization(row('worker', { id: 'org-1', name: 'Acme' }))
        ?.permissions,
    ).toEqual([])
  })

  it('rejects malformed rows', () => {
    const org = { id: 'org-1', name: 'Acme' }
    for (const bad of [
      null,
      undefined,
      'owner',
      {},
      { organizations: org },
      row('member', org),
      row(null, org),
      { role: 'owner' },
      row('owner', null),
      row('owner', 'org-1'),
      row('owner', { name: 'Acme' }),
      row('owner', { id: '', name: 'Acme' }),
      row('owner', { id: 7, name: 'Acme' }),
      row('owner', { id: 'org-1' }),
      row('owner', { id: 'org-1', name: null }),
    ])
      expect(membershipOrganization(bad)).toBeNull()
  })
})

describe('membershipOrganizations', () => {
  it('keeps valid rows in order and drops malformed ones', () => {
    const orgs = membershipOrganizations([
      row('owner', { id: 'a', name: 'A' }),
      row('nope', { id: 'b', name: 'B' }),
      row('worker', { id: 'c', name: 'C' }),
      null,
    ])
    expect(orgs.map((o) => [o.id, o.role])).toEqual([
      ['a', 'owner'],
      ['c', 'worker'],
    ])
  })
})

describe('pickActiveOrganizationId', () => {
  const orgs = [{ id: 'a' }, { id: 'b' }]

  it('reopens the saved organization when the user still belongs to it', () => {
    expect(pickActiveOrganizationId(orgs, 'b')).toBe('b')
  })

  it('falls back to the first membership when the saved one is gone', () => {
    expect(pickActiveOrganizationId(orgs, 'gone')).toBe('a')
  })

  it('falls back to the first membership when nothing was saved', () => {
    expect(pickActiveOrganizationId(orgs, null)).toBe('a')
  })

  it('picks nothing without memberships', () => {
    expect(pickActiveOrganizationId([], 'a')).toBeNull()
    expect(pickActiveOrganizationId([], null)).toBeNull()
  })
})
