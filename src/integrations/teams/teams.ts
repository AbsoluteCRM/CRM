import { useMutation, useQuery } from '@tanstack/react-query'

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
        .select('id, user_id, display_name, email, phone, role, status, color')
        .eq('organization_id', organizationId!)
        .order('display_name', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export type InviteRole = Exclude<OrgRole, 'owner'>

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

// Matches accept_invitation's encode(extensions.digest(p_token, 'sha256'), 'hex').
async function generateInviteToken() {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return { token, tokenHash: toHex(new Uint8Array(digest)) }
}

// Creates a pending invitation, or resends it (new token and expiry) when one is
// already pending for the email. Only the token's hash is stored; no email is sent.
// RLS limits writes to owners and admins of the active org.
export function useInviteTeamMember() {
  const { organization } = useOrganization()
  const organizationId = organization?.id

  return useMutation({
    mutationFn: async (input: {
      email: string
      role: InviteRole
    }): Promise<{ inviteLink: string; resent: boolean }> => {
      if (organizationId === undefined) {
        throw new Error('No active organization.')
      }
      const email = input.email.trim().toLowerCase()
      const { token, tokenHash } = await generateInviteToken()
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
      const supabase = createSupabaseBrowserClient()

      const { error } = await supabase.from('organization_invitations').insert({
        organization_id: organizationId,
        email,
        role: input.role,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })

      let resent = false
      if (error) {
        if (error.code === '42501') {
          throw new Error("You don't have permission to invite team members.")
        }
        if (error.code !== '23505') throw error

        // A pending invite already exists for this email: replace its token.
        const { data, error: updateError } = await supabase
          .from('organization_invitations')
          .update({
            role: input.role,
            token_hash: tokenHash,
            expires_at: expiresAt,
          })
          .eq('organization_id', organizationId)
          .eq('email', email)
          .is('accepted_at', null)
          .select('id')
        if (updateError) throw updateError
        if (data.length === 0) {
          throw new Error('Could not resend the invite; try again.')
        }
        resent = true
      }

      return {
        inviteLink: `${window.location.origin}/accept-invite?token=${token}`,
        resent,
      }
    },
  })
}
