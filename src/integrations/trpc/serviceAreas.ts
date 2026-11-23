import * as Sentry from '@sentry/tanstackstart-react'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { dbError } from './errors'
import { organizationProcedure, requireOrgPermission } from './init'

import type { TRPCRouterRecord } from '@trpc/server'
import type { MultiPolygonGeometry } from '#/lib/map/geojson'
import {
  MAX_SERVICE_REGION_VERTICES,
  areaGeometrySchema,
  bboxSchema,
  pointSchema,
} from '#/lib/map/geojson'

// Service areas are polygons a crew covers; regions are the cities used to
// frame the map. Geometry crosses the API only as GeoJSON, through RPCs that
// validate and normalize it (ADR 0012). Every call is scoped to the verified
// organization, and RLS (ctx.supabase) is the access control.

export type ServiceAreaFeature = {
  type: 'Feature'
  id: string
  geometry: MultiPolygonGeometry
  properties: {
    id: string
    name: string
    crew_id: string | null
    region_id: string | null
    color: string | null
    priority: number
    area_m2: number
    archived_at: string | null
    updated_at: string
    property_count: number
    overlapping_area_ids: Array<string>
    rotations: Array<{ weekday: number; crew_id: string }>
  }
}

export type ServiceRegionFeature = {
  type: 'Feature'
  id: string
  geometry: MultiPolygonGeometry | null
  properties: {
    id: string
    name: string
    center: [number, number]
    bbox: [number, number, number, number] | null
    source: string | null
    source_ref: string | null
    updated_at: string
  }
}

export type FeatureCollection<TFeature> = {
  type: 'FeatureCollection'
  features: Array<TFeature>
}

export type ServiceAreaPreview = {
  changes: Array<{
    property_id: string
    address_line1: string
    from_area_id: string | null
    to_area_id: string | null
    // True when the area being edited (or created) would win the property.
    to_preview: boolean
  }>
  overlapping_area_ids: Array<string>
  area_m2: number
  vertex_count: number
  geometry: MultiPolygonGeometry
}

export type ServiceAreaCoverage = {
  areas: Array<{
    id: string
    name: string
    crew_id: string | null
    property_count: number
  }>
  covered_count: number
  uncovered_count: number
  no_location_count: number
}

const manageServiceAreas = requireOrgPermission('manageServiceAreas')
const viewCoverage = requireOrgPermission('viewServiceAreaCoverage')

const areaInput = z.object({
  id: z.uuid().nullish(),
  name: z.string().trim().min(1).max(120),
  crewId: z.uuid().nullish(),
  regionId: z.uuid().nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
  priority: z.number().int().min(-1000).max(1000).default(0),
  boundary: areaGeometrySchema(),
})

type AreaInput = z.infer<typeof areaInput>

function areaArgs(organizationId: string, input: AreaInput) {
  return {
    p_organization_id: organizationId,
    p_id: input.id ?? undefined,
    p_name: input.name,
    p_crew_id: input.crewId ?? undefined,
    p_region_id: input.regionId ?? undefined,
    p_color: input.color ?? undefined,
    p_priority: input.priority,
    p_geojson: input.boundary,
  }
}

const regionsRouter = {
  list: organizationProcedure.query(({ ctx }) =>
    Sentry.startSpan({ name: 'serviceAreas.regions.list' }, async () => {
      const { data, error } = await ctx.supabase.rpc(
        'service_regions_geojson',
        { p_organization_id: ctx.organizationId },
      )
      if (error) throw dbError(error)
      return data as unknown as FeatureCollection<ServiceRegionFeature>
    }),
  ),

  upsert: manageServiceAreas
    .input(
      z
        .object({
          id: z.uuid().nullish(),
          name: z.string().trim().min(1).max(120),
          boundary: areaGeometrySchema(MAX_SERVICE_REGION_VERTICES).nullish(),
          center: pointSchema.nullish(),
          bbox: bboxSchema.nullish(),
          source: z.string().trim().min(1).max(40).nullish(),
          sourceRef: z.string().trim().min(1).max(200).nullish(),
        })
        .refine((v) => v.boundary != null || v.center != null, {
          message: 'A region needs a boundary or a center',
        }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'serviceAreas.regions.upsert' }, async () => {
        const { data, error } = await ctx.supabase.rpc(
          'upsert_service_region',
          {
            p_organization_id: ctx.organizationId,
            p_id: input.id ?? undefined,
            p_name: input.name,
            p_boundary: input.boundary ?? undefined,
            p_center: input.center ?? undefined,
            p_bbox: input.bbox ?? undefined,
            p_source: input.source ?? undefined,
            p_source_ref: input.sourceRef ?? undefined,
          },
        )
        if (error) throw dbError(error)
        return { id: data }
      }),
    ),
} satisfies TRPCRouterRecord

