import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import { toast } from '#/components/crm/ui'
import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'

type Inputs = inferRouterInputs<TRPCRouter>['properties']

export type PropertyRow =
  inferRouterOutputs<TRPCRouter>['properties']['list'][number]
export type PropertyAddressInput = Inputs['create']['address']
export type CreatePropertyInput = Omit<Inputs['create'], 'organizationId'>
export type UpdatePropertyPatch = Omit<
  Inputs['update'],
  'organizationId' | 'propertyId'
>

/** Every active property in the current organization. */
export function useProperties() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  return useQuery({
    ...trpc.properties.list.queryOptions({ organizationId: organizationId! }),
    enabled: organizationId !== undefined,
  })
}

export function usePropertyMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  const listKey = trpc.properties.list.queryKey({
    organizationId: organizationId!,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: listKey })

  const create = useMutation(
    trpc.properties.create.mutationOptions({
      onError: (e) => toast(`Couldn't add the address: ${e.message}`),
      onSettled: refresh,
    }),
  )
  const update = useMutation(
    trpc.properties.update.mutationOptions({
      onError: (e) => toast(`Couldn't save: ${e.message}`),
      onSettled: refresh,
    }),
  )
  const archive = useMutation(
    trpc.properties.archive.mutationOptions({
      onError: (e) => toast(`Couldn't remove the property: ${e.message}`),
      onSettled: refresh,
    }),
  )

  const base = { organizationId: organizationId! }
  return {
    createProperty: (input: CreatePropertyInput) =>
      create.mutateAsync({ ...base, ...input }),
    updateProperty: (propertyId: string, patch: UpdatePropertyPatch) =>
      update.mutateAsync({ ...base, propertyId, ...patch }),
    archiveProperty: (propertyId: string) =>
      archive.mutateAsync({ ...base, propertyId }),
    saving: create.isPending || update.isPending || archive.isPending,
  }
}

/** "12 Elm St, Unit 4" and "Calgary, AB T2X 1A1" for display. */
export function propertyLines(p: PropertyRow) {
  const street = [p.address_line1, p.address_line2].filter(Boolean).join(', ')
  const regionPostal = [p.region, p.postal_code].filter(Boolean).join(' ')
  const place = [p.city, regionPostal].filter(Boolean).join(', ')
  return { street, place }
}
