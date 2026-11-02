
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { Layer, Map as LeafletMap } from 'leaflet'
import type {
  Feature,
  FeatureCollection,
  Geometry,
  Polygon,
} from 'geojson'

import { useCrews } from '#/integrations/crews/crews'
import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'

import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'

type PendingRegion = {
  layer: Layer
  boundary: Extract<Geometry, { type: 'Polygon' }>
}

type SavedRegion = {
  id: string
  name: string
  crew_id: string | null
  boundary: unknown
}

function parsePolygon(value: unknown): Polygon | null {
  let geometry: unknown = value

  if (typeof geometry === 'string') {
    try {
      geometry = JSON.parse(geometry)
    } catch {
      return null
    }
  }

  if (!geometry || typeof geometry !== 'object') return null

  const candidate = geometry as {
    type?: unknown
    coordinates?: unknown
  }

  if (candidate.type !== 'Polygon') return null
  if (!Array.isArray(candidate.coordinates)) return null

  const valid = candidate.coordinates.every(
    (ring) =>
      Array.isArray(ring) &&
      ring.length >= 4 &&
      ring.every(
        (point) =>
          Array.isArray(point) &&
          point.length >= 2 &&
          typeof point[0] === 'number' &&
          typeof point[1] === 'number',
      ),
  )

  if (!valid) return null

  return candidate as Polygon
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
  const savingRef = useRef(false)

  const [pendingRegion, setPendingRegion] =
    useState<PendingRegion | null>(null)

  const [regionName, setRegionName] = useState('')
  const [selectedCrewId, setSelectedCrewId] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const {
    organization,
    isLoading: organizationLoading,
    error: organizationError,
  } = useOrganization()

  const organizationId = organization?.id

  const crewsQuery = useCrews()
  const crews = crewsQuery.data ?? []

  const regionsQuery = useQuery({
  ...trpc.regions.list.queryOptions({
    organizationId: organizationId!,
    }),
  enabled: Boolean(organizationId),
  })

  const createRegion = useMutation(
    trpc.regions.create.mutationOptions(),
  )

  const savedRegions: Array<SavedRegion> =
    regionsQuery.data ?? []

  const savedFeatures: Array<Feature<Polygon>> = savedRegions.flatMap(
    (region) => {
      const polygon = parsePolygon(region.boundary)

      if (!polygon) return []

      return [
        {
          type: 'Feature' as const,
          id: region.id,
          properties: {
            name: region.name,
            crewId: region.crew_id,
          },
          geometry: polygon,
        },
      ]
    },
  )

  const savedCollection: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: savedFeatures,
  }

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
    setSaveError(null)
    setSaveSuccess(null)
  }, [])

  const handleCancel = () => {
    if (savingRef.current) return

    if (pendingRegion) {
      mapRef.current?.removeLayer(pendingRegion.layer)
    }

    setPendingRegion(null)
    setRegionName('')
    setSelectedCrewId('')
    setSaveError(null)
  }

  const handleSave = async () => {
    if (
      savingRef.current ||
      !pendingRegion ||
      !organization ||
      !regionName.trim()
    ) {
      return
    }

    savingRef.current = true
    setSaveError(null)
    setSaveSuccess(null)

    try {
      const layer = pendingRegion.layer

      if (
        !('toGeoJSON' in layer) ||
        typeof layer.toGeoJSON !== 'function'
      ) {
        throw new Error('Unable to read the drawn polygon.')
      }

      const feature = layer.toGeoJSON()

      if (
        feature.type !== 'Feature' ||
        feature.geometry?.type !== 'Polygon'
      ) {
        throw new Error('Please draw a valid polygon before saving.')
      }

      await createRegion.mutateAsync({
        organizationId: organization.id,
        name: regionName.trim(),
        crewId: selectedCrewId || null,
        boundary: {
          type: 'Polygon',
          coordinates: feature.geometry.coordinates.map(
            (ring: number[][]) =>
              ring.map(
                (point: number[]) =>
                  [point[0], point[1]] as [number, number],
              ),
          ),
        },
      })

      // Reload the saved regions before removing the temporary layer.
      await queryClient.invalidateQueries({
        queryKey: trpc.regions.list.queryKey(),
      })

      mapRef.current?.removeLayer(pendingRegion.layer)

      setPendingRegion(null)
      setRegionName('')
      setSelectedCrewId('')
      setSaveSuccess('Service region saved successfully.')
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : 'Unable to save region.',
      )
    } finally {
      savingRef.current = false
    }
  }

  return (
    <div className="space-y-4">
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

          {organizationId && savedFeatures.length > 0 && (
            <GeoJSON
              key={`${organizationId}-${savedFeatures
                .map((feature) => feature.id)
                .join('-')}-${regionsQuery.dataUpdatedAt}`}
              data={savedCollection}
              style={{
                color: '#2563eb',
                weight: 3,
                fillColor: '#3b82f6',
                fillOpacity: 0.2,
              }}
              onEachFeature={(feature, layer) => {
                // Saved polygons are read-only in this version.
                // Prevent Geoman's edit/removal tools from modifying
                // a polygon without updating Supabase.
                // Prevent Geoman from editing or removing saved polygons.
                // The Leaflet type definitions do not expose pm on a generic Layer.
                if ('pm' in layer && layer.pm) {
                  const pm = layer.pm as {
                    setOptions: (options: {
                      allowEditing: boolean
                      allowRemoval: boolean
                      allowCutting: boolean
                      allowRotation: boolean
                    }) => void
                  }

                  pm.setOptions({
                    allowEditing: false,
                    allowRemoval: false,
                    allowCutting: false,
                    allowRotation: false,
                  })
                }

                const name =
                  typeof feature.properties?.name === 'string'
                    ? feature.properties.name
                    : 'Service region'

                layer.bindTooltip(name)
              }}
            />
          )}
        </MapContainer>
      </div>

      {organization && regionsQuery.isPending && (
        <p className="text-sm text-gray-500">
          Loading saved service regions...
        </p>
      )}

      {organization && regionsQuery.isError && (
        <p role="alert" className="text-sm text-red-600">
          Unable to load saved regions: {regionsQuery.error.message}
        </p>
      )}

      {organization && regionsQuery.isSuccess && (
        <p className="text-sm text-gray-600">
          {savedFeatures.length} saved service{' '}
          {savedFeatures.length === 1 ? 'region' : 'regions'}
        </p>
      )}

      {saveSuccess && (
        <p role="status" className="text-sm text-green-700">
          {saveSuccess}
        </p>
      )}

      {pendingRegion && (
        <div className="space-y-4 rounded-xl border p-4">
          <h3 className="font-semibold">New service region</h3>

          <label className="block text-sm font-medium">
            Region name
            <input
              type="text"
              value={regionName}
              onChange={(event) =>
                setRegionName(event.target.value)
              }
              placeholder="e.g. Northwest Calgary"
              disabled={createRegion.isPending}
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
                crewsQuery.isError ||
                createRegion.isPending
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

          {saveError && (
            <p role="alert" className="text-sm text-red-600">
              Unable to save region: {saveError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={
                !organization ||
                !regionName.trim() ||
                createRegion.isPending
              }
              className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50"
            >
              {createRegion.isPending
                ? 'Saving...'
                : 'Save region'}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={createRegion.isPending}
              className="rounded-lg border px-4 py-2 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