const rotationsRouter = {
  // Replaces the area's weekday → crew map; an empty list clears it.
  set: manageServiceAreas
    .input(
      z.object({
        serviceAreaId: z.uuid(),
        rotations: z
          .array(
            z.object({
              weekday: z.number().int().min(1).max(7),
              crewId: z.uuid(),
            }),
          )
          .max(7)
          .refine(
            (rs) => new Set(rs.map((r) => r.weekday)).size === rs.length,
            { message: 'Each weekday can appear once' },
          ),
      }),
    )
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'serviceAreas.rotations.set' }, async () => {
        const { error } = await ctx.supabase.rpc('set_service_area_rotations', {
          p_organization_id: ctx.organizationId,
          p_service_area_id: input.serviceAreaId,
          p_rotations: input.rotations.map((r) => ({
            weekday: r.weekday,
            crew_id: r.crewId,
          })),
        })
        if (error) throw dbError(error)
      }),
    ),
} satisfies TRPCRouterRecord

export const serviceAreasRouter = {
  // All staff. RLS admits every org the caller belongs to; the RPC filters
  // by the verified org.
  list: organizationProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }))
    .query(({ ctx, input }) =>
      Sentry.startSpan({ name: 'serviceAreas.list' }, async () => {
        const { data, error } = await ctx.supabase.rpc(
          'service_areas_geojson',
          {
            p_organization_id: ctx.organizationId,
            p_include_archived: input.includeArchived ?? false,
          },
        )
        if (error) throw dbError(error)
        return data as unknown as FeatureCollection<ServiceAreaFeature>
      }),
    ),

  upsert: manageServiceAreas.input(areaInput).mutation(({ ctx, input }) =>
    Sentry.startSpan({ name: 'serviceAreas.upsert' }, async () => {
      const { data, error } = await ctx.supabase.rpc(
        'upsert_service_area',
        areaArgs(ctx.organizationId, input),
      )
      if (error) throw dbError(error)
      return { id: data }
    }),
  ),

  // Dry run of upsert: which properties would change area, and overlaps.
  preview: manageServiceAreas.input(areaInput).mutation(({ ctx, input }) =>
    Sentry.startSpan({ name: 'serviceAreas.preview' }, async () => {
      const { data, error } = await ctx.supabase.rpc(
        'preview_service_area',
        areaArgs(ctx.organizationId, input),
      )
      if (error) throw dbError(error)
      return data as unknown as ServiceAreaPreview
    }),
  ),

  archive: manageServiceAreas
    .input(z.object({ id: z.uuid(), archived: z.boolean() }))
    .mutation(({ ctx, input }) =>
      Sentry.startSpan({ name: 'serviceAreas.archive' }, async () => {
        const { data, error } = await ctx.supabase
          .from('service_areas')
          .update({
            archived_at: input.archived ? new Date().toISOString() : null,
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', input.id)
          .select('id')
        if (error) throw dbError(error)
        if (data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Service area not found',
          })
        }
        return { id: input.id }
      }),
    ),

  coverage: viewCoverage.query(({ ctx }) =>
    Sentry.startSpan({ name: 'serviceAreas.coverage' }, async () => {
      const { data, error } = await ctx.supabase.rpc('service_area_coverage', {
        p_organization_id: ctx.organizationId,
      })
      if (error) throw dbError(error)
      return data as unknown as ServiceAreaCoverage
    }),
  ),

  regions: regionsRouter,
  rotations: rotationsRouter,
} satisfies TRPCRouterRecord
