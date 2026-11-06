import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import PublicQuote from './PublicQuote'

const data = {
  number: 'Q-0012',
  title: 'Summer lawn care',
  status: 'sent' as const,
  message: 'Thanks for choosing our team.',
  conditions: 'Payment due within 30 days.',
  valid_until: '2027-05-01',
  subtotal_cents: 10000,
  tax_cents: 500,
  total_cents: 10500,
  currency: 'CAD',
  organization_name: 'Green Yard',
  client_name: 'Alex Rivera',
  lines: [
    {
      id: '0198f0a0-0000-7000-8000-000000000001',
      position: 1,
      description: 'Lawn care',
      quantity: 1,
      unit_price_cents: 10000,
      amount_cents: 10000,
      tax_cents: 500,
      is_optional: false,
      is_selected: false,
      frequency: 'weekly' as const,
      season_start_month: 5,
      season_end_month: 9,
    },
    {
      id: '0198f0a0-0000-7000-8000-000000000002',
      position: 2,
      description: 'Aeration',
      quantity: 1,
      unit_price_cents: 5000,
      amount_cents: 5000,
      tax_cents: 250,
      is_optional: true,
      is_selected: false,
      frequency: 'one_time' as const,
      season_start_month: null,
      season_end_month: null,
    },
  ],
}
const meta = {
  title: 'Quotes/PublicQuote',
  component: PublicQuote,
  args: {
    data,
    onRetry: fn(),
    onApprove: fn(async () => true),
    onDecline: fn(async () => true),
  },
} satisfies Meta<typeof PublicQuote>
export default meta
type Story = StoryObj<typeof meta>
export const Review: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'PDF · Coming soon' }),
    ).toBeDisabled()
    await expect(canvas.getByRole('checkbox')).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Accept quote' }))
    await expect(
      canvas.getByText(
        'Confirm the total of $105.00 and the terms shown above.',
      ),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Confirm acceptance' }),
    )
    await expect(args.onApprove).toHaveBeenCalled()
  },
}
export const Decline: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Decline quote' }))
    await userEvent.type(
      canvas.getByLabelText('Reason (optional)'),
      'Plans changed',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Confirm decline' }),
    )
    await expect(args.onDecline).toHaveBeenCalledWith('Plans changed')
  },
}
export const Phone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
export const Approved: Story = {
  args: { data: { ...data, status: 'approved' } },
}
export const Declined: Story = {
  args: { data: { ...data, status: 'declined' } },
}
export const Loading: Story = { args: { loading: true } }
export const Unavailable: Story = { args: { unavailable: true } }
export const Error: Story = { args: { data: null } }
