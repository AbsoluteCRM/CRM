/**
 * Pure helpers for the service area editor. Nothing here imports `ol`, so the
 * list, the form, and the stories can use it without loading the map library.
 */
import type { LonLat } from '#/lib/map/geo'
import type { AreaGeometry, PolygonGeometry } from '#/lib/map/geojson'
import type {
  ServiceAreaFeature,
  ServiceRegionFeature,
} from '#/integrations/trpc/serviceAreas'

/** `[west, south, east, north]` in lon/lat. */
export type Bbox = [number, number, number, number]

export const DEFAULT_AREA_COLOR = '#2f7350'

/** Area colours, matched to the Services palette so crews stay recognisable. */
export const AREA_PALETTE: Array<{ name: string; value: string }> = [
  { name: 'Leaf', value: '#2f7350' },
  { name: 'Lime', value: '#7fb547' },
  { name: 'Sky', value: '#4fa3a5' },
  { name: 'Marigold', value: '#d98a3d' },
  { name: 'Rose', value: '#e07a8f' },
  { name: 'Clay', value: '#8a5a3c' },
  { name: 'Violet', value: '#7a67c9' },
  { name: 'Slate', value: '#55616a' },
]

/** ISO weekdays, as stored in `service_area_rotations`. */
export const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

export const PRIORITY_MIN = -1000
export const PRIORITY_MAX = 1000

export interface CrewOption {
  id: string
  name: string
  color: string | null
}

/** What the form edits. `boundary` is null until a polygon is drawn. */
export interface AreaDraft {
  /** Null for a new area. */
  id: string | null
  name: string
  crewId: string | null
  color: string
  priority: number
  boundary: AreaGeometry | null
  rotationOn: boolean
  /** ISO weekday to crew id. */
  rotations: Record<number, string>
}

export function emptyDraft(color = DEFAULT_AREA_COLOR): AreaDraft {
  return {
    id: null,
    name: '',
    crewId: null,
    color,
    priority: 0,
    boundary: null,
    rotationOn: false,
    rotations: {},
  }
}

export function draftFromArea(area: ServiceAreaFeature): AreaDraft {
  const rotations: Record<number, string> = {}
  for (const r of area.properties.rotations) rotations[r.weekday] = r.crew_id
  return {
    id: area.properties.id,
    name: area.properties.name,
    crewId: area.properties.crew_id,
    color: area.properties.color ?? DEFAULT_AREA_COLOR,
    priority: area.properties.priority,
    boundary: area.geometry,
    rotationOn: area.properties.rotations.length > 0,
    rotations,
  }
}

/** A colour for a new area: the first palette entry no listed area uses. */
export function nextColor(areas: Array<ServiceAreaFeature>): string {
  const used = new Set(areas.map((a) => a.properties.color?.toLowerCase()))
  return (
    AREA_PALETTE.find((c) => !used.has(c.value.toLowerCase()))?.value ??
    DEFAULT_AREA_COLOR
  )
}

/** Why the draft cannot be previewed yet, or null when it can. */
export function draftProblem(draft: AreaDraft): string | null {
  if (draft.name.trim() === '') return 'Name the area.'
  if (!draft.boundary) return 'Draw the area on the map first.'
  if (
    !Number.isInteger(draft.priority) ||
    draft.priority < PRIORITY_MIN ||
    draft.priority > PRIORITY_MAX
  ) {
    return `Priority is a whole number from ${PRIORITY_MIN} to ${PRIORITY_MAX}.`
  }
  return null
}

/** The `serviceAreas.upsert` / `preview` input for a valid draft. */
export function toAreaInput(draft: AreaDraft, regionId: string | null) {
  if (!draft.boundary) throw new Error('The draft has no boundary')
  return {
    id: draft.id,
    name: draft.name.trim(),
    crewId: draft.crewId,
    regionId,
    color: draft.color,
    priority: draft.priority,
    boundary: draft.boundary,
  }
}

/**
 * The weekday rotations to save: `null` leaves them untouched (rotation off
 * and none stored), an empty list clears them.
 */
export function rotationsToSave(
  draft: AreaDraft,
  hadRotations: boolean,
): Array<{ weekday: number; crewId: string }> | null {
  if (!draft.rotationOn) return hadRotations ? [] : null
  return WEEKDAYS.flatMap(({ value }) => {
    const crewId = draft.rotations[value]
    return crewId ? [{ weekday: value, crewId }] : []
  })
}

export function bboxPolygon([w, s, e, n]: Bbox): PolygonGeometry {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  }
}

/** Half-width of the frame around a city that only has a centre. */
const CITY_HALF_LON = 0.12
const CITY_HALF_LAT = 0.08

/** The frame for a city: its bbox, or a window around its centre. */
export function regionBounds(region: ServiceRegionFeature): Bbox {
  const { bbox, center } = region.properties
  if (bbox) return bbox
  const [lon, lat] = center
  return [
    lon - CITY_HALF_LON,
    lat - CITY_HALF_LAT,
    lon + CITY_HALF_LON,
    lat + CITY_HALF_LAT,
  ]
}

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export function bboxCenter([w, s, e, n]: Bbox): LonLat {
  return { lon: round6((w + e) / 2), lat: round6((s + n) / 2) }
}

/** Parses a typed coordinate; null when it is empty, not a number, or out of range. */
export function parseCoordinate(text: string, limit: number): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}

export function formatAreaSize(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(1)} km²`
  return `${Math.round(m2 / 10_000)} ha`
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

export function crewLabel(
  crews: Array<CrewOption>,
  crewId: string | null,
): string {
  if (!crewId) return 'No crew'
  return crews.find((c) => c.id === crewId)?.name ?? 'Archived crew'
}

/** Whether two geometries are the same list of positions. */
export function sameGeometry(
  a: AreaGeometry | null,
  b: AreaGeometry | null,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The "Add city" form. Coordinates stay text while typing. */
export interface RegionDraft {
  name: string
  lon: string
  lat: string
  /** Set by "Frame this view"; cleared when the centre is typed or picked. */
  bbox: Bbox | null
}

export const emptyRegionDraft: RegionDraft = {
  name: '',
  lon: '',
  lat: '',
  bbox: null,
}

export interface RegionInput {
  name: string
  center: { type: 'Point'; coordinates: [number, number] }
  bbox: Bbox | null
}

/** The `serviceAreas.regions.upsert` input, or why the form is not ready. */
export function regionInput(
  draft: RegionDraft,
): { ok: true; input: RegionInput } | { ok: false; problem: string } {
  const name = draft.name.trim()
  if (name === '') return { ok: false, problem: 'Name the city.' }
  const lon = parseCoordinate(draft.lon, 180)
  const lat = parseCoordinate(draft.lat, 90)
  if (lon === null || lat === null) {
    return {
      ok: false,
      problem:
        'Enter a longitude (-180 to 180) and latitude (-90 to 90), pick the centre on the map, or frame the view.',
    }
  }
  return {
    ok: true,
    input: {
      name,
      center: { type: 'Point', coordinates: [lon, lat] },
      bbox: draft.bbox,
    },
  }
}
