import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect } from 'react'
import { useServerFn } from '@tanstack/react-start'
import {
  approve,
  decline,
  getQuote,
  listMessages,
  postMessage,
} from './public.functions'
import { quoteTokenSchema } from './public.schemas'
import { readPublicQuote, readPublicMessages } from './public.queries'
import type { QuoteMessageCursor } from './public.schemas'

import { quotePolling } from './polling'

export function usePublicQuote(token: string) {
  const get = useServerFn(getQuote)
  const list = useServerFn(listMessages)
  const post = useServerFn(postMessage)
  const accept = useServerFn(approve)
  const reject = useServerFn(decline)
  const client = useQueryClient()
  const valid = quoteTokenSchema.safeParse(token).success
  const key = ['publicQuote', token]
  const quote = useQuery({
    queryKey: [...key, 'quote'],
    queryFn: () => readPublicQuote(() => get({ data: { token } })),
    enabled: valid && typeof window !== 'undefined',
    gcTime: 0,
    ...quotePolling,
  })
  const available = valid && quote.data?.ok === true
  const messages = useInfiniteQuery({
    queryKey: [...key, 'messages'],
    initialPageParam: undefined as QuoteMessageCursor | undefined,
    queryFn: ({ pageParam }) =>
      readPublicMessages(
        (cursor) => list({ data: { token, cursor } }),
        pageParam,
      ),
    getNextPageParam: (page) =>
      page.ok ? (page.data.olderCursor ?? undefined) : undefined,
    enabled: available && typeof window !== 'undefined',
    gcTime: 0,
    ...quotePolling,
  })
  const refresh = () => client.invalidateQueries({ queryKey: key })
  const mutation = useMutation({
    mutationFn: async (input: {
      kind: 'approve' | 'decline'
      reason?: string | null
    }) =>
      input.kind === 'approve'
        ? accept({ data: { token } })
        : reject({ data: { token, reason: input.reason } }),
    onSettled: () => quote.refetch(),
  })
  const messageMutation = useMutation({
    mutationFn: (input: { body: string; clientMessageId: string }) =>
      post({ data: { token, ...input } }),
    onSettled: refresh,
  })
  const messageUnavailable =
    messages.data?.pages.some((page) => !page.ok && page.unavailable) ?? false
  const unavailable =
    !valid ||
    (quote.data?.ok === false && quote.data.unavailable) ||
    messageUnavailable
  useEffect(() => {
    if (!valid || (quote.data?.ok === false && quote.data.unavailable))
      client.removeQueries({ queryKey: ['publicQuote', token, 'messages'] })
  }, [client, token, valid, quote.data])
  useEffect(() => {
    if (messageUnavailable) void quote.refetch()
  }, [messageUnavailable, quote.refetch])
  return {
    quote,
    data:
      available && !unavailable && quote.data?.ok ? quote.data.data : undefined,
    unavailable,
    error: quote.isError
      ? 'Could not refresh this quote. Please try again.'
      : mutation.error
        ? 'Could not confirm your decision. Please try again.'
        : mutation.data?.ok === false
          ? mutation.data.message
          : null,
    busy: mutation.isPending,
    messages,
    history:
      available && !unavailable
        ? (messages.data?.pages.flatMap((page) =>
            page.ok ? page.data.messages : [],
          ) ?? [])
        : [],
    messageError:
      messageMutation.data?.ok === false
        ? messageMutation.data.message
        : messageMutation.error
          ? 'Could not send your message. Please try again.'
          : messages.isError
            ? 'Could not load messages. Please try again.'
            : messages.data?.pages.find((page) => !page.ok)?.message,
    refresh,
    decide: (kind: 'approve' | 'decline', reason?: string | null) =>
      mutation.mutateAsync({ kind, reason }).then(
        (result) => result.ok,
        () => false,
      ),
    post: (input: { body: string; clientMessageId: string }) =>
      messageMutation.mutateAsync(input).then(
        (result) => result.ok,
        () => false,
      ),
  }
}
