/**
 * OpenLayers layer helpers for route maps: numbered stops, the route line,
 * and the yard. Inputs are lon/lat (EPSG:4326); features are projected to the
 * view's EPSG:3857. Only the lazily loaded map chunk imports this file.
 */
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import { fromLonLat } from 'ol/proj'
import VectorSource from 'ol/source/Vector'
import { Circle, Fill, Icon, Stroke, Style, Text } from 'ol/style'
import { asArray } from 'ol/color'
import type { FeatureLike } from 'ol/Feature'
import type { LonLat } from '#/lib/map/geo'
import type { MapDepot, MapRoute, MapStop } from './types'

/** Brand colours, read from the CSS tokens on the map element. */
export interface MapTheme {
  route: string
  halo: string
  active: string
  depot: string
  depotGlyph: string
  ink2: string
  font: string
}

export function readMapTheme(el: Element): MapTheme {
  const css = getComputedStyle(el)
  const token = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback
  return {
    route: token('--leaf-600', '#2f7350'),
    halo: '#ffffff',
    active: token('--lime', '#c6ef6a'),
    depot: token('--leaf-900', '#11301f'),
    depotGlyph: token('--lime', '#c6ef6a'),
    ink2: token('--ink-2', '#4c5e53'),
    font: css.fontFamily || 'system-ui, sans-serif',
  }
}

export const project = (p: LonLat) => fromLonLat([p.lon, p.lat])

/** `color` with its alpha scaled, or unchanged if OpenLayers can't parse it. */
function fade(color: string, alpha: number): string {
  try {
    const [r, g, b, a] = asArray(color)
    return `rgba(${r}, ${g}, ${b}, ${a * alpha})`
  } catch {
    return color
  }
}

// ---- Stops ------------------------------------------------------------------

export const STOP_ID = 'stopId'
export const ACTIVE = 'active'

/** Numbered pins, like the old SVG map: crew colour, white rim, lime ring when active. */
export function createStopsLayer(theme: MapTheme) {
  const cache = new Map<string, Array<Style>>()
  const style = (feature: FeatureLike) => {
    const stop = feature.get('stop') as MapStop
    const active = feature.get(ACTIVE) === true
    const color = stop.color ?? theme.route
    const key = `${color}|${stop.label}|${active}|${stop.muted}`
    let styles = cache.get(key)
    if (!styles) {
      const radius = active ? 16 : 12
      const fill = stop.muted ? fade(color, 0.7) : color
      styles = [
        ...(active
          ? [
              new Style({
                image: new Circle({
                  radius: radius + 6,
                  fill: new Fill({ color: theme.active }),
                }),
                zIndex: 2,
              }),
            ]
          : []),
        new Style({
          image: new Circle({
            radius,
            fill: new Fill({ color: fill }),
            stroke: new Stroke({ color: theme.halo, width: 2 }),
          }),
          text: new Text({
            text: stop.label,
            font: `700 ${active ? 14 : 12}px ${theme.font}`,
            fill: new Fill({ color: '#ffffff' }),
          }),
          zIndex: active ? 2 : 1,
        }),
      ]
      cache.set(key, styles)
    }
    return styles
  }
  return new VectorLayer({
    source: new VectorSource(),
    style,
    zIndex: 3,
    properties: { name: 'stops' },
  })
}

export function setStops(
  layer: VectorLayer<VectorSource>,
  stops: Array<MapStop>,
  activeStopId: string | null | undefined,
) {
  const source = layer.getSource()
  if (!source) return
  source.clear()
  source.addFeatures(
    stops.map((stop) => {
      const feature = new Feature({
        geometry: new Point(project(stop.position)),
        stop,
        [STOP_ID]: stop.id,
        [ACTIVE]: stop.id === activeStopId,
      })
      feature.setId(stop.id)
      return feature
    }),
  )
}

export function setActiveStop(
  layer: VectorLayer<VectorSource>,
  activeStopId: string | null | undefined,
) {
  layer
    .getSource()
    ?.getFeatures()
    .forEach((f) => f.set(ACTIVE, f.getId() === activeStopId))
}

// ---- Route line -------------------------------------------------------------

/** The route as straight segments with a white casing, plus optional leg labels. */
export function createRouteLayer(theme: MapTheme) {
  const lineStyles = new Map<string, Array<Style>>()
  const style = (feature: FeatureLike) => {
    const label = feature.get('legLabel') as string | undefined
    if (label !== undefined) {
      return new Style({
        text: new Text({
          text: label,
          font: `600 10px ${theme.font}`,
          fill: new Fill({ color: theme.ink2 }),
          backgroundFill: new Fill({ color: 'rgba(255, 255, 255, 0.9)' }),
          padding: [1, 5, 0, 5],
        }),
      })
    }
    const color = (feature.get('color') as string | undefined) ?? theme.route
    let styles = lineStyles.get(color)
    if (!styles) {
      styles = [
        new Style({
          stroke: new Stroke({
            color: theme.halo,
            width: 7,
            lineJoin: 'round',
            lineCap: 'round',
          }),
        }),
        new Style({
          stroke: new Stroke({
            color,
            width: 4,
            lineJoin: 'round',
            lineCap: 'round',
          }),
        }),
      ]
      lineStyles.set(color, styles)
    }
    return styles
  }
  return new VectorLayer({
    source: new VectorSource(),
    style,
    zIndex: 1,
    properties: { name: 'route' },
  })
}

export function setRoute(
  layer: VectorLayer<VectorSource>,
  route: MapRoute | undefined,
) {
  const source = layer.getSource()
  if (!source) return
  source.clear()
  if (!route || route.path.length < 2) return
  const coords = route.path.map(project)
  source.addFeature(
    new Feature({ geometry: new LineString(coords), color: route.color }),
  )
  route.legLabels?.forEach((legLabel, i) => {
    const a = coords.at(i)
    const b = coords.at(i + 1)
    if (!a || !b || !legLabel) return
    source.addFeature(
      new Feature({
        geometry: new Point([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]),
        legLabel,
      }),
    )
  })
}

// ---- Depot ------------------------------------------------------------------

/** Lucide "warehouse" paths, drawn in a 24-unit box. */
const WAREHOUSE_PATHS = [
  'M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11',
  'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z',
  'M6 13h12',
  'M6 17h12',
]

function depotIcon(theme: MapTheme) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="12" fill="${theme.depot}"/><g transform="translate(8 8) scale(0.6667)" fill="none" stroke="${theme.depotGlyph}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${WAREHOUSE_PATHS.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** The yard: a dark rounded tile with a lime warehouse glyph. */
export function createDepotLayer(theme: MapTheme) {
  return new VectorLayer({
    source: new VectorSource(),
    style: new Style({
      image: new Icon({ src: depotIcon(theme), width: 32, height: 32 }),
    }),
    zIndex: 2,
    properties: { name: 'depot' },
  })
}

export function setDepot(
  layer: VectorLayer<VectorSource>,
  depot: MapDepot | undefined,
) {
  const source = layer.getSource()
  if (!source) return
  source.clear()
  if (!depot) return
  source.addFeature(
    new Feature({
      geometry: new Point(project(depot.position)),
      title: depot.title ?? 'Yard',
    }),
  )
}
