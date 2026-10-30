import { useState } from 'react'
import { Crown, GripVertical, Plus, Trash2, Truck, Users } from 'lucide-react'

import { Avatar, Badge, Btn, ColorDot, Modal } from '#/components/crm/ui'
import { KIND_LABEL, monthDay } from './availability-utils'
import type { Away } from './availability-utils'
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
  createCrew: (name: string, color: string) => Promise<{ id: string }>
  renameCrew: (crewId: string, name: string) => void
  setVehicle: (crewId: string, vehicle: string | null) => void
  moveMember: (memberId: string, crewId: string | null) => void
  setLead: (crewId: string, memberId: string | null) => void
  /** Resolves false when the delete failed (the error is already shown). */
  deleteCrew: (crewId: string) => Promise<boolean>
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
  away,
}: {
  m: TeamMember
  crewLead?: boolean
  editable: boolean
  away?: Away
}) {
  return (
    <div
      draggable={editable}
      onDragStart={(e) => e.dataTransfer.setData('text/member-id', m.id)}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-(--line) p-2',
        away ? 'bg-(--cream) text-(--ink-3)' : 'bg-(--paper)',
        editable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {editable && <GripVertical className="size-4 shrink-0 text-(--ink-3)" />}
      <span className={cn('shrink-0', away && 'opacity-50 grayscale')}>
        <Avatar name={m.display_name} color={m.color ?? undefined} size={30} />
      </span>
      <p
        className="min-w-0 flex-1 truncate text-[13px] font-bold"
        title={m.display_name}
      >
        {m.display_name}
        {crewLead && (
          <Crown
            className="ml-1 inline size-3.5 align-[-2px] text-(--sun)"
            aria-label="Crew lead"
          />
        )}
      </p>
      {away && (
        <span
          className="shrink-0 text-[11px] font-semibold whitespace-nowrap"
          title={`${KIND_LABEL[away.kind]}${away.returns ? `, back ${monthDay(away.returns)}` : ''}`}
        >
          {away.returns ? `Returns ${monthDay(away.returns)}` : 'Away'}
        </span>
      )}
      {m.role !== 'worker' && (
        // Contractors are the norm here; only flag office staff placed in a crew.
        <Badge tone={m.role === 'owner' ? 'dark' : 'lime'}>
          {ROLE_LABEL[m.role]}
        </Badge>
      )}
    </div>
  )
}

function CrewColumn({
  crew,
  members,
  editable,
  actions,
  focusName,
  away,
}: {
  crew: LocalCrew | null
  members: Array<TeamMember>
  editable: boolean
  actions: CrewActions
  focusName?: boolean
  away: Map<string, Away>
}) {
  const [over, setOver] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const out = members.filter((m) => away.has(m.id)).length

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
                  autoFocus={focusName}
                  onFocus={(e) => focusName && e.target.select()}
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
              {out > 0 && <span>{out} out today</span>}
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-bold">Unassigned</p>
            <p className="mt-1 text-xs text-(--ink-3)">
              Active contractors not in a crew. Drag them onto one.
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
            away={away.get(m.id)}
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
          <Btn
            variant="ghost"
            size="sm"
            icon={Trash2}
            className="w-full justify-center text-(--clay)"
            onClick={() => setConfirming(true)}
          >
            Delete crew
          </Btn>
        </div>
      )}
      {crew && confirming && (
        <Modal
          open
          onClose={() => setConfirming(false)}
          title={`Delete ${crew.name}?`}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Btn>
              <Btn
                variant="danger"
                icon={Trash2}
                disabled={deleting}
                onClick={() => {
                  setDeleting(true)
                  void actions.deleteCrew(crew.id).then((ok) => {
                    setDeleting(false)
                    if (ok) setConfirming(false)
                  })
                }}
              >
                {deleting ? 'Deleting…' : 'Delete crew'}
              </Btn>
            </>
          }
        >
          <p className="text-sm text-(--ink-2)">
            {members.length > 0
              ? `${members.length === 1 ? 'Its 1 member moves' : `Its ${members.length} members move`} to Unassigned. `
              : ''}
            Past routes for this crew keep their history.
          </p>
        </Modal>
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
  away = new Map(),
}: {
  members: Array<TeamMember>
  crews: Array<Crew> | undefined
  crewsLoading: boolean
  crewsError: { message: string } | null
  editable: boolean
  actions: CrewActions
  /** Members on approved time off today, by member id. */
  away?: Map<string, Away>
}) {
  const [creating, setCreating] = useState(false)
  const [newCrewId, setNewCrewId] = useState<string | null>(null)
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

  // Only active contractors can be placed: invited or disabled people and
  // office staff stay off the board.
  const unassigned = members.filter(
    (m) =>
      m.role === 'worker' &&
      m.status === 'active' &&
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
            if (creating) return
            const taken = new Set(localCrews.map((c) => c.name.toLowerCase()))
            let crewName = 'New crew'
            for (let n = 2; taken.has(crewName.toLowerCase()); n++) {
              crewName = `New crew ${n}`
            }
            setCreating(true)
            actions
              .createCrew(
                crewName,
                CREW_COLORS[localCrews.length % CREW_COLORS.length],
              )
              .then((created) => setNewCrewId(created.id))
              .catch(() => undefined)
              .finally(() => setCreating(false))
          }}
        >
          <Btn type="submit" variant="outline" icon={Plus} disabled={creating}>
            Create crew
          </Btn>
          <p className="text-xs text-(--ink-3)">
            Create a crew, then name it and drag people into it. Each crew gets
            a lead and a vehicle.
          </p>
        </form>
      )}
      <div className="crm-scroll flex gap-4 overflow-x-auto pb-3">
        <CrewColumn
          crew={null}
          members={unassigned}
          editable={editable}
          actions={actions}
          away={away}
        />
        {localCrews.map((c) => (
          <CrewColumn
            key={c.id}
            crew={c}
            focusName={c.id === newCrewId}
            members={crewMembers(c)}
            editable={editable}
            actions={actions}
            away={away}
          />
        ))}
      </div>
    </div>
  )
}
