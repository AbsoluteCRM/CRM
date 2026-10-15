import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import SeasonBar from './SeasonBar'

const meta = {
  title: 'Services/SeasonBar',
  component: SeasonBar,
  args: { currentMonth: 1 },
} satisfies Meta<typeof SeasonBar>

export default meta
type Story = StoryObj<typeof meta>

// Reads which of the 12 month segments are filled with the service color.
const filledMonths = (bar: HTMLElement) =>
  Array.from(bar.children)
    .map((cell, i) => {
      const fill = (cell.firstElementChild as HTMLElement).style.background
      return fill.includes('var(') ? 0 : i + 1
    })
    .filter(Boolean)

export const WrapsOverNewYear: Story = {
  args: { service: { color: '#3366ff', season: { start: 11, end: 3 } } },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByLabelText('Available Nov → Mar')
    await expect(filledMonths(bar)).toEqual([1, 2, 3, 11, 12])
  },
}

export const SummerOnly: Story = {
  args: { service: { color: '#3366ff', season: { start: 4, end: 10 } } },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByLabelText('Available Apr → Oct')
    await expect(filledMonths(bar)).toEqual([4, 5, 6, 7, 8, 9, 10])
  },
}

export const YearRound: Story = {
  args: { service: { color: '#3366ff', season: null } },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement).getByLabelText('Available Year-round')
    await expect(filledMonths(bar)).toHaveLength(12)
  },
}
