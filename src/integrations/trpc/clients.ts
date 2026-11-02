import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { protectedProcedure, requireOrgPermission } from './init'
import { getGeocoder } from '#/server/geo'
import {
  geocodeKeyChanged,
  isValidLonLat,
  locationColumns,
  locationStatus,
} from '#/server/geo/address'
import { geocodeAddressCached } from '#/server/trusted/geocode-cache'
import type { AddressInput } from '#/server/geo/types'

import type { TRPCRouterRecord } from '@trpc/server'

export const CLIENT_COLUMNS =
  'id, organization_id, kind, status, display_name, first_name, last_name, company_name, email, phone, billing_address_line1, billing_address_line2, billing_city, billing_region, billing_postal_code, billing_country, lead_source, tags, notes, tax_exempt, created_at, updated_at'

// Never the raw `location` (geography); the generated lat/lng stand in for it.
export const PROPERTY_COLUMNS =
  'id, organization_id, client_id, name, address_line1, address_line2, city, region, postal_code, country, latitude, longitude, geocoded_at, geocode_source, geocode_accuracy, access_notes, lot_size_sqft, created_at, updated_at'

const manageClients = requireOrgPermission('manageClients')

type PropertyRow = {
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
  geocode_accuracy: string | null
}

function withLocationStatus<T extends PropertyRow>(row: T) {
  return { ...row, location_status: locationStatus(row) }
}

function toAddress(row: {
  address_line1: string
  address_line2?: string | null
  city: string
  region?: string | null
  postal_code?: string | null
  country: string
}): AddressInput {
  return {
    line1: row.address_line1,
    line2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
  }
}

// Geocode server-side, cache first. Never throws: a failure is a null point
// and the property still saves.
async function geocodeForSave(address: AddressInput) {
  try {
    return await geocodeAddressCached(address, { geocoder: getGeocoder() })
  } catch {
    return null
  }
}

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()

