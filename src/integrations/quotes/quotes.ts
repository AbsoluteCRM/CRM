import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { quotePolling } from './polling'

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
    ...quotePolling,
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
  const clients = useQuery({
    ...trpc.clients.list.queryOptions(org),
    retry: false,
  })
  const messages = useInfiniteQuery(
    trpc.quotes.listMessages.infiniteQueryOptions(
      { ...org, quoteId },
      {
        getNextPageParam: (page) => page.olderCursor ?? undefined,
        ...quotePolling,
      },
    ),
  )
  const post = useMutation(trpc.quotes.postMessage.mutationOptions())
  const mutations = [
    update,
    upsertLine,
    deleteLine,
    pullBack,
    send,
    retryDelivery,
    post,
  ]

  return {
    queries: { quote, taxRates, services, clients },
    messages,
    history: messages.isError
      ? []
      : (messages.data?.pages.flatMap((page) => page.messages) ?? []),
    send: (retry: boolean) =>
      (retry ? retryDelivery : send)
        .mutateAsync({ ...org, quoteId })
        .then(refresh)
        .then(ok, failed),
    postMessage: (input: { body: string; clientMessageId: string }) =>
      post
        .mutateAsync({ ...org, quoteId, ...input })
        .then(refresh)
        .then(ok, failed),
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
  }
}
