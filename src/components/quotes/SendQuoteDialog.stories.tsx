import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import SendQuoteDialog from './SendQuoteDialog'

const meta = {
  title: 'Quotes/SendQuoteDialog',
  component: SendQuoteDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    recipient: 'alex@example.com',
    title: 'Summer lawn care',
    validUntil: '2027-05-01',
    lineCount: 2,
    onConfirm: fn(async () => true),
  },
} satisfies Meta<typeof SendQuoteDialog>
export default meta
type Story = StoryObj<typeof meta>
export const Send: Story = {
  play: async ({ args }) => {
    const canvas = within(document.body)
    await expect(
      canvas.getByText(
        'Optional items are excluded from the total. The customer cannot select extras yet.',
      ),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Send quote' }))
    await expect(args.onConfirm).toHaveBeenCalled()
  },
}
export const Retry: Story = {
  args: { retry: true },
  play: async () => {
    const canvas = within(document.body)
    await expect(canvas.getByText(/The old link stops working/)).toBeVisible()
  },
}
export const MissingDetails: Story = {
  args: {
    recipient: null,
    title: null,
    validUntil: null,
    lineCount: 0,
    unsaved: true,
  },
  play: async () => {
    await expect(
      within(document.body).getByRole('button', { name: 'Send quote' }),
    ).toBeDisabled()
  },
}
export const Failed: Story = {
  args: { error: 'Delivery was not confirmed. Retry with a new link.' },
}
export const Sending: Story = { args: { busy: true } }
