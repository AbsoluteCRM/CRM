import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Alert, Btn } from '#/components/crm/ui'
import RequestDetail from '#/components/requests/RequestDetail'
import RequestPage from '#/components/requests/RequestPage'
import { useRequestDetail } from '#/integrations/quotes/quotes'

export const Route = createFileRoute('/_authed/requests_/$requestId')({
  component: RequestDetailRoute,
})

function RequestDetailRoute() {
  const { requestId } = Route.useParams()
  const navigate = useNavigate()

  return (
    <RequestPage
      kicker="Leads & service requests"
      title="Request"
      actions={
        <Btn
          variant="outline"
          icon={ArrowLeft}
          onClick={() => void navigate({ to: '/requests' })}
        >
          All requests
        </Btn>
      }
    >
      {({ organization }) => (
        <Body organizationId={organization.id} requestId={requestId} />
      )}
    </RequestPage>
  )
}

function Body({
  organizationId,
  requestId,
}: {
  organizationId: string
  requestId: string
}) {
  const navigate = useNavigate()
  const detail = useRequestDetail(organizationId, requestId, true)
  const { requests, services, quotes } = detail.queries

  if (requests.isError || services.isError || quotes.isError) {
    return (
      <Alert
        tone="danger"
        title="Couldn't load this request"
        action={
          <Btn
            variant="outline"
            onClick={() => {
              void requests.refetch()
              void services.refetch()
              void quotes.refetch()
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
  if (requests.isPending || services.isPending || quotes.isPending) {
    return (
      <p className="py-20 text-center text-sm text-(--ink-3)" role="status">
        Loading request…
      </p>
    )
  }
  if (!detail.request) {
    return (
      <Alert tone="info" title="Request not found">
        It may have been removed, or it belongs to another organization.
      </Alert>
    )
  }

  const openQuote = (quoteId: string) =>
    void navigate({
      to: '/requests/$requestId/quotes/$quoteId',
      params: { requestId, quoteId },
    })

  return (
    <RequestDetail
      request={detail.request}
      service={services.data.find((s) => s.id === detail.request?.service_id)}
      quotes={quotes.data}
      busy={detail.busy}
      error={detail.error}
      onSaveInfoNeeded={detail.saveInfoNeeded}
      onCreateDraft={async (copyFrom) => {
        const id = await detail.createDraft(copyFrom)
        if (id) openQuote(id)
        return id !== null
      }}
      onOpenQuote={openQuote}
    />
  )
}
