import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import { toast } from '#/components/crm/ui'
import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'
import { teamMembersKey } from './teams'
import type { TRPCRouter } from '#/integrations/trpc/router'

export type TimeOff =
  inferRouterOutputs<TRPCRouter>['availability']['timeOff'][number]
type Inputs = inferRouterInputs<TRPCRouter>['availability']
export type TimeOffInput = Omit<Inputs['request'], 'organizationId'>

/** Pending and approved time off between two ISO dates (inclusive). */
export function useTimeOff(from: string, to: string) {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  return useQuery({
    ...trpc.availability.timeOff.queryOptions({
      organizationId: organization?.id ?? '',
      from,
      to,
    }),
    enabled: organization !== null,
  })
}

export function useAvailabilityMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { organization } = useOrganization()
  const organizationId = organization?.id ?? ''
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.availability.timeOff.pathFilter()),
      queryClient.invalidateQueries({
        queryKey: teamMembersKey(organization?.id),
      }),
    ])
  const opts = (failure: string) => ({
    scope: { id: 'availability' },
    onSettled: refresh,
    onError: (e: { message: string }) => toast(`${failure}: ${e.message}`),
  })

  const request = useMutation(
    trpc.availability.request.mutationOptions(
      opts('Couldn’t send the request'),
    ),
  )
  const record = useMutation(
    trpc.availability.record.mutationOptions(opts('Couldn’t save time off')),
  )
  const review = useMutation(
    trpc.availability.review.mutationOptions(opts('Couldn’t save the review')),
  )
  const cancel = useMutation(
    trpc.availability.cancel.mutationOptions(opts('Couldn’t cancel')),
  )
  const schedule = useMutation(
    trpc.availability.setSchedule.mutationOptions(
      opts('Couldn’t save the schedule'),
    ),
  )
  const base = { organizationId }
  const ok = () => true
  const failed = () => false

  return {
    request: (input: TimeOffInput) =>
      request.mutateAsync({ ...base, ...input }).then(ok, failed),
    record: (input: TimeOffInput & { memberId: string }) =>
      record.mutateAsync({ ...base, ...input }).then(ok, failed),
    review: (id: string, approve: boolean, note: string | null = null) =>
      review.mutateAsync({ ...base, id, approve, note }).then(ok, failed),
    cancel: (id: string) => cancel.mutateAsync({ ...base, id }).then(ok, failed),
    setSchedule: (input: {
      memberId: string
      workDays: Array<number>
      workStart: string
      workEnd: string
    }) => schedule.mutateAsync({ ...base, ...input }).then(ok, failed),
    busy:
      request.isPending ||
      record.isPending ||
      review.isPending ||
      cancel.isPending ||
      schedule.isPending,
  }
}
