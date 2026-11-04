import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import { toast } from '#/lib/toast'
import { settleList, useOrgScope } from '#/integrations/organization/org-query'
import { useTRPC } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'

export type ClientRow =
  inferRouterOutputs<TRPCRouter>['clients']['list'][number]
export type CreateClientInput = Omit<
  inferRouterInputs<TRPCRouter>['clients']['create'],
  'organizationId'
>
export type UpdateClientPatch = Omit<
  inferRouterInputs<TRPCRouter>['clients']['update'],
  'organizationId' | 'clientId'
>

export type ClientAddressInput = NonNullable<UpdateClientPatch['address']>

/** "12 Elm St, Unit 4" and "Calgary, AB T2X 1A1", or null without an address. */
export function clientAddressLines(c: ClientRow) {
  if (!c.billing_address_line1) return null
  const street = [c.billing_address_line1, c.billing_address_line2]
    .filter(Boolean)
    .join(', ')
  const regionPostal = [c.billing_region, c.billing_postal_code]
    .filter(Boolean)
    .join(' ')
  const place = [c.billing_city, regionPostal].filter(Boolean).join(', ')
  return { street, place }
}

export function useClients() {
  const trpc = useTRPC()
  const { input, enabled } = useOrgScope()

  return useQuery({ ...trpc.clients.list.queryOptions(input), enabled })
}

type ClientList = Array<ClientRow>

// Edits save as they happen: the cache updates first, a failure toasts, and the refetch on settle restores the server's truth.
export function useClientMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { input: base } = useOrgScope()
  const listKey = trpc.clients.list.queryKey(base)
  const settle = settleList(queryClient, listKey, 'clients')

  const create = useMutation(
    trpc.clients.create.mutationOptions({
      ...settle,
      onSuccess: (client) =>
        queryClient.setQueryData<ClientList>(listKey, (old) =>
          old ? [...old, client] : [client],
        ),
      onError: (e) => toast(`Couldn't add the client: ${e.message}`),
    }),
  )

  const update = useMutation(
    trpc.clients.update.mutationOptions({
      ...settle,
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: listKey })
        queryClient.setQueryData<ClientList>(listKey, (old) =>
          old
            ? old.map((c) =>
                c.id === vars.clientId
                  ? {
                      ...c,
                      ...(vars.display_name !== undefined && {
                        display_name: vars.display_name,
                      }),
                      ...(vars.kind !== undefined && { kind: vars.kind }),
                      ...(vars.status !== undefined && {
                        status: vars.status,
                      }),
                      ...(vars.email !== undefined && {
                        email: vars.email || null,
                      }),
                      ...(vars.phone !== undefined && {
                        phone: vars.phone || null,
                      }),
                      ...(vars.notes !== undefined && {
                        notes: vars.notes || null,
                      }),
                      ...(vars.company_name !== undefined && {
                        company_name: vars.company_name || null,
                      }),
                      ...(vars.address !== undefined && {
                        billing_address_line1:
                          vars.address?.address_line1.trim() ?? null,
                        billing_address_line2:
                          vars.address?.address_line2?.trim() || null,
                        billing_city: vars.address?.city.trim() ?? null,
                        billing_region: vars.address?.region?.trim() || null,
                        billing_postal_code:
                          vars.address?.postal_code?.trim().toUpperCase() ||
                          null,
                        billing_country: vars.address?.country ?? null,
                      }),
                    }
                  : c,
              )
            : old,
        )
      },
      onError: (e) => toast(`Couldn't save: ${e.message}`),
    }),
  )

  return {
    createClient: (input: CreateClientInput) =>
      create.mutateAsync({ ...base, ...input }),
    updateClient: (clientId: string, patch: UpdateClientPatch) =>
      update.mutate({ ...base, clientId, ...patch }),
    /** Like updateClient, but resolves when saved (rejects on failure). */
    saveClient: (clientId: string, patch: UpdateClientPatch) =>
      update.mutateAsync({ ...base, clientId, ...patch }),
    saving: update.isPending,
    creating: create.isPending,
  }
}
