import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import CrewBuilder from './CrewBuilder'
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
})

const crew = (
  id: string,
  name: string,
  crew_members: Crew['crew_members'],
): Crew => ({
  id,
  organization_id: 'org',
  name,
  color: '#7fb547',
  vehicle: null,
  default_start_time: '08:00:00',
  max_work_minutes: null,
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  crew_members,
})

const meta = {
  title: 'Team/CrewBuilder',
  component: CrewBuilder,
  args: {
    editable: true,
    crewsLoading: false,
    crewsError: null,
    members: [
      member('ava', 'Ava Owner', 'owner'),
      member('walt', 'Walt Worker', 'worker'),
      member('wendy', 'Wendy Worker', 'worker'),
      member('wade', 'Wade Worker', 'worker'),
      member('dee', 'Dee Disabled', 'worker', 'disabled'),
    ],
    crews: [
      crew('c1', 'Crew A', [
        { member_id: 'walt', is_lead: true },
        { member_id: 'wendy', is_lead: false },
      ]),
      crew('c2', 'Crew B', []),
    ],
  },
} satisfies Meta<typeof CrewBuilder>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Crews are seeded into local state by an effect after the first render.
    await expect(await canvas.findByDisplayValue('Crew A')).toBeInTheDocument()
    await expect(canvas.getByText('Unassigned')).toBeInTheDocument()
    await expect(canvas.getByDisplayValue('Crew B')).toBeInTheDocument()
    await expect(canvas.getAllByLabelText('Crew name')).toHaveLength(2)
    // Selector skips the lead <option> entries, so only member cards match.
    await expect(
      canvas.getByText('Walt Worker', { selector: 'p' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText('Wendy Worker', { selector: 'p' }),
    ).toBeInTheDocument()
    // Wade is the only worker without a crew; the owner and disabled worker are excluded.
    await expect(canvas.getByText('Wade Worker')).toBeInTheDocument()
    await expect(canvas.queryByText('Ava Owner')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Dee Disabled')).not.toBeInTheDocument()
    await expect(
      canvas.getByLabelText('Crew lead', { selector: 'svg' }),
    ).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: { crews: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Unassigned')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Crew name')).not.toBeInTheDocument()
    await expect(canvas.getByText('Walt Worker')).toBeInTheDocument()
  },
}

export const CreateCrew: Story = {
  args: { crews: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('New crew name'), 'Crew Z')
    await userEvent.click(canvas.getByRole('button', { name: /create crew/i }))
    await expect(canvas.getByDisplayValue('Crew Z')).toBeInTheDocument()
    await expect(canvas.getByLabelText('New crew name')).toHaveValue('')
  },
}

export const Loading: Story = {
  args: { crewsLoading: true, crews: undefined },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Loading crews…'),
    ).toBeInTheDocument()
  },
}

export const Failed: Story = {
  args: { crewsError: new Error('boom'), crews: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'boom',
    )
  },
}
