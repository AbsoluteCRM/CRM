import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import MembersTab from './MembersTab'
import type { TeamMember } from '#/integrations/teams/teams'

const member = (
  id: string,
  display_name: string,
  role: TeamMember['role'],
  status: TeamMember['status'] = 'active',
): TeamMember => ({
  id,
  user_id: null,
  display_name,
  email: `${id}@example.com`,
  phone: null,
  color: null,
  role,
  status,
  work_days: [1, 2, 3, 4, 5],
  work_start: '08:00:00',
  work_end: '17:00:00',
})

const meta = {
  title: 'Team/MembersTab',
  component: MembersTab,
  args: {
    isLoading: false,
    error: null,
    members: [
      member('ava', 'Ava Owner', 'owner'),
      member('walt', 'Walt Worker', 'worker'),
      member('dee', 'Dee Disabled', 'worker', 'disabled'),
    ],
  },
} satisfies Meta<typeof MembersTab>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('row')).toHaveLength(4)
    await expect(canvas.getByText('Disabled')).toBeInTheDocument()
  },
}

export const FilterByRole: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Role'), 'owner')
    await expect(canvas.getAllByRole('row')).toHaveLength(2)
  },
}

export const Loading: Story = { args: { isLoading: true, members: [] } }

export const Failed: Story = {
  args: { error: new Error('boom'), members: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'boom',
    )
  },
}
