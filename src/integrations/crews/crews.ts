import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'

import { toast } from '#/components/crm/ui'
import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'

export type Crew = inferRouterOutputs<TRPCRouter>['crews']['list'][number]

export function useCrews() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id

  return useQuery({
    ...trpc.crews.list.queryOptions({ organizationId: organizationId! }),
    enabled: organizationId !== undefined,
  })
}

export type ArchivedCrew =
  inferRouterOutputs<TRPCRouter>['crews']['archived'][number]
export type CrewHistory = inferRouterOutputs<TRPCRouter>['crews']['history']

export function useArchivedCrews(enabled = true) {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  return useQuery({
    ...trpc.crews.archived.queryOptions({ organizationId: organizationId! }),
    enabled: enabled && organizationId !== undefined,
  })
}

type CrewList = Array<Crew>

// Mirrors move_crew_member: a member is in at most one crew, and leaving a crew drops their lead flag.
export const applyMove = (
  crews: CrewList,
  memberId: string,
  crewId: string | null,
): CrewList =>
  crews.map((c) => {
    const existing = c.crew_members.find((cm) => cm.member_id === memberId)
    const others = c.crew_members.filter((cm) => cm.member_id !== memberId)
    if (c.id === crewId) {
      return {
        ...c,
        crew_members: [
          ...others,
          existing ?? { member_id: memberId, is_lead: false },
        ],
      }
    }
    return { ...c, crew_members: others }
  })

export const applyLead = (
  crews: CrewList,
  crewId: string,
  memberId: string | null,
): CrewList =>
  crews.map((c) =>
    c.id === crewId
      ? {
          ...c,
          crew_members: c.crew_members.map((cm) => ({
            ...cm,
            is_lead: cm.member_id === memberId,
          })),
        }
      : c,
  )

// Edits save as they happen: the cache updates first, a failure toasts, and the refetch on settle restores the server's truth.
export function useCrewMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  const listKey = trpc.crews.list.queryKey({ organizationId: organizationId! })
  const archivedKey = trpc.crews.archived.queryKey({
    organizationId: organizationId!,
  })
  const refreshBoth = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: archivedKey }),
    ])

  const optimistic = <TVars>(
    patch: (crews: CrewList, vars: TVars) => CrewList,
  ) => ({
    scope: { id: 'crews' },
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      queryClient.setQueryData<CrewList>(listKey, (old) =>
        old ? patch(old, vars) : old,
      )
    },
    onError: (e: { message: string }) => toast(`Couldn't save: ${e.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })

  const create = useMutation(
    trpc.crews.create.mutationOptions({
      scope: { id: 'crews' },
      onSuccess: (crew) =>
        queryClient.setQueryData<CrewList>(listKey, (old) =>
          old ? [...old, crew] : [crew],
        ),
      onError: (e) => toast(`Couldn't create the crew: ${e.message}`),
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
    }),
  )

  const update = useMutation(
    trpc.crews.update.mutationOptions(
      optimistic((crews, v) =>
        crews.map((c) =>
          c.id === v.crewId
            ? {
                ...c,
                ...(v.name !== undefined && { name: v.name }),
                ...(v.vehicle !== undefined && { vehicle: v.vehicle || null }),
              }
            : c,
        ),
      ),
    ),
  )

  const archive = useMutation(
    trpc.crews.archive.mutationOptions({
      ...optimistic<{ crewId: string }>((crews, v) =>
        crews.filter((c) => c.id !== v.crewId),
      ),
      onError: (e) => toast(`Couldn't archive the crew: ${e.message}`),
      onSettled: refreshBoth,
    }),
  )

  const setActive = useMutation(
    trpc.crews.setActive.mutationOptions(
      optimistic((crews, v) =>
        crews.map((c) =>
          c.id === v.crewId
            ? {
                ...c,
                disabled_at: v.active ? null : new Date().toISOString(),
              }
            : c,
        ),
      ),
    ),
  )

  const restore = useMutation(
    trpc.crews.restore.mutationOptions({
      scope: { id: 'crews' },
      onError: (e) => toast(`Couldn't restore the crew: ${e.message}`),
      onSettled: refreshBoth,
    }),
  )

  const remove = useMutation(
    trpc.crews.delete.mutationOptions({
      scope: { id: 'crews' },
      onSuccess: (_, v) =>
        queryClient.setQueryData<CrewList>(listKey, (old) =>
          old?.filter((c) => c.id !== v.crewId),
        ),
      onError: (e) => toast(`Couldn't delete the crew: ${e.message}`),
      onSettled: refreshBoth,
    }),
  )

  const moveMember = useMutation(
    trpc.crews.moveMember.mutationOptions(
      optimistic((crews, v) => applyMove(crews, v.memberId, v.crewId)),
    ),
  )

  const setLead = useMutation(
    trpc.crews.setLead.mutationOptions(
      optimistic((crews, v) => applyLead(crews, v.crewId, v.memberId)),
    ),
  )

  const base = { organizationId: organizationId! }
  // Errors are already toasted; callers only need to know whether it worked.
  const ok = (p: Promise<unknown>) =>
    p.then(
      () => true,
      () => false,
    )
  return {
    createCrew: (name: string, color: string) =>
      create.mutateAsync({ ...base, name, color }),
    renameCrew: (crewId: string, name: string) =>
      update.mutate({ ...base, crewId, name }),
    setVehicle: (crewId: string, vehicle: string | null) =>
      update.mutate({ ...base, crewId, vehicle }),
    setCrewActive: (crewId: string, active: boolean) =>
      setActive.mutate({ ...base, crewId, active }),
    archiveCrew: (crewId: string) =>
      ok(archive.mutateAsync({ ...base, crewId })),
    restoreCrew: (crewId: string) =>
      ok(restore.mutateAsync({ ...base, crewId })),
    deleteCrew: (crewId: string) => ok(remove.mutateAsync({ ...base, crewId })),
    crewHistory: (crewId: string) =>
      queryClient.fetchQuery({
        ...trpc.crews.history.queryOptions({ ...base, crewId }),
        staleTime: 0,
      }),
    moveMember: (memberId: string, crewId: string | null) =>
      moveMember.mutate({ ...base, memberId, crewId }),
    setLead: (crewId: string, memberId: string | null) =>
      setLead.mutate({ ...base, crewId, memberId }),
    creating: create.isPending,
  }
}
