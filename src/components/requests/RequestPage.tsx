import PageShell from '#/components/crm/PageShell'
import { Alert, Btn, EmptyState } from '#/components/crm/ui'
import { useOrganization } from '#/integrations/organization/context'

import type { ReactNode } from 'react'

type Organization = NonNullable<
  ReturnType<typeof useOrganization>['organization']
>

/** Page frame for request screens: handles the org loading, error and access states. */
export default function RequestPage({
  kicker,
  title,
  subtitle,
  actions,
  children,
}: {
  kicker: string
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: (args: { organization: Organization }) => ReactNode
}) {
  const { organization, permissions, isLoading, error } = useOrganization()
  const canView = permissions.includes('manageRequests')

  return (
    <PageShell
      kicker={kicker}
      title={title}
      subtitle={subtitle}
      actions={actions}
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
      ) : !canView ? null : (
        children({ organization })
      )}
    </PageShell>
  )
}
