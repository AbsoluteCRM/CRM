import { useState } from 'react'
import { Crown, GripVertical, Plus, Truck, Users } from 'lucide-react'

import {
  Avatar,
  Badge,
  Btn,
  ColorDot,
  StatusBadge,
  TextInput,
  toast,
} from '#/components/crm/ui'
import type { OrgRole } from '#/components/crm/types'
import type { Crew } from '#/integrations/crews/crews'
import type { TeamMember } from '#/integrations/teams/teams'
import { cn } from '#/lib/utils'

// Kept local so the component (and its story) doesn't pull in the env-validating org context via the mock store.
const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Manager',
  dispatcher: 'Dispatcher',
  worker: 'Contractor',
}

const CREW_COLORS = [
  '#7fb547',
  '#5b9bc4',
  '#e0a03c',
  '#b0759c',
  '#8a8f6a',
  '#4fa3a5',
  '#d9734e',
]

type LocalCrew = {
  id: string
  name: string
  color: string | null
  vehicle: string | null
  memberIds: Array<string>
  leadId: string | null
}

export type CrewActions = {
  createCrew: (name: string, color: string) => Promise<unknown>
  renameCrew: (crewId: string, name: string) => void
  setVehicle: (crewId: string, vehicle: string | null) => void
  moveMember: (memberId: string, crewId: string | null) => void
  setLead: (crewId: string, memberId: string | null) => void
}

const toLocalCrew = (c: Crew): LocalCrew => ({
  id: c.id,
  name: c.name,
  color: c.color,
  vehicle: c.vehicle,
  memberIds: c.crew_members.map((cm) => cm.member_id),
  leadId: c.crew_members.find((cm) => cm.is_lead)?.member_id ?? null,
})

function MemberCard({
  m,
  crewLead,
  editable,
}: {
  m: TeamMember
  crewLead?: boolean
  editable: boolean
}) {
  return (
    <div
      draggable={editable}
      onDragStart={(e) => e.dataTransfer.setData('text/member-id', m.id)}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-(--line) bg-(--paper) p-2',
        editable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {editable && <GripVertical className="size-4 shrink-0 text-(--ink-3)" />}
      <Avatar name={m.display_name} color={m.color ?? undefined} size={30} />
      <p className="flex min-w-0 flex-1 items-center gap-1 truncate text-[13px] font-bold">
        {m.display_name}
        {crewLead && (
          <Crown className="size-3.5 text-(--sun)" aria-label="Crew lead" />
        )}
      </p>
      <Badge
        tone={
          m.role === 'owner' ? 'dark' : m.role === 'worker' ? 'gray' : 'lime'
        }
      >
        {ROLE_LABEL[m.role]}
      </Badge>
      <StatusBadge status={m.status} />
    </div>
  )
}

