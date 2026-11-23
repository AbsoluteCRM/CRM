import { createFileRoute } from '@tanstack/react-router'

import { useRole } from '#/integrations/organization/use-role'
import PageShell from '#/components/crm/PageShell'
import { RouteBuilder } from '#/components/route-builder/RouteBuilder'

export const Route = createFileRoute('/_authed/route-builder')({
  component: RouteBuilderPage,
})

function RouteBuilderPage() {
  const access = useRole()
  return (
    <PageShell
      kicker="Operations"
      title="Route Builder"
      subtitle="Bring the day together. Build a route, arrange the stops, and choose your crew."
      allowed={access.canSee('route-builder')}
      section="Route Builder"
    >
      <RouteBuilder />
    </PageShell>
  )
}
