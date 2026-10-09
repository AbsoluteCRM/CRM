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
