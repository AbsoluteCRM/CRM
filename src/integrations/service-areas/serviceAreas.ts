import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useOrganization } from '#/integrations/organization/context'
import { can } from '#/integrations/organization/permissions'
import { useTRPC } from '#/integrations/trpc/react'

// Queries and mutations behind the service area editor. Every call passes the
// active organization; the server verifies membership and permission, and RLS
// is the access control (ADR 0009).

export function useServiceAreas() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id

  return useQuery({
    ...trpc.serviceAreas.list.queryOptions({
      organizationId: organizationId!,
      includeArchived: false,
    }),
    enabled: organizationId !== undefined,
  })
}

export function useServiceRegions() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id

  return useQuery({
    ...trpc.serviceAreas.regions.list.queryOptions({
      organizationId: organizationId!,
    }),
    enabled: organizationId !== undefined,
  })
}

/** Office staff only: workers cannot read the properties it counts. */
export function useServiceAreaCoverage() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  const allowed =
    organization !== null && can.viewServiceAreaCoverage(organization.role)

  return useQuery({
    ...trpc.serviceAreas.coverage.queryOptions({
      organizationId: organizationId!,
    }),
    enabled: organizationId !== undefined && allowed,
  })
}

export function useServiceAreaMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { organization } = useOrganization()
  const organizationId = organization?.id

  // Moving a boundary changes counts, overlaps, and which properties are covered.
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.serviceAreas.list.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.serviceAreas.coverage.queryKey(),
      }),
    ])

  const upsert = useMutation(
    trpc.serviceAreas.upsert.mutationOptions({ onSettled: invalidate }),
  )
  const preview = useMutation(trpc.serviceAreas.preview.mutationOptions())
  const archive = useMutation(
    trpc.serviceAreas.archive.mutationOptions({ onSettled: invalidate }),
  )
  const setRotations = useMutation(
    trpc.serviceAreas.rotations.set.mutationOptions({ onSettled: invalidate }),
  )
  const upsertRegion = useMutation(
    trpc.serviceAreas.regions.upsert.mutationOptions({
      onSettled: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.serviceAreas.regions.list.queryKey(),
        }),
    }),
  )

  return {
    organizationId,
    upsert,
    preview,
    archive,
    setRotations,
    upsertRegion,
  }
}
