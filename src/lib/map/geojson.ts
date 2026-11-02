import { z } from 'zod'

// GeoJSON (RFC 7946) shapes shared by the service area API and the map UI.
// Positions are [longitude, latitude] in EPSG:4326. The database normalizes
// and re-checks every polygon (ST_MakeValid, caps), so these schemas reject
// obviously bad input early and bound the payload size.

export const MAX_SERVICE_AREA_VERTICES = 5000
export const MAX_SERVICE_REGION_VERTICES = 20000

const longitude = z.number().min(-180).max(180)
const latitude = z.number().min(-90).max(90)

// An optional third value (altitude) is allowed and dropped by the database.
export const positionSchema = z
  .tuple([longitude, latitude], z.number())
  .refine((p) => p.length <= 3, {
    message: 'A position has at most three values',
  })

const sameposition = (a: Array<number>, b: Array<number>) =>
  a[0] === b[0] && a[1] === b[1]

export const linearRingSchema = z
  .array(positionSchema)
  .min(4, { message: 'A ring needs at least four positions' })
  .refine((ring) => sameposition(ring[0], ring[ring.length - 1]), {
    message: 'A ring must end where it starts',
  })

const polygonCoordinates = z.array(linearRingSchema).min(1)

export const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: polygonCoordinates,
})

export const multiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(polygonCoordinates).min(1),
})

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: positionSchema,
})

export type PolygonGeometry = z.infer<typeof polygonSchema>
export type MultiPolygonGeometry = z.infer<typeof multiPolygonSchema>
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry
export type PointGeometry = z.infer<typeof pointSchema>

export function countVertices(geometry: AreaGeometry): number {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.reduce(
    (sum, rings) => sum + rings.reduce((n, ring) => n + ring.length, 0),
    0,
  )
}

// A Polygon or MultiPolygon with at most maxVertices positions in total.
export function areaGeometrySchema(maxVertices = MAX_SERVICE_AREA_VERTICES) {
  return z
    .discriminatedUnion('type', [polygonSchema, multiPolygonSchema])
    .refine((g) => countVertices(g) <= maxVertices, {
      message: `A boundary can have at most ${maxVertices} vertices`,
    })
}

// [west, south, east, north]
export const bboxSchema = z
  .tuple([longitude, latitude, longitude, latitude])
  .refine(([w, s, e, n]) => w < e && s < n, {
    message: 'bbox must be [west, south, east, north]',
  })
