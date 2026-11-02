import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import RouteMap from './RouteMap'
import { demoLonLat } from './route'
import type { RouteStop } from './route'
import type { Job, Property } from './types'
import '#/styles.css'

function stop(
  n: number,
  grid: { x: number; y: number } | null,
  status: Job['status'] = 'assigned',
): RouteStop {
  const property: Property = {
    id: `prop_${n}`,
    organization_id: 'org_greenleaf',
    client_id: `cli_${n}`,
    label: 'Home',
    address_line1: `${100 + n * 11} Elbow Dr SW`,
    city: 'Calgary',
    region: 'AB',
    postal_code: 'T2S 2J4',
    lawnSqft: 2400,
    gateCode: '',
    pets: 'None',
    accessNotes: '',
    instructions: '',
    x: grid?.x ?? 50,
    y: grid?.y ?? 50,
    location: grid ? demoLonLat('Calgary', grid) : null,
  }
  const job: Job = {
    id: `job_${n}`,
    number: `J-${1000 + n}`,
    organization_id: 'org_greenleaf',
    client_id: property.client_id,
    property_id: property.id,
    service_ids: [],
    crew_id: 'crew_1',
    date: '2026-11-02',
    start: `${String(7 + n).padStart(2, '0')}:00`,
    durationMinutes: 45,
    status,
    recurrence: 'one_time',
    price_cents: 6500,
    notes: '',
    completionNotes: '',
    photos: [],
    invoice_id: null,
    request_id: null,
  }
  return { job, property, driveFromPrev: 10, eta: job.start }
}

const STOPS = [
  stop(1, { x: 30, y: 30 }, 'completed'),
  stop(2, { x: 70, y: 25 }),
  stop(3, { x: 75, y: 80 }),
  stop(4, { x: 20, y: 70 }),
]

const meta = {
  title: 'CRM/RouteMap',
  component: RouteMap,
  args: { stops: STOPS, color: '#3f7fa8', onSelect: fn() },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RouteMap>

export default meta
type Story = StoryObj<typeof meta>

async function mapReady(canvasElement: HTMLElement) {
  const region = within(canvasElement).getByRole('region', {
    name: 'Route map',
  })
  await waitFor(
    () => expect(region.querySelector('[data-map-ready]')).not.toBeNull(),
    { timeout: 10_000 },
  )
  return region
}

export const CrewRoute: Story = {
  play: async ({ canvasElement }) => {
    const region = await mapReady(canvasElement)
    await expect(within(region).getByTestId('map-stops').textContent).toMatch(
      /4\. 144 Elbow Dr SW, ETA 11/,
    )
    await expect(
      within(canvasElement).queryByRole('region', {
        name: 'Stops not on the map',
      }),
    ).toBeNull()
  },
}

export const ActiveJob: Story = {
  args: { activeJobId: 'job_2', showLegs: false },
  play: async ({ canvasElement }) => {
    await mapReady(canvasElement)
  },
}

export const StopsWithoutLocation: Story = {
  args: { stops: [...STOPS.slice(0, 2), stop(5, null), stop(6, null)] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const region = await mapReady(canvasElement)
    const text = within(region).getByTestId('map-stops').textContent
    await expect(text).toContain('1. ')
    await expect(text).not.toContain('155 Elbow Dr SW')
    const unplaced = within(
      canvas.getByRole('region', { name: 'Stops not on the map' }),
    )
    await expect(unplaced.getAllByRole('listitem')).toHaveLength(2)
    await expect(unplaced.getByText('155 Elbow Dr SW')).toBeInTheDocument()
    await expect(unplaced.getByText('3')).toBeInTheDocument()
  },
}

export const SelectFromMap: Story = {
  args: { stops: [STOPS[1]], depot: null },
  play: async ({ args, canvasElement }) => {
    const region = await mapReady(canvasElement)
    // A single stop is centred, so a click in the middle of the map hits it.
    const viewport = region.querySelector<HTMLElement>('.ol-viewport')!
    const rect = viewport.getBoundingClientRect()
    const coords = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: viewport, coords },
      { keys: '[/MouseLeft]', target: viewport, coords },
    ])
    await waitFor(() => expect(args.onSelect).toHaveBeenCalledWith('job_2'))
  },
}
