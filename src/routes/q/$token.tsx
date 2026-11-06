import { createFileRoute } from '@tanstack/react-router'
import PublicQuote from '#/components/quotes/PublicQuote'
import QuoteConversation from '#/components/quotes/QuoteConversation'
import { usePublicQuote } from '#/integrations/quotes/public'

export const Route = createFileRoute('/q/$token')({
  headers: () => ({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  }),
  head: () => ({
    meta: [
      { title: 'Your quote' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: QuotePage,
})

function QuotePage() {
  const { token } = Route.useParams()
  return <CustomerQuote key={token} token={token} />
}

function CustomerQuote({ token }: { token: string }) {
  const view = usePublicQuote(token)
  return (
    <div className="min-h-svh bg-(--cream)">
      <PublicQuote
        data={view.data}
        unavailable={view.unavailable}
        loading={!view.unavailable && view.quote.isPending}
        error={view.error}
        busy={view.busy}
        onRetry={() => void view.refresh()}
        onApprove={() => view.decide('approve')}
        onDecline={(reason) => view.decide('decline', reason)}
        conversation={
          view.data && (
            <QuoteConversation
              key={token}
              messages={view.history}
              loading={view.messages.isPending}
              error={view.messageError}
              hasOlder={view.messages.hasNextPage}
              loadingOlder={view.messages.isFetchingNextPage}
              onLoadOlder={async () => {
                await view.messages.fetchNextPage()
              }}
              onRetry={() => void view.messages.refetch()}
              onSend={view.post}
            />
          )
        }
      />
    </div>
  )
}
