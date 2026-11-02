import { useMutation, useQuery } from '@tanstack/react-query'

import { useAuth } from '#/integrations/auth/context'
import { useTRPC } from '#/integrations/trpc/react'
import { useOrganization } from '#/integrations/organization/context'
import type { OrgRole } from '#/integrations/organization/permissions'
import { createSupabaseBrowserClient } from '#/lib/supabase/client'

import type { Database } from '#/types/database'

export type TeamMember = Pick<
  Database['public']['Tables']['organization_members']['Row'],
  | 'id'
  | 'user_id'
  | 'display_name'
  | 'email'
  | 'phone'
  | 'role'
  | 'status'
  | 'color'
  | 'work_days'
  | 'work_start'
  | 'work_end'
>

export const teamMembersKey = (organizationId: string | undefined) =>
  ['team-members', organizationId] as const

// RLS limits rows to orgs the caller belongs to; the explicit org filter picks the active one.
export function useTeamMembers() {
  const { organization } = useOrganization()
  const organizationId = organization?.id

  return useQuery({
    queryKey: teamMembersKey(organizationId),
    enabled: organizationId !== undefined,
    queryFn: async (): Promise<Array<TeamMember>> => {
      const { data, error } = await createSupabaseBrowserClient()
        .from('organization_members')
        .select(
          'id, user_id, display_name, email, phone, role, status, color, work_days, work_start, work_end',
        )
        .eq('organization_id', organizationId!)
        .order('display_name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/** The signed-in user's own member row in the active company. */
export function useMyMember() {
  const { user } = useAuth()
  const members = useTeamMembers()
  const me = user
    ? (members.data?.find((m) => m.user_id === user.id) ?? null)
    : null
  return { me, isLoading: members.isLoading }
}

export type InviteRole = Exclude<OrgRole, 'owner'>

export function useInviteTeamMember() {
  const { organization } = useOrganization()
  const trpc = useTRPC()
  const invite = useMutation(trpc.teams.invite.mutationOptions())
  return {
    ...invite,
    mutateAsync: (input: { email: string; role: InviteRole }) => {
      if (!organization)
        return Promise.reject(new Error('No active organization.'))
      return invite.mutateAsync({ ...input, organizationId: organization.id })
    },
  }
}
