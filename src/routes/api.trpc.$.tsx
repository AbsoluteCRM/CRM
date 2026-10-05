import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { trpcRouter } from '#/integrations/trpc/router'
import { createSupabaseServerClient } from '#/lib/supabase/server'
import { createFileRoute } from '@tanstack/react-router'

function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: trpcRouter,
    endpoint: '/api/trpc',

    createContext: async () => {
      const supabase = createSupabaseServerClient()

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (error) {
        return {
          user: null,
        }
      }

      return {
        user,
      }
    },
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
