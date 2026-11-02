import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { SearchX } from 'lucide-react'

import { EmptyState } from '#/components/crm/ui'
import PortalView from '#/components/portal/PortalView'
import PageLoading from '#/components/layout/PageLoading'
import { Toaster } from '#/lib/toast'
import { useTRPC } from '#/integrations/trpc/react'

export const Route = createFileRoute('/portal/$orgSlug')({
  validateSearch: (search: Record<string, unknown>): { embed?: boolean } => ({
    embed:
      search.embed === true || search.embed === 1 || search.embed === '1'
        ? true
        : undefined,
  }),
  head: () => ({ meta: [{ title: 'Request a service' }] }),
  component: PortalPage,
})

function PortalPage() {
  const { orgSlug } = Route.useParams()
  const { embed = false } = Route.useSearch()
  const trpc = useTRPC()
  const portal = useQuery({
    ...trpc.portal.get.queryOptions({ orgSlug }),
    retry: false,
  })

  return (
    <>
      {portal.isPending ? (
        <PageLoading plain />
      ) : portal.isError ? (
        <div className="min-h-svh bg-[#f7f6f2] px-6 py-16">
          <EmptyState
            icon={SearchX}
            title={
              portal.error.data?.code === 'NOT_FOUND'
                ? 'We couldn’t find that page'
                : 'Something went wrong'
            }
            body={
              portal.error.data?.code === 'NOT_FOUND'
                ? 'Check the link you were given and try again.'
                : 'Please reload the page in a moment.'
            }
          />
        </div>
      ) : (
        <PortalView orgSlug={orgSlug} portal={portal.data} embed={embed} />
      )}
      <Toaster />
    </>
  )
}
