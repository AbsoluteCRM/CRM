import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Mail, UserPlus } from 'lucide-react'

import PageShell from '#/components/crm/PageShell'
import {
  Btn,
  Card,
  Field,
  Modal,
  Tabs,
  TextInput,
  toast,
} from '#/components/crm/ui'
import {
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  can,
  useTenant,
} from '#/components/crm/store'
import { addDays, todayISO } from '#/components/crm/format'
import InvitationDelivery from '#/components/team/InvitationDelivery'
import CrewBuilder from '#/components/team/CrewBuilder'
import { awayOn } from '#/components/team/availability-utils'
import type { Away } from '#/components/team/availability-utils'
import MembersTab from '#/components/team/MembersTab'
import MyCrew from '#/components/team/MyCrew'
import {
  MemberDrawer,
  PerformanceTab,
  averageRating,
  crewFor,
} from '#/components/team/Performance'
import {
  useArchivedCrews,
  useCrewMutations,
  useCrews,
} from '#/integrations/crews/crews'
import {
  useInviteTeamMember,
  useMyMember,
  useSetCertifications,
  useTeamMembers,
} from '#/integrations/teams/teams'
import {
  useAvailabilityMutations,
  useTimeOff,
} from '#/integrations/teams/availability'
import { useCompanySettings } from '#/integrations/settings/settings'
import {
  AvailabilityBoard,
  DAYS_SHOWN,
  MyAvailability,
} from '#/components/team/Availability'
import type { InviteRole } from '#/integrations/teams/teams'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_authed/teams')({
  component: TeamsPage,
})

