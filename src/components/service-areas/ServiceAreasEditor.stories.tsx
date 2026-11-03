import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type OlMapInstance from 'ol/Map'

import { ServiceAreasEditor } from './ServiceAreasEditor'
import type {
  ServiceAreaCoverage,
  ServiceAreaFeature,
  ServiceAreaPreview,
  ServiceRegionFeature,
} from '#/integrations/trpc/serviceAreas'
import type { MultiPolygonGeometry } from '#/lib/map/geojson'
import '#/styles.css'

const rect = (
  w: number,
  s: number,
  e: number,
  n: number,
): MultiPolygonGeometry => ({
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  ],
})

const NORTHWEST = '00000000-0000-4000-8000-0000000000a1'
const DOWNTOWN = '00000000-0000-4000-8000-0000000000a2'
const SOUTHEAST = '00000000-0000-4000-8000-0000000000a3'
const CREW_A = '00000000-0000-4000-8000-0000000000c1'
const CREW_B = '00000000-0000-4000-8000-0000000000c2'
const REGION = '00000000-0000-4000-8000-0000000000b1'

const area = (
  id: string,
  name: string,
  crew_id: string | null,
  color: string,
  geometry: MultiPolygonGeometry,
  extra: Partial<ServiceAreaFeature['properties']> = {},
): ServiceAreaFeature => ({
  type: 'Feature',
  id,
  geometry,
  properties: {
    id,
    name,
    crew_id,
    region_id: REGION,
    color,
    priority: 0,
    area_m2: 48_000_000,
    archived_at: null,
    updated_at: '2026-11-02T00:00:00Z',
    property_count: 0,
    overlapping_area_ids: [],
    rotations: [],
    ...extra,
  },
})

const AREAS: Array<ServiceAreaFeature> = [
  area(
    NORTHWEST,
    'Northwest',
    CREW_A,
    '#2f7350',
    rect(-114.25, 51.05, -114.05, 51.15),
    {
      property_count: 24,
      overlapping_area_ids: [DOWNTOWN],
    },
  ),
  area(
    DOWNTOWN,
    'Downtown core',
    CREW_B,
    '#d98a3d',
    rect(-114.12, 51.03, -114.0, 51.09),
    {
      property_count: 17,
      priority: 5,
      area_m2: 9_000_000,
      overlapping_area_ids: [NORTHWEST],
    },
  ),
  area(
    SOUTHEAST,
    'Southeast',
    CREW_A,
    '#4fa3a5',
    rect(-114.05, 50.95, -113.95, 51.03),
    {
      property_count: 9,
    },
  ),
]

const REGIONS: Array<ServiceRegionFeature> = [
  {
    type: 'Feature',
    id: REGION,
    geometry: null,
    properties: {
      id: REGION,
      name: 'Calgary',
      center: [-114.0719, 51.0447],
      bbox: [-114.3, 50.9, -113.85, 51.2],
      source: null,
      source_ref: null,
      updated_at: '2026-11-02T00:00:00Z',
    },
  },
]

const CREWS = [
  { id: CREW_A, name: 'Crew A', color: '#7fb547' },
  { id: CREW_B, name: 'Crew B', color: '#d98a3d' },
]

const COVERAGE: ServiceAreaCoverage = {
  areas: AREAS.map((a) => ({
    id: a.properties.id,
    name: a.properties.name,
    crew_id: a.properties.crew_id,
    property_count: a.properties.property_count,
  })),
  covered_count: 50,
  uncovered_count: 7,
  no_location_count: 3,
}

const PREVIEW: ServiceAreaPreview = {
  changes: [
    {
      property_id: 'p1',
      address_line1: '120 Elbow Dr SW',
      from_area_id: NORTHWEST,
      to_area_id: DOWNTOWN,
      to_preview: false,
    },
    {
      property_id: 'p2',
      address_line1: '88 Crowchild Tr NW',
      from_area_id: null,
      to_area_id: NORTHWEST,
      to_preview: true,
    },
  ],
  overlapping_area_ids: [DOWNTOWN],
  area_m2: 48_000_000,
  vertex_count: 5,
  geometry: rect(-114.25, 51.05, -114.05, 51.15),
}

/** Captured by `onMapReady`, so play functions can find pixels on the canvas. */
let lastMap: OlMapInstance | null = null

