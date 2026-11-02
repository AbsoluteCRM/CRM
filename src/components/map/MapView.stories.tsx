import { fromLonLat } from 'ol/proj'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type OlMapInstance from 'ol/Map'

import { MapView } from './MapView'
import type { MapStop } from './MapView'
import '#/styles.css'

const YARD = { lon: -114.0362, lat: 51.0108 }
const STOPS: Array<MapStop> = [
  {
    id: 'a',
    position: { lon: -114.0573, lat: 51.0453 },
    label: '1',
    title: '1. 800 Macleod Trail SE',
    color: '#2f7350',
    muted: true,
  },
  {
    id: 'b',
    position: { lon: -114.1305, lat: 51.0784 },
    label: '2',
    title: '2. 2500 University Dr NW',
    color: '#2f7350',
  },
  {
    id: 'c',
    position: { lon: -113.9853, lat: 51.0393 },
    label: '3',
    title: '3. 1212 37 St SE',
    color: '#2f7350',
  },
]

/** Captured by `onReady`, so play functions can find pixels on the canvas. */
let lastMap: OlMapInstance | null = null

const meta = {
  title: 'Map/MapView',
  component: MapView,
  args: {
    label: 'Route map',
    style: { width: 640, height: 420 },
    stops: STOPS,
    depot: { position: YARD, title: 'Yard' },
    route: {
      path: [YARD, ...STOPS.map((s) => s.position), YARD],
      color: '#2f7350',
      legLabels: ['9m', '14m', '18m', ''],
    },
    onSelectStop: fn(),
    onReady: (map) => {
      lastMap = map
    },
  },
} satisfies Meta<typeof MapView>

export default meta
type Story = StoryObj<typeof meta>

async function waitForMap(canvasElement: HTMLElement) {
  const region = within(canvasElement).getByRole('region', {
    name: 'Route map',
  })
  await waitFor(
    () => expect(region.querySelector('[data-map-ready]')).not.toBeNull(),
    { timeout: 10_000 },
  )
  return region
}

/** Clicks the map canvas where `stop` is drawn. */
async function clickStop(region: HTMLElement, stop: MapStop) {
  const map = lastMap!
  const viewport = region.querySelector<HTMLElement>('.ol-viewport')!
  const [x, y] = map.getPixelFromCoordinate(
    fromLonLat([stop.position.lon, stop.position.lat]),
  )
  const rect = viewport.getBoundingClientRect()
  await userEvent.pointer([
    {
      keys: '[MouseLeft>]',
      target: viewport,
      coords: { clientX: rect.left + x, clientY: rect.top + y },
    },
    {
      keys: '[/MouseLeft]',
      target: viewport,
      coords: { clientX: rect.left + x, clientY: rect.top + y },
    },
  ])
}

export const RouteWithDepot: Story = {
  play: async ({ canvasElement }) => {
    const region = await waitForMap(canvasElement)
    await expect(region.querySelector('canvas')).not.toBeNull()
    await expect(within(region).getByTestId('map-stops').textContent).toBe(
      'Stops on the map: 1. 800 Macleod Trail SE; 2. 2500 University Dr NW; 3. 1212 37 St SE',
    )
    // Every stop and the yard is framed inside the view.
    const size = lastMap!.getSize()!
    for (const p of [YARD, ...STOPS.map((s) => s.position)]) {
      const [x, y] = lastMap!.getPixelFromCoordinate(fromLonLat([p.lon, p.lat]))
      await expect(x).toBeGreaterThan(0)
      await expect(x).toBeLessThan(size[0])
      await expect(y).toBeGreaterThan(0)
      await expect(y).toBeLessThan(size[1])
    }
  },
}

export const SelectStop: Story = {
  args: { activeStopId: 'a' },
  play: async ({ args, canvasElement }) => {
    const region = await waitForMap(canvasElement)
    await clickStop(region, STOPS[1])
    await waitFor(() => expect(args.onSelectStop).toHaveBeenCalledWith('b'))
  },
}

export const LocalTileGrid: Story = {
  args: { basemap: { kind: 'grid' } },
  play: async ({ canvasElement }) => {
    const region = await waitForMap(canvasElement)
    await expect(region.querySelector('canvas')).not.toBeNull()
  },
}

export const Empty: Story = {
  args: { stops: [], route: undefined, depot: undefined },
  play: async ({ canvasElement }) => {
    const region = await waitForMap(canvasElement)
    await expect(within(region).queryByTestId('map-stops')).toBeNull()
  },
}
