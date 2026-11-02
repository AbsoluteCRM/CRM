import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { inferRouterOutputs } from '@trpc/server'

import QuoteEditor from './QuoteEditor'
import type { TRPCRouter } from '#/integrations/trpc/router'

type Outputs = inferRouterOutputs<TRPCRouter>
type QuoteData = Outputs['quotes']['get']

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const GST = '0198f0a0-0000-7000-8000-000000000020'
const SERVICE = '0198f0a0-0000-7000-8000-000000000002'

const services = [
  {
    id: SERVICE,
    organization_id: ORG,
    name: 'Lawn maintenance',
    description: null,
    unit: 'monthly',
    default_price_cents: 12000,
    default_duration_minutes: 60,
    color: '#7fb547',
    equipment: [],
    frequencies: ['one_time'],
    precipitation_type: 'none',
    precipitation_action: 'none',
    season_start_month: null,
    season_end_month: null,
    archived_at: null,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
  },
] satisfies Outputs['services']['list']

const taxRates = [
  { id: GST, name: 'GST', percentage: 5 },
] satisfies Outputs['quotes']['taxRates']

const quote = {
  id: '0198f0a0-0000-7000-8000-000000000004',
  organization_id: ORG,
  number: 'Q-0007',
  client_id: '0198f0a0-0000-7000-8000-000000000009',
  property_id: null,
  request_id: '0198f0a0-0000-7000-8000-000000000003',
  revision: 2,
  status: 'draft',
  title: 'Spring clean-up',
  message: 'Thanks for reaching out.',
  conditions: null,
  valid_until: null,
  subtotal_cents: 25000,
  tax_cents: 1250,
  total_cents: 26250,
  sent_at: null,
  approved_at: null,
  declined_reason: null,
  created_at: '2026-10-15T12:00:00.000Z',
  updated_at: '2026-10-15T12:00:00.000Z',
} satisfies QuoteData['quote']

const lines = [
  {
    id: '0198f0a0-0000-7000-8000-000000000005',
    quote_id: quote.id,
    service_id: SERVICE,
    position: 1,
    description: 'Lawn maintenance',
    quantity: 2,
    unit_price_cents: 12500,
    amount_cents: 25000,
    is_optional: false,
    is_selected: false,
    frequency: 'weekly',
    season_start_month: 5,
    season_end_month: 9,
    quote_line_item_taxes: [
      { tax_rate_id: GST, percentage: 5, amount_cents: 1250 },
    ],
  },
] satisfies QuoteData['lines']

const draft = { quote, lines, delivery: null } satisfies QuoteData

const meta = {
  title: 'Quotes/QuoteEditor',
  component: QuoteEditor,
  args: {
    data: draft,
    taxRates,
    services,
    onSaveDetails: fn(() => Promise.resolve(true)),
    onSaveLine: fn(() => Promise.resolve(true)),
    onDeleteLine: fn(() => Promise.resolve(true)),
    onPullBack: fn(() => Promise.resolve(true)),
  },
} satisfies Meta<typeof QuoteEditor>

export default meta
type Story = StoryObj<typeof meta>

export const DraftEditing: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('$262.50')).toBeVisible()
    await expect(canvas.getByText('Lawn maintenance')).toBeVisible()

    const title = canvas.getByLabelText('Title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Fall clean-up')
    await userEvent.type(
      canvas.getByLabelText('Conditions'),
      'Price confirmed after a site visit.',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Save details' }))
    await expect(args.onSaveDetails).toHaveBeenCalledWith({
      title: 'Fall clean-up',
      message: 'Thanks for reaching out.',
      conditions: 'Price confirmed after a site visit.',
      validUntil: null,
    })

    await userEvent.click(canvas.getByRole('button', { name: 'Add line' }))
    const add = canvas.getByRole('button', { name: 'Add line' })
    await expect(add).toBeDisabled()
    await userEvent.selectOptions(
      canvas.getByLabelText('Service (optional)'),
      SERVICE,
    )
    await expect(canvas.getByLabelText('Unit price ($)')).toHaveValue('120.00')
    await userEvent.clear(canvas.getByLabelText('Quantity'))
    await userEvent.type(canvas.getByLabelText('Quantity'), '1.5')
    await userEvent.click(canvas.getByRole('button', { name: /GST/ }))
    await userEvent.click(canvas.getByRole('switch', { name: 'Optional line' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Add line' }))
    await expect(args.onSaveLine).toHaveBeenCalledWith({
      lineId: null,
      serviceId: SERVICE,
      description: 'Lawn maintenance',
      quantity: 1.5,
      unitPriceCents: 12000,
      isOptional: true,
      taxRateIds: [GST],
      frequency: 'one_time',
      seasonStartMonth: null,
      seasonEndMonth: null,
    })

    await userEvent.click(
      canvas.getByRole('button', { name: 'Delete Lawn maintenance' }),
    )
    await expect(args.onDeleteLine).toHaveBeenCalledWith(lines[0].id)
  },
}

export const Empty: Story = {
  args: {
    data: {
      quote: { ...quote, subtotal_cents: 0, tax_cents: 0, total_cents: 0 },
      lines: [],
      delivery: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No line items yet')).toBeVisible()
  },
}

export const SentReadOnly: Story = {
  args: {
    data: {
      quote: { ...quote, status: 'sent' },
      lines,
      delivery: {
        id: '0198f0a0-0000-7000-8000-000000000030',
        delivery_status: 'failed',
        delivery_attempts: 1,
        last_delivery_error: 'Mailbox unavailable',
        expires_at: '2026-12-01T00:00:00.000Z',
        revoked_at: null,
        viewed_at: null,
        created_at: '2026-10-16T12:00:00.000Z',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Title')).toBeDisabled()
    await expect(canvas.queryByRole('button', { name: 'Add line' })).toBeNull()
    await expect(
      canvas.queryByRole('button', { name: 'Delete Lawn maintenance' }),
    ).toBeNull()
    await expect(canvas.getByText('Email failed')).toBeVisible()
    await expect(canvas.getByText('Mailbox unavailable')).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Pull back to draft' }),
    )
    await expect(args.onPullBack).toHaveBeenCalled()
  },
}

export const SaveFailed: Story = {
  args: {
    error: 'Quote details can only be edited while the quote is a draft.',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      "That didn't save",
    )
  },
}
