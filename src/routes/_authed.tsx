import { useEffect } from 'react'
import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'

import { useAuth } from '#/integrations/auth/context'
import SidePanel from '#/components/layout/SidePanel'

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
    return <div className="flex min-h-svh items-center justify-center">Loading...</div>
  }

  return (
    <div className="flex min-h-svh">
      <SidePanel />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
