import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { dbError } from './errors'
import { organizationProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

const CLIENT_COLUMNS =
  'id, organization_id, kind, status, display_name, first_name, last_name, company_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_region, billing_postal_code, billing_country, lead_source, tags, notes, tax_exempt, created_at, updated_at'

const manageClients = requireOrgPermission('manageClients')

// Trimmed + lowercased to match the DB's `email = lower(email)` check; blank normalizes to null.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.literal(''), z.email().max(254)]))
  .optional()

export const clientsRouter = {
  // Membership is verified; RLS further limits rows to office staff.
  list: organizationProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('clients')
      .select(CLIENT_COLUMNS)
      .eq('organization_id', ctx.organizationId)
      .is('archived_at', null)
      .order('display_name', { ascending: true })
    if (error) throw dbError(error)
    return data
  }),

  create: manageClients
    .input(
      z.object({
        display_name: z.string().trim().min(1).max(200),
        kind: z.enum(['individual', 'company']),
        email: emailField,
        phone: z.string().trim().max(40).optional(),
        company_name: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('clients')
        .insert({
          organization_id: ctx.organizationId,
          display_name: input.display_name,
          kind: input.kind,
          email: input.email || null,
          phone: input.phone || null,
          company_name:
            input.kind === 'company'
              ? (input.company_name ?? input.display_name)
              : null,
        })
        .select(CLIENT_COLUMNS)
        .single()
      if (error) throw dbError(error)
      return data
    }),

  update: manageClients
    .input(
      z
        .object({
          clientId: z.uuid(),
          display_name: z.string().trim().min(1).max(200).optional(),
          kind: z.enum(['individual', 'company']).optional(),
          status: z.enum(['active', 'inactive', 'lead']).optional(),
          email: emailField,
          phone: z.string().trim().max(40).optional(),
          notes: z.string().nullable().optional(),
          company_name: z.string().trim().max(200).optional(),
        })
        .refine(
          (v) =>
            v.display_name !== undefined ||
            v.kind !== undefined ||
            v.status !== undefined ||
            v.email !== undefined ||
            v.phone !== undefined ||
            v.notes !== undefined ||
            v.company_name !== undefined,
          { message: 'Nothing to update' },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('clients')
        .update({
          ...(input.display_name !== undefined && {
            display_name: input.display_name,
          }),
          ...(input.kind !== undefined && { kind: input.kind }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.email !== undefined && { email: input.email || null }),
          ...(input.phone !== undefined && { phone: input.phone || null }),
          ...(input.notes !== undefined && {
            notes: input.notes || null,
          }),
          ...(input.company_name !== undefined && {
            company_name: input.company_name || null,
          }),
        })
        .eq('organization_id', ctx.organizationId)
        .eq('id', input.clientId)
        .select('id')
      if (error) throw dbError(error)
      if (data.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client not found',
        })
      }
      return { id: input.clientId }
    }),
} satisfies TRPCRouterRecord
