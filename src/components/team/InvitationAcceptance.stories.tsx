import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import InvitationAcceptance from './InvitationAcceptance'

const meta = {
  title: 'Team/InvitationAcceptance',
  component: InvitationAcceptance,
  args: {
    valid: true,
    onAuthenticate: fn(async () => {}),
    onAccept: fn(),
    onSignOut: fn(),
    onOpenTeam: fn(),
  },
} satisfies Meta<typeof InvitationAcceptance>
export default meta
type Story = StoryObj<typeof meta>

export const SignIn: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(args.onAccept).not.toHaveBeenCalled()
    await userEvent.type(
      canvas.getByLabelText('Email'),
      'recipient@example.com',
    )
    await userEvent.type(canvas.getByLabelText('Password'), 'password123')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Sign in' }),
    )
    await expect(args.onAuthenticate).toHaveBeenCalledWith(
      'sign-in',
      'recipient@example.com',
      'password123',
    )
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}
export const SignUp: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Create an account instead' }),
    )
    await userEvent.type(
      canvas.getByLabelText('Email'),
      'recipient@example.com',
    )
    await userEvent.type(canvas.getByLabelText('Password'), 'password123')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Create account' }),
    )
    await expect(args.onAuthenticate).toHaveBeenCalledWith(
      'sign-up',
      'recipient@example.com',
      'password123',
    )
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}
export const ConfirmationRequired: Story = {
  args: { confirmation: true },
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Check your email',
    )
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}
export const ReadyToAccept: Story = {
  args: { email: 'recipient@example.com' },
  play: async ({ canvasElement, args }) => {
    await expect(args.onAccept).not.toHaveBeenCalled()
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Accept invitation' }),
    )
    await expect(args.onAccept).toHaveBeenCalledOnce()
  },
}
export const SwitchAccount: Story = {
  args: { email: 'wrong@example.com' },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', {
        name: 'Use another account',
      }),
    )
    await expect(args.onSignOut).toHaveBeenCalledOnce()
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}
export const Accepting: Story = {
  args: { email: 'recipient@example.com', busy: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Accepting…' }),
    ).toBeDisabled()
  },
}
export const InvalidLink: Story = {
  args: { valid: false },
  play: async ({ canvasElement, args }) => {
    await expect(
      within(canvasElement).getByText(/missing or malformed/),
    ).toBeInTheDocument()
    await expect(
      within(canvasElement).queryByRole('button', {
        name: 'Accept invitation',
      }),
    ).not.toBeInTheDocument()
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}
export const Rejected: Story = {
  args: {
    email: 'wrong@example.com',
    error:
      'This invitation is invalid, expired, already used, or intended for another email. Use the invited account or ask for a new invitation.',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'intended for another email',
    )
  },
}
export const AlreadyMember: Story = {
  args: {
    email: 'recipient@example.com',
    error:
      'You are already a member of this team. Open your dashboard to select it.',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      'already a member',
    )
  },
}
export const JoinedRecovery: Story = {
  args: {
    email: 'recipient@example.com',
    joined: true,
    error: 'You joined successfully, but the team could not be opened.',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.queryByRole('button', { name: 'Accept invitation' }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Retry opening team' }),
    )
    await expect(args.onOpenTeam).toHaveBeenCalledOnce()
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}
export const Loading: Story = {
  args: { loading: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Loading your account…'),
    ).toBeInTheDocument()
  },
}