const meta = {
  title: 'Settings/ServiceAreasEditor',
  component: ServiceAreasEditor,
  args: {
    status: 'ready',
    areas: AREAS,
    regions: REGIONS,
    crews: CREWS,
    coverage: COVERAGE,
    canEdit: true,
    compact: false,
    onMapReady: (map) => {
      lastMap = map
    },
    actions: {
      preview: fn(() => Promise.resolve(PREVIEW)),
      save: fn(() => Promise.resolve()),
      archive: fn(() => Promise.resolve()),
      addRegion: fn(() => Promise.resolve({ id: 'new-region' })),
    },
  },
} satisfies Meta<typeof ServiceAreasEditor>

export default meta
type Story = StoryObj<typeof meta>

async function waitForMap(canvasElement: HTMLElement) {
  const region = within(canvasElement).getByRole('region', {
    name: 'Service areas map',
  })
  await waitFor(
    () => expect(region.querySelector('[data-map-ready]')).not.toBeNull(),
    { timeout: 10_000 },
  )
  return region
}

/** Clicks the map canvas `dx`, `dy` pixels from the map's centre. */
async function clickFromCentre(region: HTMLElement, dx: number, dy: number) {
  const viewport = region.querySelector<HTMLElement>('.ol-viewport')!
  const box = viewport.getBoundingClientRect()
  const coords = {
    clientX: box.left + box.width / 2 + dx,
    clientY: box.top + box.height / 2 + dy,
  }
  await userEvent.pointer([
    { keys: '[MouseLeft>]', target: viewport, coords },
    { keys: '[/MouseLeft]', target: viewport, coords },
  ])
}

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    const list = canvas.getByRole('list', { name: 'Service areas' })
    const rows = within(list).getAllByRole('listitem')
    await expect(rows).toHaveLength(3)
    // Name, crew, swatch, property count and the overlap badge.
    await expect(within(rows[0]).getByText('24 properties')).toBeInTheDocument()
    await expect(within(rows[0]).getByText('Overlaps 1')).toBeInTheDocument()
    await expect(within(rows[1]).getByText('Overlaps 1')).toBeInTheDocument()
    await expect(within(rows[2]).queryByText(/Overlaps/)).toBeNull()
    await expect(within(rows[0]).getByText(/Crew A/)).toBeInTheDocument()
    await expect(within(rows[1]).getByTestId('area-swatch')).toHaveStyle({
      backgroundColor: 'rgb(217, 138, 61)',
    })
    // Coverage panel.
    await expect(canvas.getByTestId('coverage-uncovered')).toHaveTextContent(
      '7 properties outside every area',
    )
    await expect(canvas.getByTestId('coverage-nolocation')).toHaveTextContent(
      '3 properties with no location yet',
    )
  },
}

export const SelectingHighlightsTheArea: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const region = await waitForMap(canvasElement)
    const row = canvas.getByRole('button', { name: 'Downtown core, Crew B' })
    await userEvent.click(row)
    await expect(row).toHaveAttribute('aria-pressed', 'true')
    // The areas layer marks the same feature as selected.
    type Layer = {
      get: (k: string) => unknown
      getSource: () => {
        getFeatures: () => Array<{
          getId: () => string
          get: (k: string) => unknown
        }>
      }
    }
    await waitFor(() => {
      const layer = (
        lastMap!.getLayers().getArray() as unknown as Array<Layer>
      ).find((l) => l.get('name') === 'service-areas')
      const selected = (layer?.getSource().getFeatures() ?? [])
        .filter((f) => f.get('selected') === true)
        .map((f) => f.getId())
      return expect(selected).toEqual([DOWNTOWN])
    })
    await expect(region.querySelector('canvas')).not.toBeNull()
  },
}

export const Empty: Story = {
  args: { areas: [], coverage: { ...COVERAGE, areas: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No service areas yet')).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Draw an area' }),
    ).toBeInTheDocument()
    await expect(
      canvas.queryByRole('list', { name: 'Service areas' }),
    ).toBeNull()
  },
}

export const NoCitiesYet: Story = {
  args: { areas: [], regions: [], coverage: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Add area' }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: 'Add a city' }),
    ).toBeInTheDocument()
  },
}

export const Loading: Story = {
  args: { status: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Loading service areas'),
    ).toBeInTheDocument()
  },
}

export const ErrorState: Story = {
  args: { status: 'error', errorMessage: 'permission denied' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        "Couldn't load service areas: permission denied",
      ),
    ).toBeInTheDocument()
  },
}

