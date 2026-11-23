import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import StatusPage from './components/auth/StatusPage'

import type { ReactNode } from 'react'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import TanstackQueryProvider, {
  getContext,
} from './integrations/tanstack-query/root-provider'
import { AuthProvider } from './integrations/auth/context'
import { OrganizationProvider } from './integrations/organization/context'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => <StatusPage kind="not-found" />,
    defaultErrorComponent: ({ error, reset }) => (
      <StatusPage
        kind="error"
        onRetry={() => {
          reset()
          void router.invalidate()
        }}
        details={
          import.meta.env.DEV
            ? error instanceof Error
              ? (error.stack ?? error.message)
              : String(error)
            : undefined
        }
      />
    ),

    Wrap: (props: { children: ReactNode }) => {
      return (
        <TanstackQueryProvider context={context}>
          <AuthProvider>
            <OrganizationProvider>{props.children}</OrganizationProvider>
          </AuthProvider>
        </TanstackQueryProvider>
      )
    },
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