function CrewColumn({
  crew,
  members,
  editable,
  actions,
}: {
  crew: LocalCrew | null
  members: Array<TeamMember>
  editable: boolean
  actions: CrewActions
}) {
  const [over, setOver] = useState(false)

  return (
    <div
      onDragOver={(e) => {
        if (editable && e.dataTransfer.types.includes('text/member-id')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData('text/member-id')
        if (!id) return
        actions.moveMember(id, crew?.id ?? null)
      }}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-[22px] border p-3 transition-colors',
        crew
          ? 'border-(--line) bg-(--paper)'
          : 'border-dashed border-(--line-2) bg-(--cream)',
        over && 'border-(--leaf-500) bg-(--lime-100)',
      )}
    >
      <div className="mb-3 px-1">
        {crew ? (
          <>
            <div className="flex items-center gap-2">
              <ColorDot
                color={crew.color ?? CREW_COLORS[4]}
                className="size-3"
              />
              {editable ? (
                <input
                  key={crew.name}
                  defaultValue={crew.name}
                  aria-label="Crew name"
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value !== crew.name &&
                    actions.renameCrew(crew.id, e.target.value.trim())
                  }
                  className="min-w-0 flex-1 rounded-md bg-transparent px-1 text-[15px] font-bold outline-none focus:bg-(--cream)"
                />
              ) : (
                <p className="text-[15px] font-bold">{crew.name}</p>
              )}
            </div>
            <p className="mt-1 flex items-center gap-3 px-1 text-xs text-(--ink-3)">
              <span className="flex items-center gap-1">
                <Users className="size-3" /> {members.length}
              </span>
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold">Unassigned</p>
            <p className="mt-1 text-xs text-(--ink-3)">
              Drag people onto a crew
            </p>
          </>
        )}
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {members.map((m) => (
          <MemberCard
            key={m.id}
            m={m}
            crewLead={crew?.leadId === m.id}
            editable={editable}
          />
        ))}
        {members.length === 0 && (
          <p className="rounded-xl border border-dashed border-(--line-2) px-3 py-6 text-center text-xs text-(--ink-3)">
            Drop team members here
          </p>
        )}
      </div>
      {crew && editable && (
        <div className="mt-3 space-y-2 border-t border-(--line) pt-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-(--ink-3)">
            <Crown className="size-3.5" />
            <select
              value={crew.leadId ?? ''}
              onChange={(e) => actions.setLead(crew.id, e.target.value || null)}
              className="flex-1 cursor-pointer rounded-lg bg-(--cream) px-2 py-1.5 text-[13px] text-(--ink) outline-none"
              aria-label="Crew lead"
            >
              <option value="">No lead</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-(--ink-3)">
            <Truck className="size-3.5" />
            <input
              key={crew.vehicle ?? ''}
              defaultValue={crew.vehicle ?? ''}
              placeholder="Assign a vehicle"
              aria-label="Crew vehicle"
              onBlur={(e) =>
                e.target.value !== (crew.vehicle ?? '') &&
                actions.setVehicle(crew.id, e.target.value.trim() || null)
              }
              className="flex-1 rounded-lg bg-(--cream) px-2 py-1.5 text-[13px] text-(--ink) outline-none"
            />
          </label>
        </div>
      )}
    </div>
  )
}

export default function CrewBuilder({
  members,
  crews,
  crewsLoading,
  crewsError,
  editable,
  actions,
}: {
  members: Array<TeamMember>
  crews: Array<Crew> | undefined
  crewsLoading: boolean
  crewsError: { message: string } | null
  editable: boolean
  actions: CrewActions
}) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const localCrews = (crews ?? []).map(toLocalCrew)

  if (crewsError) {
    return (
      <p role="alert" className="p-5 text-sm text-red-600">
        Couldn&apos;t load the crews: {crewsError.message}
      </p>
    )
  }
  if (crewsLoading) {
    return <p className="p-5 text-sm text-(--ink-3)">Loading crews…</p>
  }

  const unassigned = members.filter(
    (m) =>
      m.status !== 'disabled' &&
      !localCrews.some((c) => c.memberIds.includes(m.id)),
  )
  const crewMembers = (c: LocalCrew) =>
    c.memberIds
      .map((id) => members.find((m) => m.id === id))
      .filter((m): m is TeamMember => !!m)

  return (
    <div>
      {editable && (
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const crewName = name.trim()
            if (!crewName || creating) return
            setCreating(true)
            actions
              .createCrew(
                crewName,
                CREW_COLORS[localCrews.length % CREW_COLORS.length],
              )
              .then(() => {
                toast(`${crewName} created`)
                setName('')
              })
              .catch(() => undefined)
              .finally(() => setCreating(false))
          }}
        >
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New crew name, e.g. Crew F"
            className="w-64"
            aria-label="New crew name"
          />
          <Btn
            type="submit"
            variant="outline"
            icon={Plus}
            disabled={!name.trim() || creating}
          >
            Create crew
          </Btn>
          <p className="text-xs text-(--ink-3)">
            Drag people between columns to build crews. Each crew gets a lead
            and a vehicle.
          </p>
        </form>
      )}
      <div className="crm-scroll flex gap-4 overflow-x-auto pb-3">
        <CrewColumn
          crew={null}
          members={unassigned}
          editable={editable}
          actions={actions}
        />
        {localCrews.map((c) => (
          <CrewColumn
            key={c.id}
            crew={c}
            members={crewMembers(c)}
            editable={editable}
            actions={actions}
          />
        ))}
      </div>
    </div>
  )
}
