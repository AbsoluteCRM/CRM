import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import type { LinkedQuote } from '#/server/trusted/quote-links'
import QuoteLinkView from './QuoteLinkView'

const quote: LinkedQuote = {
  number: 'Q-0007',
  status: 'sent',
  title: 'Spring cleanup and weekly mowing',
  message: 'Thanks for reaching out! Here’s what we discussed on the phone.',
  conditions: 'Price assumes the yard is accessible through the side gate.',
  valid_until: '2026-12-01',
  subtotal_cents: 54900,
  tax_cents: 2745,
  total_cents: 57645,
  currency: 'CAD',
  organization_name: 'Greenline Landscaping',
  client_name: 'Pat Prospect',
  lines: [
    {
      id: '0198f0a0-0000-7000-8000-000000000011',
      position: 1,
      description: 'Spring cleanup',
      quantity: 1,
      unit_price_cents: 34900,
      amount_cents: 34900,
      tax_cents: 1745,
      is_optional: false,
      is_selected: false,
      frequency: 'one_time',
      season_start_month: null,
      season_end_month: null,
    },
    {
      id: '0198f0a0-0000-7000-8000-000000000012',
      position: 2,
      description: 'Weekly mowing',
      quantity: 1,
      unit_price_cents: 20000,
      amount_cents: 20000,
      tax_cents: 1000,
      is_optional: false,
      is_selected: false,
      frequency: 'weekly',
      season_start_month: 5,
      season_end_month: 9,
    },
    {
      id: '0198f0a0-0000-7000-8000-000000000013',
      position: 3,
      description: 'Aeration',
      quantity: 1,
      unit_price_cents: 9000,
      amount_cents: 9000,
      tax_cents: 450,
      is_optional: true,
      is_selected: false,
      frequency: 'one_time',
      season_start_month: null,
      season_end_month: null,
    },
  ],
}

const meta = {
  title: 'Quotes/QuoteLinkView',
  component: QuoteLinkView,
  parameters: { layout: 'fullscreen' },
  args: {
    quote,
    onApprove: fn(() => Promise.resolve(true)),
    onDecline: fn(() => Promise.resolve(true)),
  },
} satisfies Meta<typeof QuoteLinkView>

export default meta
type Story = StoryObj<typeof meta>

export const ApprovesWithOptionalExtras: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Hi Pat Prospect,')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Approve $576.45' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByLabelText('Include Aeration'))
    const approve = canvas.getByRole('button', { name: 'Approve $670.95' })
    await userEvent.click(approve)
    await expect(args.onApprove).toHaveBeenCalledWith([
      '0198f0a0-0000-7000-8000-000000000013',
    ])
  },
}

export const DeclinesWithAReason: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Decline' }))
    await userEvent.type(
      canvas.getByLabelText(/Anything you’d like them to know/),
      'Going with a neighbour',
    )
    await userEvent.click(
      canvas.getByRole('button', { name: 'Decline estimate' }),
    )
    await expect(args.onDecline).toHaveBeenCalledWith('Going with a neighbour')
  },
}

export const AlreadyApproved: Story = {
  args: { quote: { ...quote, status: 'approved' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('You approved this estimate')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: /Approve/ })).toBeNull()
  },
}

export const Declined: Story = {
  args: { quote: { ...quote, status: 'declined' } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('You declined this estimate'),
    ).toBeVisible()
  },
}
