import { createFileRoute } from '@tanstack/react-router'

import PageShell from '#/components/crm/PageShell'
import { canSee, useTenant } from '#/components/crm/store'
import { RouteBuilder } from '#/components/route-builder/RouteBuilder'

export const Route = createFileRoute('/_authed/route-builder')({
  component: RouteBuilderPage,
})

function RouteBuilderPage() {
  const t = useTenant()
  return (
    <PageShell
      kicker="Operations"
      title="Route Builder"
      subtitle="Bring the day together. Build a route, arrange the stops, and choose your crew."
      allowed={canSee(t.role, 'route-builder')}
      section="Route Builder"
    >
      <RouteBuilder />
    </PageShell>
  )
}
