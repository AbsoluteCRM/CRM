import { expect, fireEvent, fn, userEvent, within } from 'storybook/test'
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
  work_days: [1, 2, 3, 4, 5],
  work_start: '08:00:00',
  work_end: '17:00:00',
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
  disabled_at: null,
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
    actions: {
      createCrew: fn(() => Promise.resolve({ id: 'new' })),
      renameCrew: fn(),
      setVehicle: fn(),
      moveMember: fn(),
      setLead: fn(),
      setCrewActive: fn(),
      archiveCrew: fn(() => Promise.resolve(true)),
      restoreCrew: fn(() => Promise.resolve(true)),
      deleteCrew: fn(() => Promise.resolve(true)),
      crewHistory: fn(() =>
        Promise.resolve({
          pastRoutes: 0,
          upcomingRoutes: 0,
          completedVisits: 0,
          lastRouteDate: null,
        }),
      ),
    },
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
    await expect(canvas.getByDisplayValue('Crew A')).toBeInTheDocument()
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
    // Every non-disabled member without a crew is unassigned, whatever their role.
    await expect(canvas.getByText('Wade Worker')).toBeInTheDocument()
    await expect(canvas.getByText('Ava Owner')).toBeInTheDocument()
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
  args: {
    crews: [],
    actions: {
      createCrew: fn(() => Promise.resolve({ id: 'new' })),
      renameCrew: fn(),
      setVehicle: fn(),
      moveMember: fn(),
      setLead: fn(),
      setCrewActive: fn(),
      archiveCrew: fn(() => Promise.resolve(true)),
      restoreCrew: fn(() => Promise.resolve(true)),
      deleteCrew: fn(() => Promise.resolve(true)),
      crewHistory: fn(() =>
        Promise.resolve({
          pastRoutes: 0,
          upcomingRoutes: 0,
          completedVisits: 0,
          lastRouteDate: null,
        }),
      ),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /create crew/i }))
    await expect(args.actions.createCrew).toHaveBeenCalledWith(
      'New crew',
      expect.stringMatching(/^#[0-9a-f]{6}$/i),
    )
  },
}

export const CreateCrewPicksUniqueName: Story = {
  args: { crews: [crew('c1', 'New crew', [])] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /create crew/i }))
    await expect(args.actions.createCrew).toHaveBeenCalledWith(
      'New crew 2',
      expect.any(String),
    )
  },
}

export const DragToCrew: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByText('Wade Worker', { selector: 'p' })
    const column = canvas
      .getByDisplayValue('Crew B')
      .closest('[class*="w-72"]')!
    const dataTransfer = new DataTransfer()
    await fireEvent.dragStart(card, { dataTransfer })
    await fireEvent.drop(column, { dataTransfer })
    await expect(args.actions.moveMember).toHaveBeenCalledWith('wade', 'c2')
  },
}

export const DragToUnassigned: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const card = canvas.getByText('Walt Worker', { selector: 'p' })
    const column = canvas.getByText('Unassigned').closest('[class*="w-72"]')!
    const dataTransfer = new DataTransfer()
    await fireEvent.dragStart(card, { dataTransfer })
    await fireEvent.drop(column, { dataTransfer })
    await expect(args.actions.moveMember).toHaveBeenCalledWith('walt', null)
  },
}

export const SetLead: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.selectOptions(
      canvas.getAllByLabelText('Crew lead')[0],
      'wendy',
    )
    await expect(args.actions.setLead).toHaveBeenCalledWith('c1', 'wendy')
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
