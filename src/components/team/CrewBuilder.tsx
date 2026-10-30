import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Crown,
  GripVertical,
  Plus,
  Power,
  Trash2,
  Truck,
  Users,
} from 'lucide-react'

import {
  Avatar,
  Badge,
  Btn,
  ColorDot,
  Field,
  Modal,
  TextInput,
} from '#/components/crm/ui'
import { KIND_LABEL, monthDay } from './availability-utils'
import type { Away } from './availability-utils'
import type { OrgRole } from '#/components/crm/types'
import type {
  ArchivedCrew,
  Crew,
  CrewHistory,
} from '#/integrations/crews/crews'
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
  inactive: boolean
}

export type CrewActions = {
  createCrew: (name: string, color: string) => Promise<{ id: string }>
  renameCrew: (crewId: string, name: string) => void
  setVehicle: (crewId: string, vehicle: string | null) => void
  moveMember: (memberId: string, crewId: string | null) => void
  setLead: (crewId: string, memberId: string | null) => void
  setCrewActive: (crewId: string, active: boolean) => void
  // These resolve false when the change failed (the error is already shown).
  archiveCrew: (crewId: string) => Promise<boolean>
  restoreCrew: (crewId: string) => Promise<boolean>
  /** Permanent: removes the crew and its routes. */
  deleteCrew: (crewId: string) => Promise<boolean>
  crewHistory: (crewId: string) => Promise<CrewHistory>
}

const toLocalCrew = (c: Crew): LocalCrew => ({
  id: c.id,
  name: c.name,
  color: c.color,
  vehicle: c.vehicle,
  memberIds: c.crew_members.map((cm) => cm.member_id),
  leadId: c.crew_members.find((cm) => cm.is_lead)?.member_id ?? null,
  inactive: c.disabled_at !== null,
})

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

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
  const [confirming, setConfirming] = useState<'archive' | 'delete' | null>(
    null,
  )
  const out = members.filter((m) => away.has(m.id)).length
  const droppable = editable && !crew?.inactive

  return (
    <div
      onDragOver={(e) => {
        if (droppable && e.dataTransfer.types.includes('text/member-id')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData('text/member-id')
        if (!id || !droppable) return
        actions.moveMember(id, crew?.id ?? null)
      }}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-[22px] border p-3 transition-colors',
        !crew
          ? 'border-dashed border-(--line-2) bg-(--cream)'
          : crew.inactive
            ? 'border-(--line) bg-(--cream)'
            : 'border-(--line) bg-(--paper)',
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
              {crew.inactive && <Badge tone="gray">Inactive</Badge>}
            </div>
            <p className="mt-1 flex items-center gap-3 px-1 text-xs text-(--ink-3)">
              <span className="flex items-center gap-1">
                <Users className="size-3" /> {members.length}
              </span>
              {out > 0 && <span>{out} out today</span>}
              {crew.inactive && <span>Takes no new routes</span>}
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
            {crew?.inactive ? 'No members' : 'Drop team members here'}
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
          <div className="grid grid-cols-3 gap-1">
            <Btn
              variant="ghost"
              size="sm"
              icon={Power}
              className="justify-center"
              title={
                crew.inactive
                  ? 'Make this crew active again'
                  : 'Keep the crew and its history, but stop new routes'
              }
              onClick={() => actions.setCrewActive(crew.id, crew.inactive)}
            >
              {crew.inactive ? 'Activate' : 'Disable'}
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              icon={Archive}
              className="justify-center"
              title="Hide the crew; restore it any time"
              onClick={() => setConfirming('archive')}
            >
              Archive
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              icon={Trash2}
              className="justify-center text-(--clay)"
              title="Delete the crew and its routes for good"
              onClick={() => setConfirming('delete')}
            >
              Delete
            </Btn>
          </div>
        </div>
      )}
      {crew && confirming === 'archive' && (
        <ArchiveCrewModal
          crew={crew}
          memberCount={members.length}
          actions={actions}
          onClose={() => setConfirming(null)}
        />
      )}
      {crew && confirming === 'delete' && (
        <DeleteCrewModal
          crew={crew}
          memberCount={members.length}
          actions={actions}
          onClose={() => setConfirming(null)}
          onArchive={() => setConfirming('archive')}
        />
      )}
    </div>
  )
}

