import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Alert, Btn } from '#/components/crm/ui'
import RequestPage from '#/components/requests/RequestPage'
import QuoteEditor, { QuoteHeaderBadges } from '#/components/quotes/QuoteEditor'
import { useQuoteBuilder } from '#/integrations/quotes/quotes'

export const Route = createFileRoute(
  '/_authed/requests_/$requestId/quotes/$quoteId',
)({
  component: QuoteBuilderRoute,
})

function QuoteBuilderRoute() {
  const { requestId, quoteId } = Route.useParams()

  return (
    <RequestPage kicker="Quote builder" title="Quote">
      {({ organization }) => (
        <Body
          organizationId={organization.id}
          requestId={requestId}
          quoteId={quoteId}
        />
      )}
    </RequestPage>
  )
}

function Body({
  organizationId,
  requestId,
  quoteId,
}: {
  organizationId: string
  requestId: string
  quoteId: string
}) {
  const navigate = useNavigate()
  const builder = useQuoteBuilder(organizationId, quoteId, true)
  const { quote, taxRates, services } = builder.queries

  const back = (
    <Btn
      variant="outline"
      icon={ArrowLeft}
      onClick={() =>
        void navigate({ to: '/requests/$requestId', params: { requestId } })
      }
    >
      Back to request
    </Btn>
  )

  if (quote.isError || taxRates.isError || services.isError) {
    const notFound = quote.error?.data?.code === 'NOT_FOUND'
    return notFound ? (
      <Alert tone="info" title="Quote not found" action={back}>
        It may have been removed, or it belongs to another organization.
      </Alert>
    ) : (
      <Alert
        tone="danger"
        title="Couldn't load this quote"
        action={
          <Btn
            variant="outline"
            onClick={() => {
              void quote.refetch()
              void taxRates.refetch()
              void services.refetch()
            }}
          >
            Try again
          </Btn>
        }
      >
        Please try again.
      </Alert>
    )
  }
  if (quote.isPending || taxRates.isPending || services.isPending) {
    return (
      <p className="py-20 text-center text-sm text-(--ink-3)" role="status">
        Loading quote…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-(--ink-2)">
        <QuoteHeaderBadges quote={quote.data.quote} />
        {back}
      </div>
      <QuoteEditor
        data={quote.data}
        taxRates={taxRates.data}
        services={services.data}
        busy={builder.busy}
        error={builder.error}
        onSaveDetails={builder.saveDetails}
        onSaveLine={builder.saveLine}
        onDeleteLine={builder.deleteLine}
        onPullBack={builder.pullBack}
      />
    </div>
  )
}
