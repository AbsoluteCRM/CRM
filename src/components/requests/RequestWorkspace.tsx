import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { inferRouterOutputs } from '@trpc/server'

import { Alert, Btn } from '#/components/crm/ui'
import QuoteEditor, { QuoteHeaderBadges } from '#/components/quotes/QuoteEditor'
import { useQuoteBuilder, useRequestQuotes } from '#/integrations/quotes/quotes'
import type { TRPCRouter } from '#/integrations/trpc/router'
import RequestDetail from './RequestDetail'

type RequestRow = inferRouterOutputs<TRPCRouter>['requests']['list'][number]

/** Quote revisions and the quote builder, shown inside the request drawer. */
export default function RequestWorkspace({
  request,
  organizationId,
}: {
  request: RequestRow
  organizationId: string
}) {
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const detail = useRequestQuotes(organizationId, request.id)

  if (quoteId) {
    return (
      <BuilderView
        organizationId={organizationId}
        quoteId={quoteId}
        onBack={() => setQuoteId(null)}
      />
    )
  }

  if (detail.quotes.isError) {
    return (
      <Alert
        tone="danger"
        title="Couldn't load quotes"
        action={
          <Btn variant="outline" onClick={() => void detail.quotes.refetch()}>
            Try again
          </Btn>
        }
      >
        Please try again.
      </Alert>
    )
  }
  if (detail.quotes.isPending) {
    return (
      <p className="py-10 text-center text-sm text-(--ink-3)" role="status">
        Loading quotes…
      </p>
    )
  }

  return (
    <RequestDetail
      request={request}
      quotes={detail.quotes.data}
      busy={detail.busy}
      error={detail.error}
      onSaveInfoNeeded={detail.saveInfoNeeded}
      onCreateDraft={async (copyFrom) => {
        const id = await detail.createDraft(copyFrom)
        if (id) setQuoteId(id)
        return id !== null
      }}
      onOpenQuote={setQuoteId}
    />
  )
}

function BuilderView({
  organizationId,
  quoteId,
  onBack,
}: {
  organizationId: string
  quoteId: string
  onBack: () => void
}) {
  const builder = useQuoteBuilder(organizationId, quoteId)
  const { quote, taxRates, services } = builder.queries

  const back = (
    <Btn variant="outline" icon={ArrowLeft} onClick={onBack}>
      Back to quotes
    </Btn>
  )

  if (quote.isError || taxRates.isError || services.isError) {
    return quote.error?.data?.code === 'NOT_FOUND' ? (
      <Alert tone="info" title="Quote not found" action={back}>
        It may have been removed.
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
      <p className="py-10 text-center text-sm text-(--ink-3)" role="status">
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
