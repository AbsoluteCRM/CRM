import { useState } from 'react'
import { Users } from 'lucide-react'

import {
  Avatar,
  Badge,
  Card,
  ColorDot,
  EmptyState,
  SearchInput,
  SelectInput,
  StatusBadge,
} from '#/components/crm/ui'
import type { Crew } from '#/integrations/crews/crews'
import type { TeamMember } from '#/integrations/teams/teams'

type Sort = 'crew' | 'status' | 'name'
const STATUS_ORDER: Array<TeamMember['status']> = [
  'active',
  'invited',
  'disabled',
]

/** The contractors who work jobs, with their crew. Office staff aren't listed. */
export default function MembersTab({
  members,
  crews = [],
  isLoading,
  error,
}: {
  members: Array<TeamMember>
  crews?: Array<
    Pick<Crew, 'id' | 'name' | 'color' | 'disabled_at' | 'crew_members'>
  >
  isLoading: boolean
  error: Error | null
}) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('crew')
  const crewOf = (id: string) =>
    crews.find((c) => c.crew_members.some((cm) => cm.member_id === id))
  const byName = (a: TeamMember, b: TeamMember) =>
    a.display_name.localeCompare(b.display_name)
  const rows = members
    .filter(
      (m) =>
        m.role === 'worker' &&
        `${m.display_name} ${m.email ?? ''} ${crewOf(m.id)?.name ?? ''}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    )
    .sort((a, b) => {
      if (sort === 'status') {
        return (
          STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
          byName(a, b)
        )
      }
      if (sort === 'crew') {
        // People without a crew go last.
        const ca = crewOf(a.id)?.name ?? '\uffff'
        const cb = crewOf(b.id)?.name ?? '\uffff'
        return ca.localeCompare(cb) || byName(a, b)
      }
      return byName(a, b)
    })
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-(--line) p-4">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search contractors or crews"
          className="w-full sm:w-72"
        />
        <SelectInput
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="w-44"
          aria-label="Sort by"
        >
          <option value="crew">Sort: Crew</option>
          <option value="status">Sort: Status</option>
          <option value="name">Sort: Name</option>
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
          title="No contractors found"
          body={
            q
              ? 'Try a different search.'
              : 'Invite contractors to see them here.'
          }
        />
      ) : (
        <div className="crm-scroll overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs font-semibold tracking-wide text-(--ink-3) uppercase">
                <th className="px-5 py-3">Name</th>
                <th className="px-3 py-3">Crew</th>
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
                    <CrewCell crew={crewOf(m.id)} />
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

function CrewCell({
  crew,
}: {
  crew?: { name: string; color: string | null; disabled_at: string | null }
}) {
  if (!crew) return <span className="text-(--ink-3)">Unassigned</span>
  return (
    <span className="flex items-center gap-2">
      <ColorDot color={crew.color ?? '#8a8f6a'} />
      <span className="font-semibold">{crew.name}</span>
      {crew.disabled_at && <Badge tone="gray">Inactive</Badge>}
    </span>
  )
}
