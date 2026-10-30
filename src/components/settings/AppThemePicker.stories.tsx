import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import AppThemePicker from './AppThemePicker'

const onPick = fn()

const meta = {
  title: 'Settings/AppThemePicker',
  component: AppThemePicker,
  args: { value: '#2f7350', disabled: false, onPick: (b) => onPick(b) },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppThemePicker>

export default meta
type Story = StoryObj<typeof meta>

export const PicksAPreset: Story = {
  play: async ({ canvasElement }) => {
    onPick.mockClear()
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: 'Forest' })).toBeChecked()
    await userEvent.click(canvas.getByRole('radio', { name: 'Cedar' }))
    await expect(onPick).toHaveBeenCalledWith('#7a4a24')
  },
}

export const CustomColourInUse: Story = {
  args: { value: '#cc3366' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('(in use)')).toBeVisible()
    await expect(canvas.queryByRole('radio', { checked: true })).toBeNull()
    await expect(canvas.getByLabelText('Custom brand colour')).toHaveValue(
      '#cc3366',
    )
  },
}
