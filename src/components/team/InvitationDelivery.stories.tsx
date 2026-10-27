import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import InvitationDelivery from './InvitationDelivery'

const meta = {
  title: 'Team/InvitationDelivery',
  component: InvitationDelivery,
  args: {
    email: 'recipient@example.com',
    inviteLink:
      'https://terraformaflow.com/accept-invite?token=' + 'a'.repeat(64),
    delivery: 'sent',
    busy: false,
    onCopy: fn(),
    onRetry: fn(),
  },
} satisfies Meta<typeof InvitationDelivery>
export default meta
type Story = StoryObj<typeof meta>

export const Sent: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'provider accepted',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Copy' }))
    await expect(args.onCopy).toHaveBeenCalledOnce()
  },
}
export const Unconfirmed: Story = {
  args: { delivery: 'failed' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Unable to confirm',
    )
    await expect(canvas.getByText(/Only the latest/)).toBeInTheDocument()
    await expect(canvas.getByLabelText('Invite link')).toHaveValue(
      args.inviteLink,
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Retry with new link' }),
    )
    await expect(args.onRetry).toHaveBeenCalledOnce()
  },
}
export const Retrying: Story = {
  args: { delivery: 'failed', busy: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Sending…' }),
    ).toBeDisabled()
  },
}
