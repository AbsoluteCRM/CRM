import { Navigate, createFileRoute } from '@tanstack/react-router'
import LandingPage from '#/components/landing/LandingPage'
import PageLoading from '#/components/layout/PageLoading'
import { useAuth } from '#/integrations/auth/context'

export const Route = createFileRoute('/')({
  component: IndexPage,
})

function IndexPage() {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return <PageLoading />
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <LandingPage />
}