export const ReadOnly: Story = {
  args: { canEdit: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await expect(canvas.getByText('View only')).toBeInTheDocument()
    await expect(
      within(canvas.getByRole('list', { name: 'Service areas' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(3)
    await expect(canvas.queryByRole('button', { name: 'Add area' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Add city' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: /^Edit / })).toBeNull()
    await expect(canvas.queryByRole('button', { name: /^Archive / })).toBeNull()
  },
}

export const PhoneIsReadOnly: Story = {
  args: { compact: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await expect(
      canvas.getByText('Editing needs a larger screen'),
    ).toBeInTheDocument()
    await expect(
      within(canvas.getByRole('list', { name: 'Service areas' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(3)
    await expect(canvas.queryByRole('button', { name: 'Add area' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: /^Edit / })).toBeNull()
  },
}

export const PreviewWarnsOnOverlap: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit Northwest' }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Review impact' }))

    const dialog = await canvas.findByRole('dialog')
    const inDialog = within(dialog)
    // The preview is called with the draft, tied to the area and the city.
    await expect(args.actions.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        id: NORTHWEST,
        name: 'Northwest',
        crewId: CREW_A,
        regionId: REGION,
        color: '#2f7350',
        priority: 0,
      }),
    )
    // Non-blocking overlap warning.
    await expect(inDialog.getByRole('alert')).toHaveTextContent(
      'Overlaps 1 area: Downtown core',
    )
    await expect(
      inDialog.getByText('You can still save', { exact: false }),
    ).toBeInTheDocument()
    // Properties that would move, from to.
    await expect(
      inDialog.getByText('2 properties would move'),
    ).toBeInTheDocument()
    const rows = inDialog.getAllByRole('listitem')
    await expect(rows[0]).toHaveTextContent('120 Elbow Dr SW')
    await expect(rows[0]).toHaveTextContent('Northwest')
    await expect(rows[0]).toHaveTextContent('Downtown core')
    await expect(rows[1]).toHaveTextContent('No area')
    await expect(rows[1]).toHaveTextContent('Northwest')

    // The warning does not block saving.
    const save = inDialog.getByRole('button', { name: 'Save area' })
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() => expect(args.actions.save).toHaveBeenCalledTimes(1))
    await expect(args.actions.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: NORTHWEST, boundary: AREAS[0].geometry }),
      null,
    )
    await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull())
  },
}

export const BackFromPreviewKeepsTheDraft: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit Northwest' }),
    )
    await userEvent.clear(canvas.getByLabelText('Name'))
    await userEvent.type(canvas.getByLabelText('Name'), 'North')
    await userEvent.click(canvas.getByRole('button', { name: 'Review impact' }))
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Back to editing' }),
    )
    await expect(canvas.queryByRole('dialog')).toBeNull()
    await expect(canvas.getByLabelText('Name')).toHaveValue('North')
    await expect(args.actions.save).not.toHaveBeenCalled()
  },
}

export const SaveFailureKeepsTheDialog: Story = {
  args: {
    actions: {
      preview: fn(() => Promise.resolve(PREVIEW)),
      save: fn(() => Promise.reject(new Error('boundary is not valid'))),
      archive: fn(() => Promise.resolve()),
      addRegion: fn(() => Promise.resolve({ id: 'x' })),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit Northwest' }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Review impact' }))
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save area' }),
    )
    await expect(
      await canvas.findByText('boundary is not valid'),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('dialog')).toBeInTheDocument()
  },
}

export const DrawAPolygon: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const region = await waitForMap(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add area' }))
    await userEvent.type(canvas.getByLabelText('Name'), 'Test area')
    await userEvent.selectOptions(canvas.getByLabelText('Crew'), CREW_B)
    await userEvent.click(canvas.getByRole('button', { name: 'Rose' }))
    // Nothing to review until a shape exists.
    await expect(
      canvas.getByRole('button', { name: 'Review impact' }),
    ).toBeDisabled()

    region.scrollIntoView({ block: 'center' })
    // Four corners, then the first corner again to close the shape.
    await clickFromCentre(region, -80, -60)
    await clickFromCentre(region, 80, -60)
    await clickFromCentre(region, 80, 60)
    await clickFromCentre(region, -80, 60)
    await clickFromCentre(region, -80, -60)

    const review = canvas.getByRole('button', { name: 'Review impact' })
    await waitFor(() => expect(review).toBeEnabled())
    await expect(
      canvas.getByRole('button', { name: 'Redraw on map' }),
    ).toBeInTheDocument()
    await userEvent.click(review)
    await waitFor(() => expect(args.actions.preview).toHaveBeenCalledTimes(1))
    const input = firstCall(args.actions.preview)
    await expect(input).toMatchObject({
      id: null,
      name: 'Test area',
      crewId: CREW_B,
      regionId: REGION,
      color: '#e07a8f',
    })
    await expect(input.boundary.type).toBe('Polygon')
    // A closed rectangle: four corners plus the closing position.
    const ring = (input.boundary.coordinates as Array<Array<Array<number>>>)[0]
    await expect(ring).toHaveLength(5)
    await expect(ring[0]).toEqual(ring[4])
    await expect(new Set(ring.map((p) => p.join(','))).size).toBe(4)
  },
}

