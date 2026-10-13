import { useState } from 'react'
import { Users } from 'lucide-react'

import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  SearchInput,
  SelectInput,
  StatusBadge,
} from '#/components/crm/ui'
import type { TeamMember } from '#/integrations/teams/teams'
import type { OrgRole } from '#/components/crm/types'

// Kept local so the component (and its story) doesn't pull in the env-validating org context via the mock store.
const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Manager',
  dispatcher: 'Dispatcher',
  worker: 'Contractor',
}

export default function MembersTab({
  members,
  isLoading,
  error,
}: {
  members: Array<TeamMember>
  isLoading: boolean
  error: Error | null
}) {
  const [q, setQ] = useState('')
  const [role, setRole] = useState<'all' | OrgRole>('all')
  const order: Array<OrgRole> = ['owner', 'admin', 'dispatcher', 'worker']
  const rows = members
    .filter(
      (m) =>
        (role === 'all' || m.role === role) &&
        `${m.display_name} ${m.email ?? ''}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    )
    .sort(
      (a, b) =>
        order.indexOf(a.role) - order.indexOf(b.role) ||
        a.display_name.localeCompare(b.display_name),
    )
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-(--line) p-4">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search team"
          className="w-full sm:w-72"
        />
        <SelectInput
          value={role}
          onChange={(e) => setRole(e.target.value as 'all' | OrgRole)}
          className="w-44"
          aria-label="Role"
        >
          <option value="all">All roles</option>
          {(Object.keys(ROLE_LABEL) as Array<OrgRole>).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </SelectInput>
      </div>
      {error ? (
        <p role="alert" className="p-5 text-sm text-red-600">
          Couldn&apos;t load the team: {error.message}
        </p>
      ) : isLoading ? (
        <p className="p-5 text-sm text-(--ink-3)">Loading team...</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No team members found"
          body="Try a different search or role filter."
        />
      ) : (
        <div className="crm-scroll overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
                <th className="px-5 py-3">Name</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-5 py-3">Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-(--line)">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={m.display_name}
                        color={m.color ?? undefined}
                        size={36}
                      />
                      <p className="font-bold">{m.display_name}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      tone={
                        m.role === 'owner'
                          ? 'dark'
                          : m.role === 'worker'
                            ? 'gray'
                            : 'lime'
                      }
                    >
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-5 py-3">
                    <p>{m.email ?? '—'}</p>
                    <p className="text-xs text-(--ink-3)">{m.phone ?? ''}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
