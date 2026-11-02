/**
 * The service area map: the shared `MapView` with the editor's layers on
 * top. The layers load lazily after the map exists, so `ol` is never imported
 * on the server (the same rule as MapView).
 */
import { Suspense, lazy, useState } from 'react'
import type OlMapInstance from 'ol/Map'

import { MapView } from '#/components/map/MapView'
import type { BasemapChoice } from '#/components/map/MapView'
import type { LonLat } from '#/lib/map/geo'
import type { AreaGeometry } from '#/lib/map/geojson'
import { cn } from '#/lib/utils'
import type { AreaMapApi, AreaMapMode, MapArea } from './AreaMapLayers'
import type { Bbox } from './model'

const AreaMapLayers = lazy(() => import('./AreaMapLayers'))

export interface AreaMapProps {
  areas: Array<MapArea>
  selectedId: string | null
  editingId: string | null
  draft: AreaGeometry | null
  draftColor: string
  mode: AreaMapMode
  /** The city frame. */
  bounds: Bbox | undefined
  /** Shown over the map, e.g. how to draw. */
  hint?: string
  onSelect: (id: string | null) => void
  onDraftChange: (geometry: AreaGeometry) => void
  onPick: (point: LonLat) => void
  onApi: (api: AreaMapApi | null) => void
  /** Called with the OpenLayers map once it exists, for tests. */
  onMapReady?: (map: OlMapInstance) => void
  basemap?: BasemapChoice
  className?: string
}

export function AreaMap({
  areas,
  selectedId,
  editingId,
  draft,
  draftColor,
  mode,
  bounds,
  hint,
  onSelect,
  onDraftChange,
  onPick,
  onApi,
  onMapReady,
  basemap,
  className,
}: AreaMapProps) {
  const [map, setMap] = useState<OlMapInstance | null>(null)
  return (
    <div className={cn('relative', className)} style={{ height: 480 }}>
      <MapView
        label="Service areas map"
        basemap={basemap}
        frameBounds={bounds}
        style={{ width: '100%', height: '100%' }}
        onReady={(m) => {
          setMap(m)
          onMapReady?.(m)
        }}
      />
      {map && (
        <Suspense fallback={null}>
          <AreaMapLayers
            map={map}
            areas={areas}
            selectedId={selectedId}
            editingId={editingId}
            draft={draft}
            draftColor={draftColor}
            mode={mode}
            onSelect={onSelect}
            onDraftChange={onDraftChange}
            onPick={onPick}
            onApi={onApi}
          />
        </Suspense>
      )}
      {hint && (
        <p
          role="status"
          className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[80%] rounded-full bg-(--leaf-900) px-3 py-1.5 text-xs font-semibold text-(--lime) shadow-md"
        >
          {hint}
        </p>
      )}
    </div>
  )
}
