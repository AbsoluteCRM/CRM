import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, requireOrgPermission } from './init'
import {
  generateInviteToken,
  invitationConfig,
  INVITE_TTL_MS,
  sendInvitation,
} from '#/server/invitations'
import type { TRPCRouterRecord } from '@trpc/server'

export const teamsRouter = {
  // Owners and managers keep each member's certifications up to date.
  setCertifications: requireOrgPermission('manageTeam')
    .input(
      z.object({
        memberId: z.uuid(),
        certifications: z
          .array(z.string().trim().min(1).max(80))
          .max(30)
          // Same certification twice (any capitalisation) is saved once.
          .transform((list) =>
            list.filter(
              (c, i) =>
                list.findIndex((x) => x.toLowerCase() === c.toLowerCase()) ===
                i,
            ),
          ),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'teams.setCertifications' }, async () => {
        const { data, error } = await ctx.supabase
          .from('organization_members')
          .update({ certifications: input.certifications })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.memberId)
          .select('id')
        if (error) {
          throw new TRPCError({
            code:
              error.code === '42501' ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',
            message: 'Could not save the certifications. Try again.',
          })
        }
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Team member not found',
          })
        }
        return { certifications: input.certifications }
      }),
    ),

  invite: requireOrgPermission('manageTeam')
    .input(
      z.object({
        email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
        role: z.enum(['admin', 'dispatcher', 'worker']),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'teams.invite' }, async () => {
        const config = invitationConfig()
        const { data: organization, error: orgError } = await ctx.supabase
          .from('organizations')
          .select('name')
          .eq('id', ctx.organizationId)
          .single()
        if (orgError)
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Could not load the team. Try again.',
          })
        const { token, tokenHash } = generateInviteToken()
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
        const { error } = await ctx.supabase
          .from('organization_invitations')
          .insert({
            organization_id: ctx.organizationId,
            email: input.email,
            role: input.role,
            token_hash: tokenHash,
            expires_at: expiresAt,
          })
        let resent = false
        if (error) {
          if (
            error.code !== '23505' ||
            !error.message.includes(
              'organization_invitations_pending_email_idx',
            )
          ) {
            throw new TRPCError({
              code:
                error.code === '42501' ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',
              message:
                'Could not create the invitation. Check your permissions and try again.',
            })
          }
          const { data, error: updateError } = await ctx.supabase
            .from('organization_invitations')
            .update({
              role: input.role,
              token_hash: tokenHash,
              expires_at: expiresAt,
            })
            .eq('organization_id', ctx.organizationId)
            .eq('email', input.email)
            .is('accepted_at', null)
            .select('id')
          if (updateError || data.length !== 1)
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'Could not replace the pending invitation. Try again.',
            })
          resent = true
        }
        const inviteLink = `${config.origin}/accept-invite?token=${token}`
        const delivery = await sendInvitation(config, {
          organization: organization.name,
          role: input.role,
          inviteLink,
          expiresAt,
          email: input.email,
          tokenHash,
        })
        return { inviteLink, resent, delivery }
      }),
    ),
  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'teams.acceptInvite' }, async () => {
        const { data, error } = await ctx.supabase.rpc('accept_invitation', {
          p_token: input.token,
        })
        if (error) {
          if (error.code === '22023')
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message:
                'This invitation is invalid, expired, already used, or intended for another email. Use the invited account or ask for a new invitation.',
            })
          if (error.code === '23505')
            throw new TRPCError({
              code: 'CONFLICT',
              message:
                'You are already a member of this team. Open your dashboard to select it.',
            })
          if (error.code === '42501')
            throw new TRPCError({
              code: 'FORBIDDEN',
              message:
                'This account cannot accept this invitation. Sign in with the invited email or request a new invitation.',
            })
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              'Unable to confirm acceptance. Try again; if you have already joined, open your dashboard.',
          })
        }
        return { organizationId: data.organization_id }
      }),
    ),
} satisfies TRPCRouterRecord
