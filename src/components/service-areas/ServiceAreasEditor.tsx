import { useRef, useState, useSyncExternalStore } from 'react'
import { MapPinned, Plus } from 'lucide-react'
import type OlMapInstance from 'ol/Map'

import {
  Alert,
  Btn,
  Card,
  CardHeader,
  EmptyState,
  SelectInput,
} from '#/components/crm/ui'
import { toast } from '#/lib/toast'
import type { BasemapChoice } from '#/components/map/MapView'
import type {
  ServiceAreaCoverage,
  ServiceAreaFeature,
  ServiceAreaPreview,
  ServiceRegionFeature,
} from '#/integrations/trpc/serviceAreas'
import type { AreaGeometry } from '#/lib/map/geojson'
import { AreaForm } from './AreaForm'
import { AreaList } from './AreaList'
import { AreaMap } from './AreaMap'
import type { AreaMapApi } from './AreaMapLayers'
import { CoveragePanel } from './CoveragePanel'
import { ImpactDialog } from './ImpactDialog'
import { RegionForm } from './RegionForm'
import {
  bboxCenter,
  bboxPolygon,
  draftFromArea,
  emptyDraft,
  emptyRegionDraft,
  nextColor,
  regionBounds,
  regionInput,
  rotationsToSave,
  toAreaInput,
} from './model'
import type { AreaDraft, CrewOption, RegionDraft, RegionInput } from './model'

export type AreaInput = ReturnType<typeof toAreaInput>
export type RotationInput = Array<{ weekday: number; crewId: string }>

/** What the editor asks of the server. Each rejects with an `Error`. */
export interface ServiceAreaActions {
  preview: (input: AreaInput) => Promise<ServiceAreaPreview>
  /** Saves the area, then its rotations (`null` leaves them untouched). */
  save: (input: AreaInput, rotations: RotationInput | null) => Promise<void>
  archive: (id: string) => Promise<void>
  addRegion: (input: RegionInput) => Promise<{ id: string }>
}

export interface ServiceAreasEditorProps {
  status: 'loading' | 'error' | 'ready'
  errorMessage?: string
  areas: Array<ServiceAreaFeature>
  regions: Array<ServiceRegionFeature>
  crews: Array<CrewOption>
  /** Null when the viewer cannot read coverage, or it has not loaded. */
  coverage: ServiceAreaCoverage | null
  /** `can.manageServiceAreas` for the viewer. */
  canEdit: boolean
  /** Phone width: read-only with a note. Defaults to the viewport. */
  compact?: boolean
  actions: ServiceAreaActions
  /** Overrides the env basemap (stories pass a local grid). */
  basemap?: BasemapChoice
  /** Called with the OpenLayers map once it exists, for tests. */
  onMapReady?: (map: OlMapInstance) => void
}

type Editor =
  | { kind: 'none' }
  | { kind: 'area'; draft: AreaDraft; regionId: string | null }
  | { kind: 'city'; draft: RegionDraft }

type Review =
  | { phase: 'idle'; error: string | null }
  | { phase: 'loading'; error: null }
  | {
      phase: 'review' | 'saving'
      preview: ServiceAreaPreview
      error: string | null
    }

const PHONE = '(max-width: 767px)'

function usePhoneWidth() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(PHONE)
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia(PHONE).matches,
    () => false,
  )
}

const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong'

export function ServiceAreasEditor(props: ServiceAreasEditorProps) {
  const { status } = props
  if (status === 'loading') {
    return (
      <Card>
        <EmptyState icon={MapPinned} title="Loading service areas" />
      </Card>
    )
  }
  if (status === 'error') {
    return (
      <Card>
        <EmptyState
          icon={MapPinned}
          title={`Couldn't load service areas${props.errorMessage ? `: ${props.errorMessage}` : ''}`}
        />
      </Card>
    )
  }
  return <ReadyEditor {...props} />
}

