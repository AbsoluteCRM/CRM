import type { CSSProperties } from 'react'
import type OlMapInstance from 'ol/Map'
import type { LonLat } from '#/lib/map/geo'
import type { Basemap } from '#/lib/map/providers'

/** A numbered stop. Positions are lon/lat (EPSG:4326). */
export interface MapStop {
  id: string
  position: LonLat
  /** Text drawn in the pin, usually the stop number. */
  label: string
  /** Accessible description, e.g. "1. Maria Alvarez, 9:00 AM". */
  title: string
  /** Pin colour; defaults to the route colour. */
  color?: string
  /** Drawn faded, e.g. a completed stop. */
  muted?: boolean
}

export interface MapRoute {
  /** Vertices in driving order, lon/lat. Drawn as straight segments for now. */
  path: Array<LonLat>
  color?: string
  /** Optional label per segment, e.g. drive minutes; `legLabels[i]` sits on segment i. */
  legLabels?: Array<string>
}

export interface MapDepot {
  position: LonLat
  title?: string
}

/**
 * `undefined` uses the basemap from env, `null` draws none, and a `Basemap`
 * overrides env (stories use `null` or `{ kind: 'grid' }`).
 */
export type BasemapChoice = Basemap | null | undefined

export interface MapViewProps {
  stops?: Array<MapStop>
  route?: MapRoute
  depot?: MapDepot
  activeStopId?: string | null
  onSelectStop?: (id: string) => void
  /** Overrides the basemap from `MapBasemapProvider` or env. */
  basemap?: BasemapChoice
  /** Accessible name for the map region. */
  label?: string
  /** Sizing and shape of the map box; the map fills it. */
  className?: string
  /**
   * Inline sizing for the box. Use it for the size that the map can't work
   * without (OpenLayers draws nothing in a 0-height box), so the map still
   * renders where Tailwind isn't loaded, such as story tests.
   */
  style?: CSSProperties
  /** Called with the OpenLayers map once it exists, for extensions and tests. */
  onReady?: (map: OlMapInstance) => void
}
