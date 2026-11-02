import { expect, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { RouteMap } from './RouteMap'
import { getMockWeekRoutes } from './mock-routes'
import '#/styles.css'

const day = getMockWeekRoutes(new Date(2026, 9, 7))[0]
const crew = { id: 'crew_1', name: 'Crew 1', color: '#7d5ba6' }
const stops = day.stops.slice(0, 5).map((s) => ({ ...s, crew }))

const meta = {
  title: 'Calendar/RouteMap',
  component: RouteMap,
  args: { stops, depot: { lon: -114.0362, lat: 51.0108 } },
  decorators: [
    (Story) => (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 560,
          height: 480,
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RouteMap>

export default meta
type Story = StoryObj<typeof meta>

export const DayRoute: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', {
      name: 'Route map',
    })
    await waitFor(
      () => expect(region.querySelector('[data-map-ready]')).not.toBeNull(),
      { timeout: 10_000 },
    )
    await expect(within(region).getByTestId('map-stops').textContent).toContain(
      `1. ${stops[0].customer}`,
    )
  },
}

export const UnplacedStop: Story = {
  args: {
    stops: stops.map((s, i) => (i === 2 ? { ...s, location: null } : s)),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const unplaced = within(
      await canvas.findByRole('region', { name: 'Stops not on the map' }),
    )
    await expect(unplaced.getByText(stops[2].customer)).toBeInTheDocument()
    await expect(unplaced.getByText('3')).toBeInTheDocument()
  },
}

export const NoStops: Story = {
  args: { stops: [] },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('region', { name: 'Route map' }),
    ).toBeNull()
  },
}
