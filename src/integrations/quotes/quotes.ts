import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTRPC } from '#/integrations/trpc/react'

const ok = () => true
const failed = () => false

export function useRequestQuotes(organizationId: string, requestId: string) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const org = { organizationId }

  const quotes = useQuery({
    ...trpc.quotes.listForRequest.queryOptions({ ...org, requestId }),
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
    quotes,
    busy: createDraft.isPending || setInfoNeeded.isPending,
    error: createDraft.error?.message ?? setInfoNeeded.error?.message ?? null,
    // Handlers resolve to the new id or whether the call worked; errors show through `error`.
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

export function useQuoteBuilder(organizationId: string, quoteId: string) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const org = { organizationId }

  const quote = useQuery({
    ...trpc.quotes.get.queryOptions({ ...org, quoteId }),
    retry: false,
  })
  const taxRates = useQuery({
    ...trpc.quotes.taxRates.queryOptions(org),
    retry: false,
  })
  const services = useQuery({
    ...trpc.services.list.queryOptions(org),
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
  const send = useMutation(trpc.quotes.send.mutationOptions())
  const retryDelivery = useMutation(trpc.quotes.retryDelivery.mutationOptions())
  const mutations = [
    update,
    upsertLine,
    deleteLine,
    pullBack,
    send,
    retryDelivery,
  ]
  // A send can succeed while the email fails; the delivery card shows that.
  const delivered = (r: {
    delivery: 'sent' | 'failed'
    error: string | null
  }) => refresh().then(() => r.delivery === 'sent')

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
      frequency: 'one_time' | 'weekly' | 'biweekly' | 'monthly'
      seasonStartMonth: number | null
      seasonEndMonth: number | null
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
    send: () => send.mutateAsync({ ...org, quoteId }).then(delivered, failed),
    retryDelivery: () =>
      retryDelivery.mutateAsync({ ...org, quoteId }).then(delivered, failed),
  }
}
