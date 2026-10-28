import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import PrecipitationFields from './PrecipitationFields'

const meta = {
  title: 'Services/PrecipitationFields',
  component: PrecipitationFields,
  args: {
    value: { precipitation_type: 'none', precipitation_action: 'none' },
    onChange: () => undefined,
  },
  render: function Controlled(args) {
    const [value, setValue] = useState(args.value)
    return <PrecipitationFields {...args} value={value} onChange={setValue} />
  },
} satisfies Meta<typeof PrecipitationFields>

export default meta
type Story = StoryObj<typeof meta>

export const NoDependency: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Precipitation')).toHaveValue('none')
    await expect(canvas.getByLabelText('Suggested action')).toBeDisabled()
    await expect(canvas.getByLabelText('Suggested action')).toHaveValue('none')
  },
}

export const EditSnow: Story = {
  args: {
    value: { precipitation_type: 'snow', precipitation_action: 'schedule' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Precipitation')).toHaveValue('snow')
    await expect(canvas.getByLabelText('Suggested action')).toHaveValue(
      'schedule',
    )
  },
}

export const ChangeAndClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const type = canvas.getByLabelText('Precipitation')
    const action = canvas.getByLabelText('Suggested action')
    await userEvent.selectOptions(type, 'snow')
    await expect(action).toHaveValue('schedule')
    await userEvent.selectOptions(type, 'rain')
    await userEvent.selectOptions(action, 'reschedule')
    await expect(action).toHaveValue('reschedule')
    await userEvent.selectOptions(type, 'any')
    await expect(type).toHaveValue('any')
    await expect(action).toHaveValue('reschedule')
    await userEvent.selectOptions(type, 'none')
    await expect(action).toBeDisabled()
    await expect(action).toHaveValue('none')
    await userEvent.selectOptions(type, 'rain')
    await expect(action).toHaveValue('schedule')
  },
}

export const Saving: Story = {
  args: {
    disabled: true,
    value: { precipitation_type: 'rain', precipitation_action: 'reschedule' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Precipitation')).toBeDisabled()
    await expect(canvas.getByLabelText('Suggested action')).toBeDisabled()
  },
}
