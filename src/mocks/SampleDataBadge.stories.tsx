import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { SampleDataBadge, SampleDataNote } from './SampleDataBadge'

const meta = {
  title: 'Mocks/SampleDataBadge',
  component: SampleDataBadge,
} satisfies Meta<typeof SampleDataBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Badge: Story = {
  play: async ({ canvasElement }) => {
    const badge = within(canvasElement).getByText('Sample data')
    await expect(badge.closest('[title]')).toHaveAttribute(
      'title',
      'Demo data. Not saved, and not from your account.',
    )
  },
}

export const Note: Story = {
  render: () => <SampleDataNote />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sample data')).toBeVisible()
    await expect(
      canvas.getByText('Demo data. Not saved, and not from your account.'),
    ).toBeVisible()
  },
}

export const NoteWithText: Story = {
  render: () => (
    <SampleDataNote>
      Demo properties. Edits stay in this browser tab and are not saved.
    </SampleDataNote>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Demo properties. Edits stay in this browser tab and are not saved.',
      ),
    ).toBeVisible()
  },
}
