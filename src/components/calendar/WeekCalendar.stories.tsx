import { expect, userEvent, within } from 'storybook/test'
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
  args: { mapApiKey: 'storybook-key' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /8 jobs/ }))
    await expect(canvas.getByTitle('Route map')).toBeInTheDocument()
  },
}
