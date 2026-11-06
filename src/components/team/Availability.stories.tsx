import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { DEFAULT_BUSINESS_HOURS } from '#/integrations/settings/schema'
import type { TimeOff } from '#/integrations/teams/availability'
import type { TeamMember } from '#/integrations/teams/teams'
import { AvailabilityBoard, MyAvailability } from './Availability'

// Monday, so the 14 days start on a known weekday.
const TODAY = '2026-11-02'

const member = (
  id: string,
  display_name: string,
  role: TeamMember['role'] = 'worker',
  work_days = [1, 2, 3, 4, 5],
): TeamMember => ({
  id,
  user_id: null,
  display_name,
  email: `${id}@example.com`,
  phone: null,
  color: null,
  role,
  status: 'active',
  work_days,
  work_start: '08:00:00',
  work_end: '17:00:00',
})

const members = [
  member('mgr', 'Maya Manager', 'admin'),
  member('walt', 'Walt Worker'),
  member('wendy', 'Wendy Worker', 'worker', [2, 3, 4, 5, 6]),
]

const off = (
  id: string,
  member_id: string,
  kind: TimeOff['kind'],
  start_date: string,
  end_date: string,
  status: TimeOff['status'],
  note: string | null = null,
): TimeOff => ({
  id,
  member_id,
  kind,
  start_date,
  end_date,
  note,
  status,
  requested_by_member_id: member_id,
  reviewed_by_member_id: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-10-30T12:00:00Z',
})

const timeOff = [
  off('t1', 'walt', 'sick', '2026-11-03', '2026-11-04', 'pending', 'Flu'),
  off('t2', 'wendy', 'vacation', '2026-11-10', '2026-11-12', 'approved'),
]

// Closed on Sundays for these stories.
const hours = {
  ...DEFAULT_BUSINESS_HOURS,
  sun: { ...DEFAULT_BUSINESS_HOURS.sun, closed: true },
}

const actions = () => ({
  request: fn(() => Promise.resolve(true)),
  record: fn(() => Promise.resolve(true)),
  review: fn(() => Promise.resolve(true)),
  cancel: fn(() => Promise.resolve(true)),
  setSchedule: fn(() => Promise.resolve(true)),
  busy: false,
})

const meta = {
  title: 'Team/AvailabilityBoard',
  component: AvailabilityBoard,
  parameters: { layout: 'padded' },
  args: {
    members,
    timeOff,
    hours,
    myMemberId: 'mgr',
    canManage: true,
    today: TODAY,
    actions: actions(),
  },
} satisfies Meta<typeof AvailabilityBoard>

export default meta
type Story = StoryObj<typeof meta>

export const ManagerApprovesSickRequest: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByLabelText(/Walt Worker, Tuesday, Nov\.? 3: Request pending/i),
    ).toBeVisible()
    await expect(
      canvas.getByLabelText(/Wendy Worker, Tuesday, Nov\.? 10: Vacation/i),
    ).toBeVisible()
    await expect(
      canvas.getByLabelText(/Walt Worker, Sunday, Nov\.? 8: Business closed/i),
    ).toBeDisabled()
    await expect(
      canvas.getByLabelText(/Wendy Worker, Monday, Nov\.? 2: Day off/i),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Approve' }))
    await expect(args.actions.review).toHaveBeenCalledWith('t1', true)
  },
}

export const ManagerEditsASchedule: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: "Edit Walt Worker's schedule" }),
    )
    const dialog = within(document.body)
    await expect(dialog.getByRole('button', { name: 'Sun' })).toBeDisabled()
    await userEvent.click(dialog.getByRole('button', { name: 'Sat' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Save schedule' }))
    await expect(args.actions.setSchedule).toHaveBeenCalledWith({
      memberId: 'walt',
      workDays: [1, 2, 3, 4, 5, 6],
      workStart: '08:00',
      workEnd: '17:00',
    })
  },
}

export const ManagerCantApproveOwnRequest: Story = {
  args: {
    timeOff: [
      off('t3', 'mgr', 'personal', '2026-11-05', '2026-11-05', 'pending'),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Approve' })).toBeNull()
    await expect(
      canvas.getByText(/Another manager or the owner reviews your own request/),
    ).toBeVisible()
  },
}

export const DispatcherReadOnly: Story = {
  args: { canManage: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Approve' })).toBeNull()
    await expect(
      canvas.queryByRole('button', { name: 'Record time off' }),
    ).toBeNull()
  },
}

export const ContractorRequestsSickTime: StoryObj<typeof MyAvailability> = {
  render: (args) => <MyAvailability {...args} />,
  args: {
    me: members[1],
    timeOff,
    hours,
    today: TODAY,
    actions: actions(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Waiting for a manager')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Request time off' }),
    )
    const dialog = within(document.body)
    await userEvent.click(dialog.getByRole('button', { name: 'Send request' }))
    await expect(args.actions.request).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'sick' }),
    )
  },
}
