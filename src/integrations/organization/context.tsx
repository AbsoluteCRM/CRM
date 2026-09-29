/**
 * Organization context for the application.
 * 
 * Fetches the current organization context for the application.
 * Fetches the user permissions within the current organization context.
 * Wraps the application with the organization context.
 */
import { createContext, use, useMemo } from 'react'

import { useAuth } from '#/integrations/auth/context'

import type { ReactNode } from 'react'

// TODO: replace with the real organization/permissions shape once an Organization model exists.
export interface Organization {
  id: string
  name: string
}

interface OrganizationContextValue {
  organization: Organization | null
  permissions: Array<string>
  isLoading: boolean
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()

  // TODO: replace with a real lookup of the user's current organization + permissions.
  const value = useMemo<OrganizationContextValue>(
    () => ({
      organization: null,
      permissions: [],
      isLoading: false,
    }),
    [user, isAuthenticated],
  )

  return <OrganizationContext value={value}>{children}</OrganizationContext>
}

export function useOrganization() {
  const context = use(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider')
  }
  return context
}