import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/jobs')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/jobs"!</div>
}
