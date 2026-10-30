import { Crown } from 'lucide-react'

import { Avatar, Badge, Card, CardHeader, ColorDot } from '#/components/crm/ui'
import type { Crew } from '#/integrations/crews/crews'

/** A contractor's crew: its name, vehicle and the people in it. */
export default function MyCrew({
  me,
  crew,
  members,
  loading,
}: {
  me: { id: string }
  crew: Crew | undefined
  members: Array<{ id: string; display_name: string; color: string | null }>
  loading: boolean
}) {
  const people = crew
    ? crew.crew_members
        .map((cm) => ({
          ...cm,
          m: members.find((m) => m.id === cm.member_id),
        }))
        .filter((x) => x.m)
        .sort(
          (a, b) =>
            Number(b.is_lead) - Number(a.is_lead) ||
            a.m!.display_name.localeCompare(b.m!.display_name),
        )
    : []
  return (
    <Card className="mb-5">
      <CardHeader
        className="pb-5"
        title={
          crew ? (
            <span className="flex items-center gap-2">
              <ColorDot color={crew.color ?? '#8a8f6a'} className="size-3" />
              {crew.name}
              {crew.disabled_at && <Badge tone="gray">Inactive</Badge>}
            </span>
          ) : (
            'My crew'
          )
        }
        subtitle={
          loading
            ? 'Loading…'
            : crew
              ? [
                  `${people.length} ${people.length === 1 ? 'person' : 'people'}`,
                  crew.vehicle,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'You’re not on a crew yet. Your manager will add you to one.'
        }
      />
      {people.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-5 pb-5">
          {people.map(({ m, is_lead }) => (
            <li
              key={m!.id}
              className="flex items-center gap-2 rounded-full border border-(--line) bg-(--paper) py-1 pr-3 pl-1"
            >
              <Avatar
                name={m!.display_name}
                color={m!.color ?? undefined}
                size={26}
              />
              <span className="text-[13px] font-semibold">
                {m!.display_name}
                {m!.id === me.id && (
                  <span className="font-normal text-(--ink-3)"> (you)</span>
                )}
              </span>
              {is_lead && (
                <Crown
                  className="size-3.5 text-(--sun)"
                  aria-label="Crew lead"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
