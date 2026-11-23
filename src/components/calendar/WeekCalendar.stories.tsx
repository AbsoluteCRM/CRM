import { expect, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { WeekCalendar } from './WeekCalendar'

const meta = {
  title: 'Calendar/WeekCalendar',
  component: WeekCalendar,
  args: { initialDate: new Date(2026, 9, 7) },
} satisfies Meta<typeof WeekCalendar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DaySelected: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /8 jobs/ }))
    const stops = within(canvas.getByRole('region', { name: 'Route stops' }))
    await expect(stops.getAllByRole('listitem')).toHaveLength(8)
  },
}

export const RouteMapShown: Story = {
  args: { depot: { lon: -114.0362, lat: 51.0108 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /8 jobs/ }))
    const map = canvas.getByRole('region', { name: 'Route map' })
    await waitFor(
      () => expect(map.querySelector('[data-map-ready]')).not.toBeNull(),
      { timeout: 10_000 },
    )
    await expect(within(map).getByTestId('map-stops').textContent).toMatch(
      /^Stops on the map: 1\. .*; 8\. /,
    )
    await expect(map.querySelector('canvas')).not.toBeNull()
  },
}

export const UpdateStop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /8 jobs/ }))
    const stops = within(canvas.getByRole('region', { name: 'Route stops' }))
    const [first] = stops.getAllByRole('listitem')
    await userEvent.click(
      within(first).getByRole('button', { name: /^Update / }),
    )
    const dialog = within(await canvas.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('tab', { name: 'In progress' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await expect(
      within(stops.getAllByRole('listitem')[0]).getByText('In progress'),
    ).toBeInTheDocument()
  },
}
