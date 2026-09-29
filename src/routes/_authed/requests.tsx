import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/requests')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/requests"!</div>
}
