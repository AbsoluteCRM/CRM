import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import MembersTab from './MembersTab'
import type { Crew } from '#/integrations/crews/crews'
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
  certifications: [],
  jobs_completed: 0,
  hours_worked: 0,
  rating: null,
  created_at: '2026-01-01T00:00:00Z',
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
      member('zoe', 'Zoe Worker', 'worker', 'invited'),
      member('dee', 'Dee Disabled', 'worker', 'disabled'),
    ],
    crews: [
      {
        id: 'c1',
        name: 'Oak',
        color: '#7fb547',
        disabled_at: null,
        crew_members: [{ member_id: 'dee', is_lead: false }],
      },
    ] satisfies Array<
      Pick<Crew, 'id' | 'name' | 'color' | 'disabled_at' | 'crew_members'>
    >,
  },
} satisfies Meta<typeof MembersTab>

export default meta
type Story = StoryObj<typeof meta>

const names = (el: HTMLElement) =>
  within(el)
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('p')?.textContent)

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Contractors only: the owner isn't listed. Crew first, unassigned last.
    await expect(names(canvasElement)).toEqual([
      'Dee Disabled',
      'Walt Worker',
      'Zoe Worker',
    ])
    await expect(canvas.getByText('Oak')).toBeInTheDocument()
    await expect(canvas.getByText('Disabled')).toBeInTheDocument()
  },
}

export const SortByStatus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(canvas.getByLabelText('Sort by'), 'status')
    await expect(names(canvasElement)).toEqual([
      'Walt Worker',
      'Zoe Worker',
      'Dee Disabled',
    ])
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
