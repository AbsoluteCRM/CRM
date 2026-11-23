import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'

export const PROPERTY_COLUMNS =
  'id, organization_id, client_id, name, address_line1, address_line2, city, region, postal_code, country, latitude, longitude, geocode_source, access_notes, lot_size_sqft, created_at, updated_at'

const manageClients = requireOrgPermission('manageClients')

function toTRPCError(error: { message: string; code?: string }) {
  const code =
    error.code === '42501'
      ? 'FORBIDDEN'
      : error.code === '23503' || error.code === '23514'
        ? 'BAD_REQUEST'
        : 'INTERNAL_SERVER_ERROR'
  return new TRPCError({ code, message: error.message, cause: error })
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

/**
 * A full postal address. Coordinates come from the address search (Geoapify);
 * typed addresses have none, and saving one clears any stale coordinates.
 */
export const addressInput = z
  .object({
    address_line1: z.string().trim().min(1).max(200),
    address_line2: optionalText(100),
    city: z.string().trim().min(1).max(100),
    region: optionalText(60),
    postal_code: optionalText(20).transform((v) => v?.toUpperCase() ?? null),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Use a two-letter country code'),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .refine((a) => (a.latitude === undefined) === (a.longitude === undefined), {
    message: 'Latitude and longitude go together',
  })

type AddressInput = z.output<typeof addressInput>

/** Columns for an address, including the geocode (or clearing it). */
function addressColumns(a: AddressInput) {
  const located = a.latitude !== undefined && a.longitude !== undefined
  return {
    address_line1: a.address_line1,
    address_line2: a.address_line2,
    city: a.city,
    region: a.region,
    postal_code: a.postal_code,
    country: a.country,
    location: located ? `SRID=4326;POINT(${a.longitude} ${a.latitude})` : null,
    geocoded_at: located ? new Date().toISOString() : null,
    geocode_source: located ? 'geoapify' : null,
  }
}

// Undefined leaves a field alone; null or blank clears it.
const detailsInput = {
  name: z.string().trim().max(80).nullable().optional(),
  access_notes: z.string().trim().max(2000).nullable().optional(),
  lot_size_sqft: z
    .number()
    .int()
    .positive()
    .max(100_000_000)
    .nullable()
    .optional(),
}

export const propertiesRouter = {
  // Every active property in the org. RLS limits rows to office staff.
  list: protectedProcedure
    .input(z.object({ organizationId: z.uuid() }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'properties.list' }, async () => {
        const { data, error } = await ctx.supabase
          .from('properties')
          .select(PROPERTY_COLUMNS)
          .eq('organization_id', input.organizationId)
          .is('archived_at', null)
          .order('created_at', { ascending: true })
        if (error) throw toTRPCError(error)
        return data
      }),
    ),

  create: manageClients
    .input(
      z.object({
        clientId: z.uuid(),
        address: addressInput,
        ...detailsInput,
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'properties.create' }, async () => {
        const { data, error } = await ctx.supabase
          .from('properties')
          .insert({
            organization_id: ctx.organizationId,
            client_id: input.clientId,
            name: input.name || null,
            access_notes: input.access_notes || null,
            lot_size_sqft: input.lot_size_sqft ?? null,
            ...addressColumns(input.address),
          })
          .select(PROPERTY_COLUMNS)
          .single()
        // A client id from another org fails the composite foreign key.
        if (error) throw toTRPCError(error)
        return data
      }),
    ),

  update: manageClients
    .input(
      z.object({
        propertyId: z.uuid(),
        address: addressInput.optional(),
        ...detailsInput,
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'properties.update' }, async () => {
        const patch = {
          ...(input.address && addressColumns(input.address)),
          ...(input.name !== undefined && { name: input.name || null }),
          ...(input.access_notes !== undefined && {
            access_notes: input.access_notes || null,
          }),
          ...(input.lot_size_sqft !== undefined && {
            lot_size_sqft: input.lot_size_sqft,
          }),
        }
        if (Object.keys(patch).length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nothing to update',
          })
        }
        const { data, error } = await ctx.supabase
          .from('properties')
          .update(patch)
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.propertyId)
          .is('archived_at', null)
          .select(PROPERTY_COLUMNS)
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Property not found',
          })
        }
        return data[0]
      }),
    ),

  // Archived, not deleted: past jobs and quotes still point at it.
  archive: manageClients
    .input(z.object({ propertyId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'properties.archive' }, async () => {
        const { data, error } = await ctx.supabase
          .from('properties')
          .update({ archived_at: new Date().toISOString() })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.propertyId)
          .is('archived_at', null)
          .select('id')
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Property not found',
          })
        }
        return { id: input.propertyId }
      }),
    ),
} satisfies TRPCRouterRecord
