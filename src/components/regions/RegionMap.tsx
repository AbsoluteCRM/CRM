import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { Layer, Map as LeafletMap } from 'leaflet'
import type { Geometry } from 'geojson'

import { useCrews } from '#/integrations/crews/crews'
import { useOrganization } from '#/integrations/organization/context'

import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

type PendingRegion = {
  layer: Layer
  boundary: Extract<Geometry, { type: 'Polygon' }>
}

function DrawingControls({
  onCreate,
  onMapReady,
}: {
  onCreate: (region: PendingRegion) => void
  onMapReady: (map: LeafletMap) => void
}) {
  const map = useMap()

  useEffect(() => {
    onMapReady(map)
  }, [map, onMapReady])

  useEffect(() => {
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      drawPolygon: true,
      editMode: true,
      dragMode: false,
      cutPolygon: false,
      removalMode: true,
      rotateMode: false,
    })

    const handleCreate = (event: { layer: Layer }) => {
      const layer = event.layer

      if (!('toGeoJSON' in layer)) return
      if (typeof layer.toGeoJSON !== 'function') return

      const geoJSON = layer.toGeoJSON()

      if (geoJSON.type !== 'Feature') return
      if (geoJSON.geometry?.type !== 'Polygon') return

      onCreate({
        layer,
        boundary: geoJSON.geometry,
      })
    }

    map.on('pm:create', handleCreate)

    return () => {
      map.off('pm:create', handleCreate)
      map.pm.removeControls()
    }
  }, [map, onCreate])

  return null
}

export default function RegionMap() {
  const mapRef = useRef<LeafletMap | null>(null)

  const [pendingRegion, setPendingRegion] = useState<PendingRegion | null>(
    null,
  )
  const [regionName, setRegionName] = useState('')
  const [selectedCrewId, setSelectedCrewId] = useState('')

  // Load crews through AbsoluteCRM's existing integration.
  const crewsQuery = useCrews()
  const crews = crewsQuery.data ?? []

  // Temporary diagnostics for the authenticated organization.
  const {
    organization,
    isLoading: organizationLoading,
    error: organizationError,
  } = useOrganization()

  const handleMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map
  }, [])

  const handleCreate = useCallback((region: PendingRegion) => {
    setPendingRegion((previous) => {
      if (previous) {
        mapRef.current?.removeLayer(previous.layer)
      }

      return region
    })

    setRegionName('')
    setSelectedCrewId('')
  }, [])

  const handleCancel = () => {
    if (pendingRegion) {
      mapRef.current?.removeLayer(pendingRegion.layer)
    }

    setPendingRegion(null)
    setRegionName('')
    setSelectedCrewId('')
  }

  return (
    <div className="space-y-4">
      {/* Temporary diagnostic information */}
      <p className="text-sm text-gray-600">
        Organization:{' '}
        {organizationLoading
          ? 'Loading'
          : organization?.name ?? 'None selected'}
        {' | '}
        Organization error: {organizationError ?? 'None'}
        {' | '}
        Crew query: {crewsQuery.fetchStatus}
      </p>

      <div className="h-[500px] w-full overflow-hidden rounded-xl">
        <MapContainer
          center={[51.0447, -114.0719]}
          zoom={11}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <DrawingControls
            onCreate={handleCreate}
            onMapReady={handleMapReady}
          />
        </MapContainer>
      </div>

      {pendingRegion && (
        <div className="space-y-4 rounded-xl border p-4">
          <h3 className="font-semibold">New service region</h3>

          <label className="block text-sm font-medium">
            Region name
            <input
              type="text"
              value={regionName}
              onChange={(event) => setRegionName(event.target.value)}
              placeholder="e.g. Northwest Calgary"
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>

          <label className="block text-sm font-medium">
            Assign crew
            <select
              value={selectedCrewId}
              onChange={(event) =>
                setSelectedCrewId(event.target.value)
              }
              disabled={
                !organization ||
                organizationLoading ||
                crewsQuery.isPending ||
                crewsQuery.isError
              }
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="">Unassigned</option>

              {crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name}
                </option>
              ))}
            </select>
          </label>

          {organizationLoading && (
            <p className="text-sm text-gray-500">
              Loading organization...
            </p>
          )}

          {!organizationLoading && organizationError && (
            <p className="text-sm text-red-600">
              Unable to load organization: {organizationError}
            </p>
          )}

          {!organizationLoading &&
            !organizationError &&
            !organization && (
              <p className="text-sm text-amber-700">
                No active Supabase organization selected.
                Crew assignments require an authenticated organization.
              </p>
            )}

          {organization &&
            crewsQuery.fetchStatus === 'fetching' && (
              <p className="text-sm text-gray-500">
                Loading crews...
              </p>
            )}

          {organization && crewsQuery.isError && (
            <p className="text-sm text-red-600">
              Unable to load crews: {crewsQuery.error.message}
            </p>
          )}

          {organization &&
            crewsQuery.isSuccess &&
            crews.length === 0 && (
              <p className="text-sm text-gray-500">
                No active crews found. You can leave this region
                unassigned.
              </p>
            )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!regionName.trim()}
              className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50"
            >
              Save region
            </button>

            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border px-4 py-2"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Saving will be connected after we verify the crew dropdown.
          </p>
        </div>
      )}
    </div>
  )
}