import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { DEFAULT_PALETTE } from '#/integrations/settings/schema'
import PortalPaletteCard from './PortalPaletteCard'

const onSave = fn((_palette: unknown) => Promise.resolve(true))

const meta = {
  title: 'Settings/PortalPaletteCard',
  component: PortalPaletteCard,
  args: {
    palette: DEFAULT_PALETTE,
    saving: false,
    onSave: (p) => onSave(p),
  },
} satisfies Meta<typeof PortalPaletteCard>

export default meta
type Story = StoryObj<typeof meta>

export const PicksAPreset: Story = {
  play: async ({ canvasElement }) => {
    onSave.mockClear()
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('radio', { name: 'Forest' })).toBeChecked()
    await userEvent.click(canvas.getByRole('radio', { name: 'Lakeside' }))
    await expect(onSave).toHaveBeenCalledWith({
      primary: '#15324a',
      secondary: '#e2ebf1',
      accent: '#8fd0f0',
    })
  },
}

export const CustomColours: Story = {
  args: {
    palette: { primary: '#222222', secondary: '#eeeeee', accent: '#ff8800' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('(in use)')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Save colours' }),
    ).toBeDisabled()
    await expect(canvas.getByLabelText('Accent colour')).toHaveValue('#ff8800')
  },
}
