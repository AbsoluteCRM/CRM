import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/clients')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/clients"!</div>
}
