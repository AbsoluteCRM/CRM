import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import QuoteConversation from './QuoteConversation'

const meta = {
  title: 'Quotes/Conversation',
  component: QuoteConversation,
  args: {
    messages: [],
    onSend: fn(
      async (_input: { body: string; clientMessageId: string }) => true,
    ),
  },
} satisfies Meta<typeof QuoteConversation>
export default meta
type Story = StoryObj<typeof meta>
export const Empty: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(
      canvas.getByLabelText('Message'),
      'Can we start in May?',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Send message' }))
    await expect(args.onSend).toHaveBeenCalledWith({
      body: 'Can we start in May?',
      clientMessageId: expect.any(String),
    })
    await expect(canvas.getByLabelText('Message')).toHaveValue('')
  },
}
export const Retry: Story = {
  args: {
    onSend: fn(
      async (_input: { body: string; clientMessageId: string }) => false,
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Message'), 'Please call me.')
    await userEvent.click(canvas.getByRole('button', { name: 'Send message' }))
    await expect(canvas.getByRole('alert')).toBeVisible()
    await expect(canvas.getByLabelText('Message')).toHaveValue(
      'Please call me.',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Retry send' }))
    const calls = args.onSend.mock.calls
    await expect(calls[0][0]).toEqual(calls[1][0])
  },
}
export const History: Story = {
  args: {
    hasOlder: true,
    onLoadOlder: fn(async () => {}),
    messages: [
      {
        id: '0198f0a0-0000-7000-8000-000000000001',
        body: 'Thank you!\nWe will be in touch.',
        sender_kind: 'staff',
        created_at: '2026-10-20T12:00:00Z',
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Load older messages' }),
    )
    await expect(args.onLoadOlder).toHaveBeenCalled()
  },
}
export const Loading: Story = { args: { loading: true } }
export const Error: Story = {
  args: { error: 'Message limit reached. Please wait before trying again.' },
}
