import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import StatusPage from '#/components/auth/StatusPage'
import QuoteLinkView from '#/components/quotes/QuoteLinkView'
import { useTRPC } from '#/integrations/trpc/react'

export const Route = createFileRoute('/q/$token')({
  head: () => ({
    meta: [
      { title: 'Your estimate' },
      // The URL is a credential: keep it out of search engines and referrers.
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: QuoteLinkPage,
})

function QuoteLinkPage() {
  const { token } = Route.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const valid = /^[0-9a-f]{64}$/.test(token)
  const quote = useQuery({
    ...trpc.quoteLink.get.queryOptions({ token }),
    enabled: valid,
    retry: false,
  })
  const refresh = () =>
    queryClient.invalidateQueries(trpc.quoteLink.get.queryFilter({ token }))
  const approve = useMutation(trpc.quoteLink.approve.mutationOptions())
  const decline = useMutation(trpc.quoteLink.decline.mutationOptions())

  if (!valid || quote.error?.data?.code === 'NOT_FOUND') {
    return <StatusPage kind="link-expired" actions={false} />
  }
  if (quote.isError) {
    return (
      <StatusPage
        kind="error"
        actions={false}
        body="We couldn’t load your estimate. Please reload the page in a moment."
      />
    )
  }
  if (quote.isPending) {
    return (
      <p
        role="status"
        className="min-h-svh bg-(--cream) py-24 text-center text-sm text-(--ink-3)"
      >
        Loading your estimate…
      </p>
    )
  }

  return (
    <QuoteLinkView
      quote={quote.data}
      busy={approve.isPending || decline.isPending}
      error={approve.error?.message ?? decline.error?.message ?? null}
      onApprove={(selectedOptionalLineIds) =>
        approve
          .mutateAsync({ token, selectedOptionalLineIds })
          .then(refresh)
          .then(
            () => true,
            () => false,
          )
      }
      onDecline={(reason) =>
        decline
          .mutateAsync({ token, reason })
          .then(refresh)
          .then(
            () => true,
            () => false,
          )
      }
    />
  )
}
