import { useEffect } from 'react'
import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'

import { useAuth } from '#/integrations/auth/context'
import SidePanel from '#/components/layout/SidePanel'
import Header from '#/components/layout/Header'
import Footer from '#/components/layout/Footer'
import PageLoading from '#/components/layout/PageLoading'

export const Route = createFileRoute('/_authed')({
  component: AuthedLayout,
})

function AuthedLayout() {
  const { isLoading, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/sign-in' })
    }
  }, [isLoading, isAuthenticated, navigate])

  if (isLoading || !isAuthenticated) {
    return <PageLoading />
  }

  return (
    <div className="h-screen">
      <Header />

      <main className="flex h-screen">
        <SidePanel />
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