type Tab = 'members' | 'crews' | 'availability' | 'performance'
function TeamsPage() {
  const t = useTenant()
  const team = useTeamMembers()
  const crews = useCrews()
  const crewActions = useCrewMutations()
  const [tab, setTab] = useState<Tab>('members')
  const [inviting, setInviting] = useState(false)
  const [profile, setProfile] = useState<string | null>(null)
  const certifications = useSetCertifications()
  const editable = can.manageTeam(t.role)
  const isWorker = t.role === 'worker'
  const today = todayISO()
  const timeOff = useTimeOff(today, addDays(today, DAYS_SHOWN + 60))
  const company = useCompanySettings()
  const hours = company.data?.settings.business_hours
  const { me } = useMyMember()
  const availabilityActions = useAvailabilityMutations()
  const pendingRequests = (timeOff.data ?? []).filter(
    (x) => x.status === 'pending',
  ).length
  const realMembers = team.data ?? []
  const awayToday = useMemo(() => {
    const map = new Map<string, Away>()
    for (const m of team.data ?? []) {
      const a = awayOn(m, today, hours, timeOff.data ?? [])
      if (a) map.set(m.id, a)
    }
    return map
  }, [team.data, today, hours, timeOff.data])
  const realCrews = crews.data ?? []
  const archivedCrews = useArchivedCrews(editable)
  const contractors = realMembers.filter((m) => m.role === 'worker')
  const activeContractors = contractors.filter((m) => m.status === 'active')
  const rating = averageRating(realMembers)
  const profileMember = realMembers.find((m) => m.id === profile)

  if (isWorker) {
    return (
      <PageShell
        kicker="Workforce"
        title="My Schedule"
        subtitle="Your crew and your schedule for the next two weeks. Request sick days and other time off here."
      >
        {me ? (
          <>
            <MyCrew
              me={me}
              crew={realCrews.find((c) =>
                c.crew_members.some((cm) => cm.member_id === me.id),
              )}
              members={realMembers}
              loading={crews.isLoading}
            />
            <MyAvailability
              me={me}
              timeOff={timeOff.data ?? []}
              hours={hours}
              actions={availabilityActions}
            />
          </>
        ) : (
          <p role="status" className="py-10 text-center text-sm text-(--ink-3)">
            {team.isLoading
              ? 'Loading…'
              : 'We couldn’t find your team profile.'}
          </p>
        )}
      </PageShell>
    )
  }

  return (
    <PageShell
      kicker="Workforce"
      title="Team"
      subtitle="Manage your contractors, build crews, track availability, and see how everyone is performing."
      allowed={can.viewTeam(t.role)}
      section="Team"
      actions={
        editable && (
          <Btn icon={UserPlus} onClick={() => setInviting(true)}>
            Invite member
          </Btn>
        )
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Contractors',
            value: activeContractors.length,
            sub: `${contractors.filter((m) => m.status === 'invited').length} invited`,
          },
          {
            label: 'Crews',
            value: realCrews.filter((c) => c.crew_members.length).length,
            sub: `${realCrews.filter((c) => !c.crew_members.length).length} without members`,
          },
          {
            label: 'Out today',
            value: activeContractors.filter((m) => awayToday.has(m.id)).length,
            sub:
              pendingRequests > 0
                ? `${pendingRequests} time-off request${pendingRequests === 1 ? '' : 's'} waiting`
                : 'Sick, vacation, or personal time',
          },
          {
            label: 'Avg. rating',
            value: rating === null ? '—' : rating.toFixed(1),
            sub: 'Customer feedback, out of 5',
          },
        ].map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs font-semibold text-(--ink-3)">{k.label}</p>
            <p className="crm-display mt-1 text-2xl font-semibold">{k.value}</p>
            <p className="mt-0.5 text-xs text-(--ink-3)">{k.sub}</p>
          </Card>
        ))}
      </div>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            value: 'members',
            label: 'Team list',
            count: contractors.length,
          },
          { value: 'crews', label: 'Crew builder', count: realCrews.length },
          {
            value: 'availability',
            label: 'Availability',
            count: pendingRequests || undefined,
          },
          { value: 'performance', label: 'Performance' },
        ]}
      />

      {tab === 'members' && (
        <MembersTab
          members={team.data ?? []}
          crews={realCrews}
          isLoading={team.isLoading}
          error={team.error}
        />
      )}
      {tab === 'crews' && (
        <CrewBuilder
          members={realMembers}
          crews={crews.data}
          crewsLoading={crews.isLoading}
          crewsError={crews.error}
          editable={editable}
          actions={crewActions}
          away={awayToday}
          archived={archivedCrews.data}
        />
      )}
      {tab === 'availability' && (
        <AvailabilityBoard
          members={realMembers}
          timeOff={timeOff.data ?? []}
          hours={hours}
          myMemberId={me?.id ?? null}
          canManage={editable}
          actions={availabilityActions}
          crews={realCrews}
        />
      )}

      {tab === 'performance' && (
        <PerformanceTab
          members={realMembers}
          crews={realCrews}
          onOpen={setProfile}
        />
      )}

      {profileMember && (
        <MemberDrawer
          member={profileMember}
          crew={crewFor(realCrews, profileMember.id)}
          timeOff={timeOff.data ?? []}
          editable={editable}
          savingCertifications={certifications.saving}
          savingSchedule={availabilityActions.busy}
          onClose={() => setProfile(null)}
          onSetCertifications={(list) =>
            certifications.setCertifications(profileMember.id, list)
          }
          onSetWorkDays={(workDays) =>
            void availabilityActions.setSchedule({
              memberId: profileMember.id,
              workDays,
              workStart: profileMember.work_start,
              workEnd: profileMember.work_end,
            })
          }
          onSetVehicle={(vehicle) => {
            const crew = crewFor(realCrews, profileMember.id)
            if (crew) crewActions.setVehicle(crew.id, vehicle)
          }}
          onAddTimeOff={() => {
            setProfile(null)
            setTab('availability')
          }}
        />
      )}
      {inviting && <InviteModal onClose={() => setInviting(false)} />}
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteRole>('worker')
  const [result, setResult] = useState<{
    inviteLink: string
    resent: boolean
    delivery: 'sent' | 'failed'
  } | null>(null)
  const invite = useInviteTeamMember()
  const valid = /\S+@\S+\.\S+/.test(email)

  const copyLink = async (link: string) => {
    await navigator.clipboard.writeText(link)
  }

  const submit = async () => {
    try {
      const created = await invite.mutateAsync({ email, role })
      toast(
        created.delivery === 'sent'
          ? 'Invitation email accepted for sending'
          : 'Unable to confirm sending. Copy the link or retry.',
        created.delivery === 'sent' ? undefined : 'warning',
      )
      setResult(created)
    } catch (e) {
      toast(
        e instanceof Error ? e.message : 'Could not create the invite.',
        'warning',
      )
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title="Invite a team member"
      subtitle="Email a secure invitation, valid for seven days."
      footer={
        result ? (
          <>
            <Btn variant="ghost" disabled={invite.isPending} onClick={onClose}>
              Done
            </Btn>
          </>
        ) : (
          <>
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn
              icon={Mail}
              disabled={!valid || invite.isPending}
              onClick={submit}
            >
              {invite.isPending ? 'Sending…' : 'Send invitation'}
            </Btn>
          </>
        )
      }
    >
      {result ? (
        <InvitationDelivery
          email={email}
          inviteLink={result.inviteLink}
          delivery={result.delivery}
          busy={invite.isPending}
          onRetry={submit}
          onCopy={() => {
            copyLink(result.inviteLink).then(
              () => toast('Link copied'),
              () => toast('Couldn’t copy; select the link instead.', 'warning'),
            )
          }}
        />
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-(--ink-3)">
            Sending again to an email with a pending invitation replaces its
            earlier link. Only the latest generated link works.
          </p>
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoFocus
            />
          </Field>
          <Field label="Role">
            <div className="grid gap-2">
              {(['admin', 'dispatcher', 'worker'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left',
                    role === r
                      ? 'border-(--leaf-600) bg-(--lime-100)'
                      : 'border-(--line-2) hover:border-(--leaf-500)',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 size-4 shrink-0 rounded-full border-2',
                      role === r
                        ? 'border-(--leaf-700) bg-(--leaf-700) ring-2 ring-white ring-inset'
                        : 'border-(--line-2)',
                    )}
                  />
                  <span>
                    <span className="block text-sm font-bold">
                      {ROLE_LABEL[r]}
                    </span>
                    <span className="block text-xs text-(--ink-3)">
                      {ROLE_DESCRIPTION[r]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}
    </Modal>
  )
}
