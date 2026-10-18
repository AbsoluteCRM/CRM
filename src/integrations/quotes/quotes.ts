import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTRPC } from '#/integrations/trpc/react'

const ok = () => true
const failed = () => false

export function useRequestDetail(
  organizationId: string | undefined,
  requestId: string,
  enabled: boolean,
) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const on = enabled && organizationId !== undefined
  const org = { organizationId: organizationId ?? '' }

  const requests = useQuery({
    ...trpc.requests.list.queryOptions(org),
    enabled: on,
    retry: false,
  })
  const services = useQuery({
    ...trpc.services.list.queryOptions(org),
    enabled: on,
    retry: false,
  })
  const quotes = useQuery({
    ...trpc.quotes.listForRequest.queryOptions({ ...org, requestId }),
    enabled: on,
    retry: false,
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.quotes.pathFilter()),
      queryClient.invalidateQueries(trpc.requests.pathFilter()),
    ])
  }
  const createDraft = useMutation(trpc.quotes.createDraft.mutationOptions())
  const setInfoNeeded = useMutation(
    trpc.requests.setInfoNeeded.mutationOptions(),
  )

  return {
    request: requests.data?.find((r) => r.id === requestId),
    queries: { requests, services, quotes },
    busy: createDraft.isPending || setInfoNeeded.isPending,
    error: createDraft.error?.message ?? setInfoNeeded.error?.message ?? null,
    // Handlers resolve to whether the call worked; errors show through `error`.
    createDraft: (copyFromQuoteId: string | null) =>
      createDraft
        .mutateAsync({ ...org, requestId, copyFromQuoteId })
        .then(async ({ id }) => {
          await refresh()
          return id
        })
        .catch(() => null),
    saveInfoNeeded: (note: string | null) =>
      setInfoNeeded
        .mutateAsync({ ...org, id: requestId, note })
        .then(refresh)
        .then(ok, failed),
  }
}

export function useQuoteBuilder(
  organizationId: string | undefined,
  quoteId: string,
  enabled: boolean,
) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const on = enabled && organizationId !== undefined
  const org = { organizationId: organizationId ?? '' }

  const quote = useQuery({
    ...trpc.quotes.get.queryOptions({ ...org, quoteId }),
    enabled: on,
    retry: false,
  })
  const taxRates = useQuery({
    ...trpc.quotes.taxRates.queryOptions(org),
    enabled: on,
    retry: false,
  })
  const services = useQuery({
    ...trpc.services.list.queryOptions(org),
    enabled: on,
    retry: false,
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.quotes.pathFilter()),
      queryClient.invalidateQueries(trpc.requests.pathFilter()),
    ])
  }
  const update = useMutation(trpc.quotes.update.mutationOptions())
  const upsertLine = useMutation(trpc.quotes.upsertLine.mutationOptions())
  const deleteLine = useMutation(trpc.quotes.deleteLine.mutationOptions())
  const pullBack = useMutation(trpc.quotes.pullBack.mutationOptions())
  const mutations = [update, upsertLine, deleteLine, pullBack]

  return {
    queries: { quote, taxRates, services },
    busy: mutations.some((m) => m.isPending),
    error: mutations.find((m) => m.error)?.error?.message ?? null,
    saveDetails: (input: {
      title: string
      message: string | null
      conditions: string | null
      validUntil: string | null
    }) =>
      update
        .mutateAsync({ ...org, quoteId, ...input })
        .then(refresh)
        .then(ok, failed),
    saveLine: (input: {
      lineId: string | null
      serviceId: string | null
      description: string
      quantity: number
      unitPriceCents: number
      isOptional: boolean
      taxRateIds: Array<string>
    }) =>
      upsertLine
        .mutateAsync({ ...org, quoteId, ...input })
        .then(refresh)
        .then(ok, failed),
    deleteLine: (lineId: string) =>
      deleteLine
        .mutateAsync({ ...org, quoteId, lineId })
        .then(refresh)
        .then(ok, failed),
    pullBack: () =>
      pullBack
        .mutateAsync({ ...org, quoteId })
        .then(refresh)
        .then(ok, failed),
  }
}
