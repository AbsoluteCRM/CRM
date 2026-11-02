import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import {
  companySettingsPatchSchema,
  mergeCompanySettings,
  parseCompanySettings,
} from '#/integrations/settings/schema'
import { dbError } from './errors'
import { organizationProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

const ORG_COLUMNS =
  'id, name, slug, timezone, currency, country, email, phone, address_line1, address_line2, city, region, postal_code, logo_path, settings, updated_at'

const manageSettings = requireOrgPermission('manageSettings')

/** Logos live in the private org-files bucket under `<org id>/branding/`. */
export const LOGO_FOLDER = 'branding'
const logoPath = (organizationId: string) =>
  z
    .string()
    .max(300)
    .refine(
      (p) =>
        p.startsWith(`${organizationId}/${LOGO_FOLDER}/`) &&
        !p.includes('..') &&
        /\.(png|jpe?g|webp)$/i.test(p),
      'Logo must be an image in this organization’s branding folder',
    )

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()

const profileFields = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .refine(
        (v) => v === '' || z.email().safeParse(v).success,
        'Invalid email',
      )
      .transform((v) => (v === '' ? null : v))
      .nullable(),
    phone: nullableText(40),
    address_line1: nullableText(200),
    address_line2: nullableText(200),
    city: nullableText(100),
    region: nullableText(100),
    postal_code: nullableText(20),
    // The database trigger checks it against pg_timezone_names.
    timezone: z.string().trim().min(1).max(64),
  })
  .partial()

type OrgRow = {
  id: string
  name: string
  slug: string
  timezone: string
  currency: string
  country: string
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  logo_path: string | null
  settings: unknown
  updated_at: string
}

export const settingsRouter = {
  /** The active organization's profile and parsed settings. Any member can read it (RLS). */
  get: organizationProcedure.query(({ ctx }) =>
    Sentry.startSpan({ name: 'settings.get' }, async () => {
      const { data, error } = await ctx.supabase
        .from('organizations')
        .select(ORG_COLUMNS)
        .eq('id', ctx.organizationId)
        .maybeSingle()
      if (error) throw dbError(error)
      if (!data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        })
      }
      const row = data as OrgRow
      let logoUrl: string | null = null
      if (row.logo_path) {
        const signed = await ctx.supabase.storage
          .from('org-files')
          .createSignedUrl(row.logo_path, 60 * 60)
        logoUrl = signed.data?.signedUrl ?? null
      }
      const { settings, ...profile } = row
      return {
        ...profile,
        logo_url: logoUrl,
        settings: parseCompanySettings(settings),
      }
    }),
  ),

  updateProfile: manageSettings
    .input(profileFields)
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'settings.updateProfile' }, async () => {
        const { organizationId: _org, ...patch } = input
        if (Object.keys(patch).length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nothing to update',
          })
        }
        const { data, error } = await ctx.supabase
          .from('organizations')
          .update(patch)
          .eq('id', ctx.organizationId)
          .select('id')
        if (error) throw dbError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Organization not found',
          })
        }
        return { ok: true as const }
      }),
    ),

  /** Merges a partial update into `organizations.settings`, keeping unrelated keys. */
  updateSettings: manageSettings
    .input(companySettingsPatchSchema)
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'settings.updateSettings' }, async () => {
        const { organizationId: _org, ...patch } = input
        const current = await ctx.supabase
          .from('organizations')
          .select('settings')
          .eq('id', ctx.organizationId)
          .maybeSingle()
        if (current.error) throw dbError(current.error)
        if (!current.data) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Organization not found',
          })
        }
        const next = mergeCompanySettings(current.data.settings, patch)
        const { data, error } = await ctx.supabase
          .from('organizations')
          .update({ settings: next as never })
          .eq('id', ctx.organizationId)
          .select('settings')
        if (error) throw dbError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can’t change this organization’s settings',
          })
        }
        return parseCompanySettings(data[0].settings)
      }),
    ),

  /** Points the org at an uploaded logo (or clears it) and removes the old file. */
  setLogo: manageSettings
    .input(z.object({ path: z.string().nullable() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'settings.setLogo' }, async () => {
        const path =
          input.path === null
            ? null
            : logoPath(ctx.organizationId).safeParse(input.path)
        if (path !== null && !path.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: path.error.issues[0]?.message ?? 'Invalid logo path',
          })
        }
        const before = await ctx.supabase
          .from('organizations')
          .select('logo_path')
          .eq('id', ctx.organizationId)
          .maybeSingle()
        if (before.error) throw dbError(before.error)
        const { data, error } = await ctx.supabase
          .from('organizations')
          .update({ logo_path: path?.data ?? null })
          .eq('id', ctx.organizationId)
          .select('id')
        if (error) throw dbError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Organization not found',
          })
        }
        const old = before.data?.logo_path
        if (old && old !== path?.data) {
          // Best effort: a leftover file is harmless, a failed save is not.
          await ctx.supabase.storage.from('org-files').remove([old])
        }
        return { ok: true as const }
      }),
    ),

  /** Row counts for the Data & security tab. RLS limits every count to this org. */
  overview: manageSettings.query(({ ctx }) =>
    Sentry.startSpan({ name: 'settings.overview' }, async () => {
      const count = async (
        table: 'clients' | 'services' | 'organization_members' | 'requests',
      ) => {
        const { count: n, error } = await ctx.supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', ctx.organizationId)
        if (error) throw dbError(error)
        return n ?? 0
      }
      const [clients, services, members, requests] = await Promise.all([
        count('clients'),
        count('services'),
        count('organization_members'),
        count('requests'),
      ])
      return { clients, services, members, requests }
    }),
  ),
} satisfies TRPCRouterRecord
