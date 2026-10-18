import { createFileRoute, useNavigate } from '@tanstack/react-router'

import PageShell from '#/components/crm/PageShell'
import { Alert, Btn, EmptyState } from '#/components/crm/ui'
import RequestsPanel from '#/components/requests/RequestsPanel'
import { useOrganization } from '#/integrations/organization/context'
import { useRequests } from '#/integrations/requests/requests'

export const Route = createFileRoute('/_authed/requests')({
  component: RequestsPage,
})

function RequestsPage() {
  const navigate = useNavigate()
  const { organization, permissions, isLoading, error } = useOrganization()
  const canView = permissions.includes('manageRequests')
  const { requests, services } = useRequests(
    organization?.id,
    canView && !isLoading && !error,
  )

  return (
    <PageShell
      kicker="Leads & service requests"
      title="Requests"
      subtitle="Review incoming requests for your organization."
      allowed={isLoading || !!error || !organization || canView}
      section="Requests"
    >
      {isLoading ? (
        <p className="py-20 text-center text-sm text-(--ink-3)" role="status">
          Loading organization…
        </p>
      ) : error ? (
        <Alert
          title="Couldn't load your organization"
          action={
            <Btn variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Btn>
          }
        >
          {error}
        </Alert>
      ) : !organization ? (
        <EmptyState
          title="No active organization"
          body="Select an organization to view its requests."
        />
      ) : !canView ? null : requests.isError || services.isError ? (
        <Alert
          tone="danger"
          title="Couldn't load requests"
          action={
            <Btn
              variant="outline"
              onClick={() => {
                void requests.refetch()
                void services.refetch()
              }}
            >
              Try again
            </Btn>
          }
        >
          Please try again.
        </Alert>
      ) : requests.isPending || services.isPending ? (
        <p className="py-20 text-center text-sm text-(--ink-3)" role="status">
          Loading requests…
        </p>
      ) : (
        <RequestsPanel
          key={organization.id}
          requests={requests.data}
          services={services.data}
          onOpenRequest={(requestId) =>
            void navigate({ to: '/requests/$requestId', params: { requestId } })
          }
        />
      )}
    </PageShell>
  )
}