const propertyFields = {
  name: optionalText(200),
  address_line1: z.string().trim().min(1).max(200),
  address_line2: optionalText(200),
  city: z.string().trim().min(1).max(120),
  region: optionalText(120),
  postal_code: optionalText(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  access_notes: z.string().max(2000).nullable().optional(),
  lot_size_sqft: z.number().int().positive().nullable().optional(),
}

const blankToNull = (v: string | null | undefined) =>
  v === undefined ? undefined : v || null

function toTRPCError(error: { message: string; code?: string }) {
  const code =
    error.code === '23505'
      ? 'CONFLICT'
      : error.code === '42501'
        ? 'FORBIDDEN'
        : error.code === 'P0002' || error.code === '23503'
          ? 'BAD_REQUEST'
          : 'INTERNAL_SERVER_ERROR'
  return new TRPCError({ code, message: error.message, cause: error })
}

// Trimmed + lowercased to match the DB's `email = lower(email)` check; blank normalizes to null.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.literal(''), z.email().max(254)]))
  .optional()

export const clientsRouter = {
  // RLS limits rows to orgs the caller is office staff in; the org filter picks the active one.
  list: protectedProcedure
    .input(z.object({ organizationId: z.uuid() }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'clients.list' }, async () => {
        const { data, error } = await ctx.supabase
          .from('clients')
          .select(CLIENT_COLUMNS)
          .eq('organization_id', input.organizationId)
          .is('archived_at', null)
          .order('display_name', { ascending: true })
        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
            cause: error,
          })
        }
        return data
      }),
    ),

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
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'clients.create' }, async () => {
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
        if (error) throw toTRPCError(error)
        return data
      }),
    ),

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
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'clients.update' }, async () => {
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
        if (error) throw toTRPCError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Client not found',
          })
        }
        return { id: input.clientId }
      }),
    ),

  properties: {
    list: manageClients
      .input(z.object({ clientId: z.uuid() }))
      .query(({ ctx, input }) =>
        Sentry.startSpan({ name: 'clients.properties.list' }, async () => {
          const { data, error } = await ctx.supabase
            .from('properties')
            .select(PROPERTY_COLUMNS)
            .eq('organization_id', ctx.organizationId)
            .eq('client_id', input.clientId)
            .is('archived_at', null)
            .order('created_at', { ascending: true })
          if (error) throw toTRPCError(error)
          return data.map(withLocationStatus)
        }),
      ),

    create: manageClients
      .input(
        z.object({
          clientId: z.uuid(),
          ...propertyFields,
          country: propertyFields.country.default('CA'),
        }),
      )
      .mutation(({ ctx, input }) =>
        Sentry.startSpan({ name: 'clients.properties.create' }, async () => {
          const fields = {
            name: blankToNull(input.name) ?? null,
            address_line1: input.address_line1,
            address_line2: blankToNull(input.address_line2) ?? null,
            city: input.city,
            region: blankToNull(input.region) ?? null,
            postal_code: blankToNull(input.postal_code) ?? null,
            country: input.country,
            access_notes: blankToNull(input.access_notes) ?? null,
            lot_size_sqft: input.lot_size_sqft ?? null,
          }
          const geocoded = await geocodeForSave(toAddress(fields))
          const { data, error } = await ctx.supabase
            .from('properties')
            .insert({
              organization_id: ctx.organizationId,
              client_id: input.clientId,
              ...fields,
              ...locationColumns(geocoded),
            })
            .select(PROPERTY_COLUMNS)
            .single()
          if (error) throw toTRPCError(error)
          return withLocationStatus(data)
        }),
      ),

    update: manageClients
      .input(
        z
          .object({
            propertyId: z.uuid(),
            ...propertyFields,
            address_line1: propertyFields.address_line1.optional(),
            city: propertyFields.city.optional(),
            country: propertyFields.country.optional(),
          })
          .refine(
            ({ propertyId: _id, ...rest }) =>
              Object.values(rest as Record<string, unknown>).some(
                (v) => v !== undefined,
              ),
            { message: 'Nothing to update' },
          ),
      )
      .mutation(({ ctx, input }) =>
        Sentry.startSpan({ name: 'clients.properties.update' }, async () => {
          const current = await ctx.supabase
            .from('properties')
            .select(
              'address_line1, address_line2, city, region, postal_code, country, latitude, geocode_source',
            )
            .eq('organization_id', ctx.organizationId)
            .eq('id', input.propertyId)
            .maybeSingle()
          if (current.error) throw toTRPCError(current.error)
          if (!current.data) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Property not found',
            })
          }
          const before = current.data
          const changes = {
            ...(input.name !== undefined && { name: blankToNull(input.name) }),
            ...(input.address_line1 !== undefined && {
              address_line1: input.address_line1,
            }),
            ...(input.address_line2 !== undefined && {
              address_line2: blankToNull(input.address_line2),
            }),
            ...(input.city !== undefined && { city: input.city }),
            ...(input.region !== undefined && {
              region: blankToNull(input.region),
            }),
            ...(input.postal_code !== undefined && {
              postal_code: blankToNull(input.postal_code),
            }),
            ...(input.country !== undefined && { country: input.country }),
            ...(input.access_notes !== undefined && {
              access_notes: blankToNull(input.access_notes),
            }),
            ...(input.lot_size_sqft !== undefined && {
              lot_size_sqft: input.lot_size_sqft,
            }),
          }
          const after = toAddress({ ...before, ...changes })
          const addressChanged = geocodeKeyChanged(toAddress(before), after)
          // A manual pin stands until the address changes. A row with no
          // point (a past failure) retries on any save.
          const retry =
            before.latitude === null && before.geocode_source !== 'manual'
          let location = {}
          let retryLocation: ReturnType<typeof locationColumns> | null = null
          if (addressChanged || retry) {
            const geocoded = await geocodeForSave(after)
            if (addressChanged) {
              // The address text changed, so the old point (even a pin) is stale.
              location = locationColumns(geocoded)
            } else if (geocoded) {
              // Retry only: written separately below with a guard, so a pin
              // dropped since the read can't be overwritten.
              retryLocation = locationColumns(geocoded)
            }
          }
          const { data, error } = await ctx.supabase
            .from('properties')
            .update({ ...changes, ...location })
            .eq('organization_id', ctx.organizationId)
            .eq('id', input.propertyId)
            .select(PROPERTY_COLUMNS)
          if (error) throw toTRPCError(error)
          if (data.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Property not found',
            })
          }
          if (retryLocation) {
            // A manual pin always has a location, so `location is null`
            // rejects the write if one was set meanwhile.
            const guarded = await ctx.supabase
              .from('properties')
              .update(retryLocation)
              .eq('organization_id', ctx.organizationId)
              .eq('id', input.propertyId)
              .is('location', null)
              .select(PROPERTY_COLUMNS)
            if (guarded.error) throw toTRPCError(guarded.error)
            if (guarded.data.length > 0) {
              return withLocationStatus(guarded.data[0])
            }
            const reread = await ctx.supabase
              .from('properties')
              .select(PROPERTY_COLUMNS)
              .eq('organization_id', ctx.organizationId)
              .eq('id', input.propertyId)
            if (reread.error) throw toTRPCError(reread.error)
            if (reread.data.length > 0) {
              return withLocationStatus(reread.data[0])
            }
          }
          return withLocationStatus(data[0])
        }),
      ),

    // A dropped pin. Wins over geocoding until the address text changes.
    setLocation: manageClients
      .input(
        z
          .object({
            propertyId: z.uuid(),
            lon: z.number().min(-180).max(180),
            lat: z.number().min(-90).max(90),
          })
          .refine((v) => isValidLonLat(v.lon, v.lat), {
            message: 'Invalid coordinates',
          }),
      )
      .mutation(({ ctx, input }) =>
        Sentry.startSpan(
          { name: 'clients.properties.setLocation' },
          async () => {
            const { data, error } = await ctx.supabase
              .from('properties')
              .update(
                locationColumns({
                  lon: input.lon,
                  lat: input.lat,
                  accuracy: 'rooftop',
                  source: 'manual',
                }),
              )
              .eq('organization_id', ctx.organizationId)
              .eq('id', input.propertyId)
              .select(PROPERTY_COLUMNS)
            if (error) throw toTRPCError(error)
            if (data.length === 0) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Property not found',
              })
            }
            return withLocationStatus(data[0])
          },
        ),
      ),
  },
} satisfies TRPCRouterRecord
