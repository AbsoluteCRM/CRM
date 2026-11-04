/**
 * OpenLayers layers and interactions for the service area editor. Loaded only
 * in the browser (lazy, from AreaMap) and mounted on the map that MapView
 * created. It draws the org's areas, the area being drawn or edited (Draw,
 * Modify, Snap), and reports clicks. It renders nothing itself.
 */
import Feature from 'ol/Feature'
import GeoJSON from 'ol/format/GeoJSON'
import { Draw, Modify, Snap } from 'ol/interaction'
import type Interaction from 'ol/interaction/Interaction'
import VectorLayer from 'ol/layer/Vector'
import { toLonLat, transformExtent } from 'ol/proj'
import VectorSource from 'ol/source/Vector'
import { Circle, Fill, Stroke, Style, Text } from 'ol/style'
import { asArray } from 'ol/color'
import { useEffect, useRef } from 'react'
import type OlMapInstance from 'ol/Map'
import type { FeatureLike } from 'ol/Feature'

import type { LonLat } from '#/lib/map/geo'
import { multiPolygonSchema, polygonSchema } from '#/lib/map/geojson'
import type { AreaGeometry } from '#/lib/map/geojson'
import { DEFAULT_AREA_COLOR, round6 } from './model'
import type { Bbox } from './model'

export interface MapArea {
  id: string
  name: string
  color: string | null
  geometry: AreaGeometry
}

/** `view`: click selects. `draw`: click-by-click polygon. `pick`: click picks a point. */
export type AreaMapMode = 'view' | 'draw' | 'pick'

/** What the editor can ask of the map. */
export interface AreaMapApi {
  /** The visible extent, `[west, south, east, north]`. */
  getViewBbox: () => Bbox | null
}

export interface AreaMapLayersProps {
  map: OlMapInstance
  areas: Array<MapArea>
  selectedId: string | null
  /** The area being drawn or edited; hidden from the areas layer. */
  editingId: string | null
  draft: AreaGeometry | null
  draftColor: string
  mode: AreaMapMode
  onSelect: (id: string | null) => void
  onDraftChange: (geometry: AreaGeometry) => void
  onPick: (point: LonLat) => void
  onApi: (api: AreaMapApi | null) => void
}

const DATA = 'EPSG:4326'
const VIEW = 'EPSG:3857'
const geojson = new GeoJSON({ dataProjection: DATA, featureProjection: VIEW })

function withAlpha(color: string, alpha: number): string {
  try {
    const [r, g, b] = asArray(color)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  } catch {
    return color
  }
}

function areaStyle(feature: FeatureLike) {
  const color = (feature.get('color') as string | null) ?? DEFAULT_AREA_COLOR
  const selected = feature.get('selected') === true
  const styles = [
    new Style({
      fill: new Fill({ color: withAlpha(color, selected ? 0.38 : 0.2) }),
      stroke: new Stroke({ color, width: selected ? 4 : 2 }),
      text: new Text({
        text: feature.get('name') as string,
        font: '700 12px system-ui, sans-serif',
        fill: new Fill({ color: '#11301f' }),
        stroke: new Stroke({ color: 'rgba(255,255,255,0.9)', width: 3 }),
      }),
    }),
  ]
  if (selected) {
    // A white casing under the stroke so the selection reads on any colour.
    styles.unshift(
      new Style({ stroke: new Stroke({ color: '#ffffff', width: 8 }) }),
    )
  }
  return styles
}

function draftStyle(color: string) {
  return new Style({
    fill: new Fill({ color: withAlpha(color, 0.3) }),
    stroke: new Stroke({ color, width: 3, lineDash: [8, 6] }),
    image: new Circle({
      radius: 5,
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color, width: 2 }),
    }),
  })
}

function readGeometry(geometry: AreaGeometry) {
  return new Feature({ geometry: geojson.readGeometry(geometry) ?? undefined })
}

function writeGeometry(feature: Feature): AreaGeometry | null {
  const geometry = feature.getGeometry()
  if (!geometry) return null
  const result = polygonSchema
    .or(multiPolygonSchema)
    .safeParse(geojson.writeGeometryObject(geometry, { decimals: 7 }))
  return result.success ? result.data : null
}

