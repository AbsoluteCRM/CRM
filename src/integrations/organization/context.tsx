/**
 * Organization context for the application.
 *
 * Fetches the current organization context for the application.
 * Fetches the user permissions within the current organization context.
 * Wraps the application with the organization context.
 */
import { createContext, use, useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '#/integrations/auth/context'
import { createSupabaseBrowserClient } from '#/lib/supabase/client'
import { can, isOrgRole } from './permissions'

import type { ReactNode } from 'react'
import type { OrgRole } from './permissions'

export interface Organization {
  id: string
  name: string
  role: OrgRole
  permissions: Array<string>
}

interface OrganizationContextValue {
  organizations: Array<Organization>
  organization: Organization | null
  permissions: Array<string>
  isLoading: boolean
  error: string | null
  setActiveOrganization: (id: string) => void
  reloadAndSelectOrganization: (id: string) => Promise<void>
}

interface OrganizationState {
  userId: string | null
  organizations: Array<Organization>
  activeId: string | null
  isLoading: boolean
  error: string | null
}

function emptyState(userId: string | null = null): OrganizationState {
  return {
    userId,
    organizations: [],
    activeId: null,
    isLoading: userId !== null,
    error: null,
  }
}

function storageKey(userId: string) {
  return `crm:active-organization:${userId}`
}

function savedOrganization(userId: string) {
  try {
    return window.localStorage.getItem(storageKey(userId))
  } catch {
    return null
  }
}

function saveOrganization(userId: string, id: string) {
  try {
    window.localStorage.setItem(storageKey(userId), id)
  } catch {
    // Selection still works in memory when browser storage is unavailable.
  }
}

function membershipOrganization(row: unknown): Organization | null {
  if (typeof row !== 'object' || row === null || !('role' in row)) return null
  if (!isOrgRole(row.role) || !('organizations' in row)) return null
  const org = row.organizations
  if (
    typeof org !== 'object' ||
    org === null ||
    !('id' in org) ||
    typeof org.id !== 'string' ||
    !org.id ||
    !('name' in org) ||
    typeof org.name !== 'string'
  ) {
    return null
  }
  const role = row.role
  return {
    id: org.id,
    name: org.name,
    role,
    permissions: Object.entries(can)
      .filter(([, allowed]) => allowed(role))
      .map(([permission]) => permission),
  }
}

// Create a context for managing the current organization and its related state.
const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const userId = isAuthenticated ? (user?.id ?? null) : null
  const [state, setState] = useState<OrganizationState>(() => emptyState())

  const currentUserId = useRef(userId)
  currentUserId.current = userId
  const loadVersion = useRef(0)

  // Fetch context on user authentication change
  useEffect(() => {
    if (isAuthLoading || !userId) {
      setState(emptyState())
      return
    }

    let cancelled = false
    const version = ++loadVersion.current
    setState(emptyState(userId))

    async function loadOrganizations() {
      try {
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from('organization_members')
          .select(
            'role, organizations!organization_members_organization_id_fkey(id, name)',
          )
          .eq('user_id', userId!)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })

        if (cancelled || version !== loadVersion.current) return
        if (error) throw error

        const organizations: Array<Organization> = []
        for (const row of data) {
          const organization = membershipOrganization(row)
          if (organization) organizations.push(organization)
        }

        const savedId = savedOrganization(userId!)
        const activeId =
          organizations.find((org) => org.id === savedId)?.id ??
          organizations.at(0)?.id ??
          null
        setState({
          userId,
          organizations,
          activeId,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        if (cancelled || version !== loadVersion.current) return
        setState({
          ...emptyState(userId),
          isLoading: false,
          error:
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
              ? error.message
              : 'Failed to load organizations',
        })
      }
    }

    void loadOrganizations()
    return () => {
      cancelled = true
    }
  }, [userId, isAuthLoading])

  const value = useMemo<OrganizationContextValue>(() => {
    const isCurrentUser =
      !isAuthLoading && userId !== null && state.userId === userId
    const organizations = isCurrentUser ? state.organizations : []
    const organization =
      organizations.find((org) => org.id === state.activeId) ?? null

    return {
      organizations,
      organization,
      permissions: organization?.permissions ?? [],
      isLoading:
        isAuthLoading ||
        (userId !== null && (!isCurrentUser || state.isLoading)),
      error: isCurrentUser ? state.error : null,
      reloadAndSelectOrganization: async (id) => {
        const requestedUser = userId
        if (!requestedUser) throw new Error('Sign in to open your team.')
        const version = ++loadVersion.current
        const supabase = createSupabaseBrowserClient()
        const { data, error } = await supabase
          .from('organization_members')
          .select(
            'role, organizations!organization_members_organization_id_fkey(id, name)',
          )
          .eq('user_id', requestedUser)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
        if (error)
          throw new Error('Could not load your teams. Retry opening the team.')
        const { data: auth } = await supabase.auth.getUser()
        if (
          auth.user?.id !== requestedUser ||
          currentUserId.current !== requestedUser ||
          version !== loadVersion.current
        ) {
          throw new Error(
            'Your account changed. Sign in and open your team from the dashboard.',
          )
        }
        const loaded = data
          .map(membershipOrganization)
          .filter((org): org is Organization => org !== null)
        if (!loaded.some((org) => org.id === id))
          throw new Error(
            'Your team is not available yet. Retry opening the team.',
          )
        setState({
          userId: requestedUser,
          organizations: loaded,
          activeId: id,
          isLoading: false,
          error: null,
        })
        saveOrganization(requestedUser, id)
      },
      setActiveOrganization: (id) => {
        if (!userId || !organizations.some((org) => org.id === id)) return
        setState((current) =>
          current.userId === userId ? { ...current, activeId: id } : current,
        )
        saveOrganization(userId, id)
      },
    }
  }, [userId, isAuthLoading, state])

  return <OrganizationContext value={value}>{children}</OrganizationContext>
}

export function useOrganization() {
  const context = use(OrganizationContext)
  if (!context) {
    throw new Error(
      'useOrganization must be used within an OrganizationProvider',
    )
  }
  return context
}