/** The first argument of a mock's first call. */
function firstCall<T extends (...a: Array<never>) => unknown>(mock: T) {
  const calls = (mock as unknown as { mock: { calls: Array<Array<unknown>> } })
    .mock.calls
  return calls[0][0] as Parameters<T>[0] & {
    boundary: { type: string; coordinates: unknown }
  }
}

export const UseMapViewAsBoundary: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add area' }))
    await userEvent.type(canvas.getByLabelText('Name'), 'Whole view')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Use map view as boundary' }),
    )
    const review = canvas.getByRole('button', { name: 'Review impact' })
    await waitFor(() => expect(review).toBeEnabled())
    await userEvent.click(review)
    await waitFor(() => expect(args.actions.preview).toHaveBeenCalledTimes(1))
    await expect(firstCall(args.actions.preview).boundary.type).toBe('Polygon')
  },
}

export const AddRotation: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit Southeast' }),
    )
    await expect(canvas.queryByLabelText('Monday')).toBeNull()
    await userEvent.click(canvas.getByRole('switch', { name: 'Add rotation' }))
    await userEvent.selectOptions(canvas.getByLabelText('Monday'), CREW_B)
    await userEvent.selectOptions(canvas.getByLabelText('Friday'), CREW_B)
    await userEvent.click(canvas.getByRole('button', { name: 'Review impact' }))
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save area' }),
    )
    await waitFor(() => expect(args.actions.save).toHaveBeenCalledTimes(1))
    await expect(args.actions.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: SOUTHEAST }),
      [
        { weekday: 1, crewId: CREW_B },
        { weekday: 5, crewId: CREW_B },
      ],
    )
  },
}

export const AddACity: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add city' }))
    await userEvent.type(canvas.getByLabelText('City name'), 'Edmonton')
    await userEvent.type(canvas.getByLabelText('Longitude'), '-113.4909')
    await userEvent.type(canvas.getByLabelText('Latitude'), '53.5461')
    await userEvent.click(
      within(canvas.getByRole('form', { name: 'Add a city' })).getByRole(
        'button',
        {
          name: 'Add city',
        },
      ),
    )
    await waitFor(() => expect(args.actions.addRegion).toHaveBeenCalledTimes(1))
    await expect(args.actions.addRegion).toHaveBeenCalledWith({
      name: 'Edmonton',
      center: { type: 'Point', coordinates: [-113.4909, 53.5461] },
      bbox: null,
    })
  },
}

export const FrameThisView: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add city' }))
    await userEvent.type(canvas.getByLabelText('City name'), 'Calgary north')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Frame this view' }),
    )
    const form = within(canvas.getByRole('form', { name: 'Add a city' }))
    await waitFor(() =>
      expect(form.getByLabelText('Longitude')).not.toHaveValue(''),
    )
    await userEvent.click(form.getByRole('button', { name: 'Add city' }))
    await waitFor(() => expect(args.actions.addRegion).toHaveBeenCalledTimes(1))
    const call = (
      args.actions.addRegion as unknown as {
        mock: { calls: Array<Array<{ bbox: Array<number> | null }>> }
      }
    ).mock.calls[0][0]
    await expect(call.bbox).toHaveLength(4)
    await expect(call.bbox![0]).toBeLessThan(call.bbox![2])
  },
}

export const ArchiveAnArea: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Archive Southeast' }),
    )
    // A confirmation step before anything is sent.
    await expect(args.actions.archive).not.toHaveBeenCalled()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Archive Southeast' }),
    )
    await waitFor(() =>
      expect(args.actions.archive).toHaveBeenCalledWith(SOUTHEAST),
    )
  },
}

export const PreviewFailure: Story = {
  args: {
    actions: {
      preview: fn(() => Promise.reject(new Error('too many vertices'))),
      save: fn(() => Promise.resolve()),
      archive: fn(() => Promise.resolve()),
      addRegion: fn(() => Promise.resolve({ id: 'x' })),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitForMap(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Edit Northwest' }),
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Review impact' }))
    await expect(
      await canvas.findByText('too many vertices'),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('dialog')).toBeNull()
  },
}