export default function AreaMapLayers({
  map,
  areas,
  selectedId,
  editingId,
  draft,
  draftColor,
  mode,
  onSelect,
  onDraftChange,
  onPick,
  onApi,
}: AreaMapLayersProps) {
  const areasRef = useRef<VectorLayer<VectorSource> | null>(null)
  const draftRef = useRef<VectorLayer<VectorSource> | null>(null)
  /** The last geometry sent to the parent, so echoing it back is a no-op. */
  const emitted = useRef<string | null>(null)
  const live = useRef({ mode, onSelect, onPick, onDraftChange })

  useEffect(() => {
    live.current = { mode, onSelect, onPick, onDraftChange }
  })

  // The layers live as long as the map.
  useEffect(() => {
    const areasLayer = new VectorLayer({
      source: new VectorSource(),
      style: areaStyle,
      zIndex: 1,
      properties: { name: 'service-areas' },
    })
    const draftLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 2,
      properties: { name: 'service-area-draft' },
    })
    map.addLayer(areasLayer)
    map.addLayer(draftLayer)
    areasRef.current = areasLayer
    draftRef.current = draftLayer

    const onClick = (e: {
      pixel: Array<number>
      coordinate: Array<number>
    }) => {
      const { mode: current, onSelect: select, onPick: pick } = live.current
      if (current === 'pick') {
        const [lon, lat] = toLonLat(e.coordinate)
        pick({ lon: round6(lon), lat: round6(lat) })
        return
      }
      if (current !== 'view') return
      const id = map.forEachFeatureAtPixel(
        e.pixel,
        (f) => (f.get('areaId') as string | undefined) ?? undefined,
        { layerFilter: (l) => l === areasLayer, hitTolerance: 3 },
      )
      select(id ?? null)
    }
    map.on('singleclick', onClick)
    const onMove = (e: { dragging: boolean; pixel: Array<number> }) => {
      if (e.dragging) return
      const target = map.getTargetElement()
      if (!target) return
      const { mode: current } = live.current
      target.style.cursor =
        current === 'pick' || current === 'draw'
          ? 'crosshair'
          : map.hasFeatureAtPixel(e.pixel, {
                layerFilter: (l) => l === areasLayer,
              })
            ? 'pointer'
            : ''
    }
    map.on('pointermove', onMove)

    onApi({
      getViewBbox: () => {
        const size = map.getSize()
        if (!size || size[0] * size[1] === 0) return null
        const extent = map.getView().calculateExtent(size)
        const [w, s, e, n] = transformExtent(extent, VIEW, DATA)
        return [round6(w), round6(s), round6(e), round6(n)]
      },
    })

    return () => {
      onApi(null)
      map.un('singleclick', onClick)
      map.un('pointermove', onMove)
      map.removeLayer(areasLayer)
      map.removeLayer(draftLayer)
      areasRef.current = null
      draftRef.current = null
    }
    // onApi is a stable setter from the parent.
  }, [map])

  // Saved areas. The one being edited is replaced by the draft.
  const areasKey = JSON.stringify(
    areas
      .filter((a) => a.id !== editingId)
      .map((a) => [a.id, a.name, a.color, a.geometry]),
  )
  useEffect(() => {
    const source = areasRef.current?.getSource()
    if (!source) return
    source.clear()
    source.addFeatures(
      areas
        .filter((a) => a.id !== editingId)
        .map((a) => {
          const feature = readGeometry(a.geometry)
          feature.setId(a.id)
          feature.setProperties({
            areaId: a.id,
            name: a.name,
            color: a.color,
            selected: a.id === selectedId,
          })
          return feature
        }),
    )
  }, [areasKey])

  useEffect(() => {
    areasRef.current
      ?.getSource()
      ?.getFeatures()
      .forEach((f) => f.set('selected', f.getId() === selectedId))
  }, [selectedId, areasKey])

  // The draft: mirrors the parent's geometry unless the map produced it.
  const draftKey = JSON.stringify(draft)
  useEffect(() => {
    const layer = draftRef.current
    const source = layer?.getSource()
    if (!layer || !source) return
    layer.setStyle(draftStyle(draftColor))
    if (draftKey === emitted.current) return
    source.clear()
    if (draft) source.addFeature(readGeometry(draft))
    emitted.current = null
  }, [draftKey, draftColor])

  // Draw while there is no draft; Modify and Snap once there is one.
  const editing = draft !== null
  useEffect(() => {
    const source = draftRef.current?.getSource()
    const saved = areasRef.current?.getSource()
    if (!source || !saved) return
    const emit = (feature: Feature | undefined) => {
      const geometry = feature ? writeGeometry(feature) : null
      if (!geometry) return
      emitted.current = JSON.stringify(geometry)
      live.current.onDraftChange(geometry)
    }
    const interactions: Array<Interaction> = []
    if (mode === 'draw' && !editing) {
      const draw = new Draw({
        source,
        type: 'Polygon',
        style: draftStyle(draftColor),
      })
      draw.on('drawstart', () => source.clear())
      draw.on('drawend', (e) => emit(e.feature))
      interactions.push(draw)
    } else if (editing && mode !== 'pick') {
      const modify = new Modify({ source })
      modify.on('modifyend', () => emit(source.getFeatures().at(0)))
      interactions.push(modify)
    }
    if (interactions.length > 0) {
      interactions.push(new Snap({ source }), new Snap({ source: saved }))
    }
    interactions.forEach((i) => map.addInteraction(i))
    return () => interactions.forEach((i) => map.removeInteraction(i))
  }, [map, mode, editing, draftColor])

  return null
}
