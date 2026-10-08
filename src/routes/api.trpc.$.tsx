import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createTRPCContext } from '#/integrations/trpc/init'
import { trpcRouter } from '#/integrations/trpc/router'
import { createFileRoute } from '@tanstack/react-router'

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: trpcRouter,
    endpoint: '/api/trpc',
    createContext: createTRPCContext,
  })
}

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
})