function ArchiveCrewModal({
  crew,
  memberCount,
  actions,
  onClose,
}: {
  crew: { id: string; name: string }
  memberCount: number
  actions: CrewActions
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Archive ${crew.name}?`}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            icon={Archive}
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void actions.archiveCrew(crew.id).then((ok) => {
                setBusy(false)
                if (ok) onClose()
              })
            }}
          >
            {busy ? 'Archiving…' : 'Archive crew'}
          </Btn>
        </>
      }
    >
      <p className="text-sm text-(--ink-2)">
        {memberCount > 0 &&
          `${memberCount === 1 ? 'Its 1 member moves' : `Its ${memberCount} members move`} to Unassigned. `}
        The crew leaves the board but keeps its routes and history. You can
        restore it from Archived crews.
      </p>
    </Modal>
  )
}

function DeleteCrewModal({
  crew,
  memberCount,
  actions,
  onClose,
  onArchive,
}: {
  crew: { id: string; name: string; inactive?: boolean }
  memberCount: number
  actions: CrewActions
  onClose: () => void
  /** Offered instead of deleting when the crew has history. */
  onArchive?: () => void
}) {
  const [history, setHistory] = useState<CrewHistory | null | 'error'>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  // Fetched once per crew; `actions` is rebuilt on every parent render.
  const load = useRef(actions.crewHistory)
  useEffect(() => {
    let live = true
    load.current(crew.id).then(
      (h) => live && setHistory(h),
      () => live && setHistory('error'),
    )
    return () => {
      live = false
    }
  }, [crew.id])
  const loaded = history !== null && history !== 'error'
  const hasHistory =
    loaded && (history.pastRoutes > 0 || history.completedVisits > 0)
  // A crew with real history needs its name typed to delete it.
  const blocked =
    history === null ||
    busy ||
    ((hasHistory || history === 'error') &&
      typed.trim().toLowerCase() !== crew.name.toLowerCase())

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={`Delete ${crew.name} permanently?`}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="danger"
            icon={Trash2}
            disabled={blocked}
            onClick={() => {
              setBusy(true)
              void actions.deleteCrew(crew.id).then((ok) => {
                setBusy(false)
                if (ok) onClose()
              })
            }}
          >
            {busy ? 'Deleting…' : 'Delete for good'}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 text-sm text-(--ink-2)">
        {history === null ? (
          <p role="status" className="text-(--ink-3)">
            Checking this crew’s history…
          </p>
        ) : hasHistory ? (
          <div className="rounded-2xl border border-(--sun) bg-(--sun-100) p-4 text-(--ink)">
            <p className="font-bold">This crew has history</p>
            <p className="mt-1 text-[13px]">
              {plural(history.pastRoutes, 'past route')},{' '}
              {plural(history.completedVisits, 'completed visit')}
              {history.lastRouteDate &&
                `, last out ${monthDay(history.lastRouteDate)}`}
              . We recommend disabling or archiving it instead, which keeps that
              history.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!crew.inactive && (
                <Btn
                  size="sm"
                  variant="outline"
                  icon={Power}
                  onClick={() => {
                    actions.setCrewActive(crew.id, false)
                    onClose()
                  }}
                >
                  Disable instead
                </Btn>
              )}
              {onArchive && (
                <Btn
                  size="sm"
                  variant="outline"
                  icon={Archive}
                  onClick={onArchive}
                >
                  Archive instead
                </Btn>
              )}
            </div>
          </div>
        ) : history === 'error' ? (
          <p>We couldn’t check this crew’s history.</p>
        ) : (
          <p>This crew hasn’t done any work yet, so nothing is lost.</p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-[13px]">
          <li>
            The crew
            {loaded && history.pastRoutes + history.upcomingRoutes > 0
              ? ` and its ${plural(history.pastRoutes + history.upcomingRoutes, 'route')} are`
              : ' is'}{' '}
            removed. This can’t be undone.
          </li>
          {loaded && history.upcomingRoutes > 0 && (
            <li>
              Visits on its {plural(history.upcomingRoutes, 'upcoming route')}{' '}
              need a new crew.
            </li>
          )}
          {memberCount > 0 && (
            <li>
              {plural(memberCount, 'member')}{' '}
              {memberCount === 1 ? 'moves' : 'move'} to Unassigned.
            </li>
          )}
          <li>
            Each worker keeps their own hours worked, completed jobs and
            ratings.
          </li>
        </ul>
        {(hasHistory || history === 'error') && (
          <Field label={`Type ${crew.name} to confirm`}>
            <TextInput
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Crew name"
              autoComplete="off"
            />
          </Field>
        )}
      </div>
    </Modal>
  )
}

function ArchivedCrews({
  crews,
  editable,
  actions,
}: {
  crews: Array<ArchivedCrew>
  editable: boolean
  actions: CrewActions
}) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState<ArchivedCrew | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  if (crews.length === 0) return null
  return (
    <section className="mt-5 rounded-[22px] border border-(--line) bg-(--paper)">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm font-bold"
      >
        <Archive className="size-4 text-(--ink-3)" />
        Archived crews
        <span className="text-(--ink-3)">({crews.length})</span>
        <ChevronDown
          className={cn(
            'ml-auto size-4 text-(--ink-3) transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <ul className="border-t border-(--line)">
          {crews.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 border-b border-(--line) px-4 py-2.5 last:border-b-0"
            >
              <ColorDot color={c.color ?? CREW_COLORS[4]} className="size-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {c.name}
                </span>
                {c.archived_at && (
                  <span className="block text-xs text-(--ink-3)">
                    Archived {monthDay(c.archived_at.slice(0, 10))}
                  </span>
                )}
              </span>
              {editable && (
                <span className="flex gap-1">
                  <Btn
                    size="sm"
                    variant="ghost"
                    icon={ArchiveRestore}
                    disabled={restoring === c.id}
                    onClick={() => {
                      setRestoring(c.id)
                      void actions
                        .restoreCrew(c.id)
                        .finally(() => setRestoring(null))
                    }}
                  >
                    Restore
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    className="text-(--clay)"
                    onClick={() => setDeleting(c)}
                  >
                    Delete
                  </Btn>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleting && (
        <DeleteCrewModal
          crew={{ id: deleting.id, name: deleting.name, inactive: true }}
          memberCount={0}
          actions={actions}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
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
  archived = [],
}: {
  members: Array<TeamMember>
  crews: Array<Crew> | undefined
  crewsLoading: boolean
  crewsError: { message: string } | null
  editable: boolean
  actions: CrewActions
  /** Members on approved time off today, by member id. */
  away?: Map<string, Away>
  archived?: Array<ArchivedCrew>
}) {
  const [creating, setCreating] = useState(false)
  const [newCrewId, setNewCrewId] = useState<string | null>(null)
  // Inactive crews sort after the active ones.
  const localCrews = (crews ?? [])
    .map(toLocalCrew)
    .sort((a, b) => Number(a.inactive) - Number(b.inactive))

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
      <ArchivedCrews crews={archived} editable={editable} actions={actions} />
    </div>
  )
}