function ReadyEditor({
  areas,
  regions,
  crews,
  coverage,
  canEdit,
  compact,
  actions,
  basemap,
  onMapReady,
}: ServiceAreasEditorProps) {
  const phone = usePhoneWidth()
  const readOnlyWidth = compact ?? phone
  const editable = canEdit && !readOnlyWidth

  const [regionId, setRegionId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor>({ kind: 'none' })
  const [review, setReview] = useState<Review>({ phase: 'idle', error: null })
  const [picking, setPicking] = useState(false)
  const [savingCity, setSavingCity] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const api = useRef<AreaMapApi | null>(null)

  const region = regions.find((r) => r.id === regionId) ?? regions.at(0) ?? null
  // Areas without a city show under every city.
  const visibleAreas = areas.filter(
    (a) =>
      region === null ||
      a.properties.region_id === null ||
      a.properties.region_id === region.id,
  )
  const active =
    editor.kind === 'area' &&
    (editor.draft.id === null ||
      areas.some((a) => a.properties.id === editor.draft.id))
      ? editor
      : null
  const cityForm = editor.kind === 'city' ? editor : null
  const drawing = active !== null && active.draft.boundary === null
  const mode = picking ? 'pick' : drawing ? 'draw' : 'view'

  const hint = picking
    ? 'Click the map to set the city centre'
    : drawing
      ? 'Click to place corners; click the first corner to finish'
      : active
        ? 'Drag a corner to move it; drag an edge to add one'
        : undefined

  const startArea = (draft: AreaDraft, forRegion: string | null) => {
    setSelectedId(null)
    setPicking(false)
    setReview({ phase: 'idle', error: null })
    setEditor({ kind: 'area', draft, regionId: forRegion })
  }
  const patchDraft = (patch: Partial<AreaDraft>) =>
    setEditor((prev) =>
      prev.kind === 'area'
        ? { ...prev, draft: { ...prev.draft, ...patch } }
        : prev,
    )
  const patchCity = (patch: Partial<RegionDraft>) =>
    setEditor((prev) =>
      prev.kind === 'city'
        ? { ...prev, draft: { ...prev.draft, ...patch } }
        : prev,
    )
  const close = () => {
    setEditor({ kind: 'none' })
    setPicking(false)
    setReview({ phase: 'idle', error: null })
  }

  const onDraftChange = (geometry: AreaGeometry) =>
    patchDraft({ boundary: geometry })

  const useView = () => {
    const bbox = api.current?.getViewBbox()
    if (bbox) patchDraft({ boundary: bboxPolygon(bbox) })
  }

  const runPreview = async () => {
    if (!active) return
    setReview({ phase: 'loading', error: null })
    try {
      const preview = await actions.preview(
        toAreaInput(active.draft, active.regionId),
      )
      setReview({ phase: 'review', preview, error: null })
    } catch (e) {
      setReview({ phase: 'idle', error: messageOf(e) })
    }
  }

  const confirmSave = async () => {
    if (!active || (review.phase !== 'review' && review.phase !== 'saving')) {
      return
    }
    const { preview } = review
    setReview({ phase: 'saving', preview, error: null })
    const existing = areas.find((a) => a.properties.id === active.draft.id)
    const hadRotations = (existing?.properties.rotations.length ?? 0) > 0
    try {
      await actions.save(
        toAreaInput(active.draft, active.regionId),
        rotationsToSave(active.draft, hadRotations),
      )
      close()
    } catch (e) {
      setReview({ phase: 'review', preview, error: messageOf(e) })
    }
  }

  const archive = async (id: string) => {
    setArchivingId(id)
    try {
      await actions.archive(id)
      if (selectedId === id) setSelectedId(null)
    } catch (e) {
      toast(`Couldn't archive: ${messageOf(e)}`, 'warning')
    } finally {
      setArchivingId(null)
    }
  }

  const frameView = () => {
    const bbox = api.current?.getViewBbox()
    if (!bbox) return
    const centre = bboxCenter(bbox)
    patchCity({ lon: String(centre.lon), lat: String(centre.lat), bbox })
  }

  const saveCity = async () => {
    if (!cityForm) return
    const result = regionInput(cityForm.draft)
    if (!result.ok) return
    setSavingCity(true)
    try {
      const { id } = await actions.addRegion(result.input)
      setRegionId(id)
      close()
    } catch (e) {
      toast(`Couldn't add the city: ${messageOf(e)}`, 'warning')
    } finally {
      setSavingCity(false)
    }
  }

  const canDraw = editable && region !== null
  const startNewArea = () =>
    startArea(emptyDraft(nextColor(areas)), region?.id ?? null)

  return (
    <Card>
      <CardHeader
        title="Service areas"
        subtitle="Draw where each crew works. Visits inside an area go to its crew."
        action={
          editable && (
            <div className="flex flex-wrap gap-2">
              <Btn
                variant="outline"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setSelectedId(null)
                  setReview({ phase: 'idle', error: null })
                  setEditor({ kind: 'city', draft: emptyRegionDraft })
                }}
              >
                Add city
              </Btn>
              <Btn
                size="sm"
                icon={Plus}
                disabled={!canDraw}
                title={canDraw ? undefined : 'Add a city first'}
                onClick={startNewArea}
              >
                Add area
              </Btn>
            </div>
          )
        }
      />

      <div className="flex flex-col gap-3 px-5 pt-4">
        {readOnlyWidth && canEdit && (
          <Alert tone="info" title="Editing needs a larger screen">
            Open this page on a tablet or desktop to draw or change service
            areas. You can still look at the map and the list here.
          </Alert>
        )}
        {!canEdit && (
          <Alert tone="info" title="View only">
            Owners and admins can change service areas.
          </Alert>
        )}
        {regions.length > 0 && (
          <div className="flex items-center gap-3">
            <label
              htmlFor="service-area-city"
              className="text-[13px] font-semibold text-(--ink-2)"
            >
              City
            </label>
            <SelectInput
              id="service-area-city"
              className="w-56"
              value={region?.id ?? ''}
              onChange={(e) => {
                setRegionId(e.target.value)
                setSelectedId(null)
              }}
            >
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.properties.name}
                </option>
              ))}
            </SelectInput>
          </div>
        )}
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <AreaMap
          className="overflow-hidden rounded-2xl border border-(--line)"
          areas={visibleAreas.map((a) => ({
            id: a.properties.id,
            name: a.properties.name,
            color: a.properties.color,
            geometry: a.geometry,
          }))}
          selectedId={selectedId}
          editingId={active?.draft.id ?? null}
          draft={active?.draft.boundary ?? null}
          draftColor={active?.draft.color ?? '#2f7350'}
          mode={mode}
          bounds={region ? regionBounds(region) : undefined}
          hint={hint}
          basemap={basemap}
          onMapReady={onMapReady}
          onSelect={(id) => {
            if (editor.kind === 'none') setSelectedId(id)
          }}
          onDraftChange={onDraftChange}
          onPick={(point) => {
            patchCity({
              lon: String(point.lon),
              lat: String(point.lat),
              bbox: null,
            })
            setPicking(false)
          }}
          onApi={(next) => {
            api.current = next
          }}
        />

        <div className="min-w-0 rounded-2xl border border-(--line)">
          {active ? (
            <>
              <h3 className="border-b border-(--line) px-4 py-3 text-sm font-bold text-(--ink)">
                {active.draft.id === null
                  ? 'New service area'
                  : 'Edit service area'}
              </h3>
              {review.error && review.phase === 'idle' && (
                <div className="px-4 pt-4">
                  <Alert tone="danger" title="Couldn't check this area">
                    {review.error}
                  </Alert>
                </div>
              )}
              <AreaForm
                draft={active.draft}
                crews={crews}
                busy={review.phase === 'loading'}
                onChange={patchDraft}
                onRedraw={() => patchDraft({ boundary: null })}
                onUseView={useView}
                onPreview={runPreview}
                onCancel={close}
              />
            </>
          ) : cityForm ? (
            <>
              <h3 className="border-b border-(--line) px-4 py-3 text-sm font-bold text-(--ink)">
                Add a city
              </h3>
              <RegionForm
                draft={cityForm.draft}
                picking={picking}
                saving={savingCity}
                onChange={patchCity}
                onTogglePick={() => setPicking((p) => !p)}
                onFrameView={frameView}
                onSave={saveCity}
                onCancel={close}
              />
            </>
          ) : visibleAreas.length === 0 ? (
            <EmptyState
              icon={MapPinned}
              className="py-10"
              title="No service areas yet"
              body={
                region === null
                  ? 'Add a city to frame the map, then draw the first area on it.'
                  : `Draw the first area for ${region.properties.name} and pick the crew that covers it.`
              }
              action={
                editable && (
                  <Btn
                    icon={Plus}
                    onClick={() =>
                      region === null
                        ? setEditor({ kind: 'city', draft: emptyRegionDraft })
                        : startNewArea()
                    }
                  >
                    {region === null ? 'Add a city' : 'Draw an area'}
                  </Btn>
                )
              }
            />
          ) : (
            <AreaList
              areas={visibleAreas}
              crews={crews}
              selectedId={selectedId}
              canEdit={editable}
              busyId={archivingId}
              onSelect={setSelectedId}
              onEdit={(id) => {
                const area = areas.find((a) => a.properties.id === id)
                if (area)
                  startArea(draftFromArea(area), area.properties.region_id)
              }}
              onArchive={archive}
            />
          )}
        </div>
      </div>

      {coverage && <CoveragePanel coverage={coverage} />}

      <ImpactDialog
        open={review.phase === 'review' || review.phase === 'saving'}
        areaName={active?.draft.name.trim() ?? ''}
        isNew={active?.draft.id === null}
        preview={
          review.phase === 'review' || review.phase === 'saving'
            ? review.preview
            : null
        }
        areas={areas}
        saving={review.phase === 'saving'}
        error={review.phase === 'review' ? review.error : null}
        onConfirm={confirmSave}
        onBack={() => {
          if (review.phase === 'review')
            setReview({ phase: 'idle', error: null })
        }}
      />
    </Card>
  )
}
