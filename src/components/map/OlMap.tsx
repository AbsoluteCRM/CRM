/**
 * The OpenLayers map. Loaded only in the browser, through `React.lazy` in
 * MapView, because OpenLayers touches `window`. Everything that imports `ol`
 * hangs off this chunk.
 */
import 'ol/ol.css'
import OlMapInstance from 'ol/Map'
import View from 'ol/View'
import { Attribution, Zoom } from 'ol/control'
import { boundingExtent } from 'ol/extent'
import { defaults as defaultInteractions } from 'ol/interaction'
import TileLayer from 'ol/layer/Tile'
import { useEffect, useRef, useState } from 'react'
import type VectorLayer from 'ol/layer/Vector'
import type VectorSource from 'ol/source/Vector'

import { env } from '#/env'
import { CALGARY } from '#/lib/map/geo'
import { createBasemapSource, resolveBasemap } from '#/lib/map/providers'
import type { BasemapResolution } from '#/lib/map/providers'
import {
  STOP_ID,
  createDepotLayer,
  createRouteLayer,
  createStopsLayer,
  project,
  readMapTheme,
  setActiveStop,
  setDepot,
  setRoute,
  setStops,
} from './layers'
import type { BasemapChoice, MapViewProps } from './types'

function resolveChoice(choice: BasemapChoice): BasemapResolution {
  if (choice === undefined) {
    return resolveBasemap({
      provider: env.VITE_MAP_PROVIDER,
      apiKey: env.VITE_MAP_API_KEY,
      dev: import.meta.env.DEV,
    })
  }
  return { basemap: choice }
}

/** Inline so the map fills its box even without stylesheets. */
const FILL = { position: 'absolute', inset: 0 } as const

interface Layers {
  map: OlMapInstance
  base: TileLayer
  stops: VectorLayer<VectorSource>
  route: VectorLayer<VectorSource>
  depot: VectorLayer<VectorSource>
}

export default function OlMap({
  stops = [],
  route,
  depot,
  activeStopId,
  frameBounds,
  onSelectStop,
  basemap: choice,
  onReady,
}: Omit<MapViewProps, 'className' | 'label' | 'style'>) {
  const targetRef = useRef<HTMLDivElement>(null)
  const layersRef = useRef<Layers | null>(null)
  const onSelectRef = useRef(onSelectStop)
  const onReadyRef = useRef(onReady)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onSelectRef.current = onSelectStop
    onReadyRef.current = onReady
  })

  // One map per mount; disposed on unmount (and between StrictMode runs).
  useEffect(() => {
    const target = targetRef.current
    if (!target) return
    const theme = readMapTheme(target)
    const base = new TileLayer({ zIndex: 0 })
    const routeLayer = createRouteLayer(theme)
    const depotLayer = createDepotLayer(theme)
    const stopsLayer = createStopsLayer(theme)
    const map = new OlMapInstance({
      target,
      layers: [base, routeLayer, depotLayer, stopsLayer],
      view: new View({ center: project(CALGARY), zoom: 11, maxZoom: 19 }),
      controls: [
        new Zoom(),
        new Attribution({ collapsible: false, collapsed: false }),
      ],
      interactions: defaultInteractions({
        altShiftDragRotate: false,
        pinchRotate: false,
      }),
    })
    layersRef.current = {
      map,
      base,
      stops: stopsLayer,
      route: routeLayer,
      depot: depotLayer,
    }

    const hit = (pixel: Array<number>) =>
      map.forEachFeatureAtPixel(
        pixel,
        (f) => (f.get(STOP_ID) as string | undefined) ?? undefined,
        { layerFilter: (l) => l === stopsLayer, hitTolerance: 4 },
      )
    map.on('singleclick', (e) => {
      const id = hit(e.pixel)
      if (id) onSelectRef.current?.(id)
    })
    map.on('pointermove', (e) => {
      if (e.dragging) return
      target.style.cursor = onSelectRef.current && hit(e.pixel) ? 'pointer' : ''
    })
    map.once('rendercomplete', () => setReady(true))
    onReadyRef.current?.(map)

    return () => {
      layersRef.current = null
      map.setTarget(undefined)
      map.dispose()
    }
  }, [])

  // Effects are keyed on content, so callers can pass fresh objects each render.
  const resolution = resolveChoice(choice)
  const basemapKey = JSON.stringify(resolution.basemap)
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    const previous = layers.base.getSource()
    layers.base.setSource(
      resolution.basemap ? createBasemapSource(resolution.basemap) : null,
    )
    previous?.dispose()
  }, [basemapKey])

  // Selection is applied separately, so it doesn't rebuild the features.
  const stopsKey = JSON.stringify(stops)
  useEffect(() => {
    const layers = layersRef.current
    if (layers) setStops(layers.stops, stops, activeStopId)
  }, [stopsKey])

  useEffect(() => {
    const layers = layersRef.current
    if (layers) setActiveStop(layers.stops, activeStopId)
  }, [activeStopId])

  const routeKey = JSON.stringify(route ?? null)
  useEffect(() => {
    const layers = layersRef.current
    if (layers) setRoute(layers.route, route)
  }, [routeKey])

  const depotKey = JSON.stringify(depot ?? null)
  useEffect(() => {
    const layers = layersRef.current
    if (layers) setDepot(layers.depot, depot)
  }, [depotKey])

  // Frame the data when the positions change or the box resizes, not on selection.
  const points = frameBounds
    ? [
        { lon: frameBounds[0], lat: frameBounds[1] },
        { lon: frameBounds[2], lat: frameBounds[3] },
      ]
    : [...(depot ? [depot.position] : []), ...stops.map((s) => s.position)]
  const frameKey = JSON.stringify(points)
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    const { map } = layers
    const frame = () => {
      const view = map.getView()
      const size = map.getSize()
      const coords = points.map(project)
      if (coords.length === 0) {
        view.setCenter(project(CALGARY))
        view.setZoom(11)
      } else if (coords.length === 1 || !size || size[0] * size[1] === 0) {
        view.setCenter(coords[0])
        view.setZoom(13)
      } else {
        view.fit(boundingExtent(coords), {
          size,
          padding: [40, 40, 40, 40],
          maxZoom: 15,
        })
      }
    }
    map.updateSize()
    frame()
    map.on('change:size', frame)
    return () => map.un('change:size', frame)
  }, [frameKey])

  return (
    <div style={FILL} data-map-ready={ready || undefined}>
      <div ref={targetRef} className="crm-map" style={FILL} />
      {resolution.notice && (
        <p className="pointer-events-none absolute top-2 right-2 left-12 text-right">
          <span className="inline-block rounded-full bg-(--paper)/90 px-2.5 py-1 text-[11px] font-semibold text-(--ink-3) shadow-sm">
            {resolution.notice}
          </span>
        </p>
      )}
    </div>
  )
}
