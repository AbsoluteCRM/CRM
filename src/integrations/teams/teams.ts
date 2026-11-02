import { useMutation, useQuery } from '@tanstack/react-query'

import { useTRPC } from '#/integrations/trpc/react'
import { useActiveOrgId } from '#/integrations/organization/use-role'
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
>

export const teamMembersKey = (organizationId: string | undefined) =>
  ['team-members', organizationId] as const

// RLS limits rows to orgs the caller belongs to; the explicit org filter picks the active one.
export function useTeamMembers() {
  const organizationId = useActiveOrgId()

  return useQuery({
    queryKey: teamMembersKey(organizationId),
    enabled: organizationId !== undefined,
    queryFn: async (): Promise<Array<TeamMember>> => {
      const { data, error } = await createSupabaseBrowserClient()
        .from('organization_members')
        .select('id, user_id, display_name, email, phone, role, status, color')
        .eq('organization_id', organizationId!)
        .order('display_name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export type InviteRole = Exclude<OrgRole, 'owner'>

export function useInviteTeamMember() {
  const organizationId = useActiveOrgId()
  const trpc = useTRPC()
  const invite = useMutation(trpc.teams.invite.mutationOptions())
  return {
    ...invite,
    mutateAsync: (input: { email: string; role: InviteRole }) => {
      if (!organizationId)
        return Promise.reject(new Error('No active organization.'))
      return invite.mutateAsync({ ...input, organizationId })
    },
  }
}
