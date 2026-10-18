import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { inferRouterOutputs } from '@trpc/server'

import RequestDetail from './RequestDetail'
import type { TRPCRouter } from '#/integrations/trpc/router'

type Outputs = inferRouterOutputs<TRPCRouter>
type RequestRow = Outputs['requests']['list'][number]
type QuoteSummary = Outputs['quotes']['listForRequest'][number]

const ORG = '0198f0a0-0000-7000-8000-000000000001'
const REQ = '0198f0a0-0000-7000-8000-000000000003'

const request = {
  id: REQ,
  organization_id: ORG,
  client_id: null,
  service_id: '0198f0a0-0000-7000-8000-000000000002',
  contact_name: 'Ava Green',
  contact_email: 'ava@example.com',
  contact_phone: '403-555-0100',
  address: '123 Main Street SW, Calgary',
  notes: 'Please call before arriving.',
  info_needed: null,
  status: 'reviewing',
  source: 'web_form',
  submitted_at: '2026-10-15T12:00:00.000Z',
  created_at: '2026-10-15T12:00:00.000Z',
  updated_at: '2026-10-15T12:00:00.000Z',
} satisfies RequestRow

const quote = (
  revision: number,
  status: QuoteSummary['status'],
  total: number,
): QuoteSummary => ({
  id: `0198f0a0-0000-7000-8000-0000000001${revision}0`,
  organization_id: ORG,
  number: `Q-000${revision}`,
  client_id: '0198f0a0-0000-7000-8000-000000000009',
  property_id: null,
  request_id: REQ,
  revision,
  status,
  title: 'Spring clean-up',
  message: null,
  conditions: null,
  valid_until: null,
  subtotal_cents: total,
  tax_cents: 0,
  total_cents: total,
  sent_at: null,
  approved_at: null,
  declined_reason: null,
  created_at: '2026-10-15T12:00:00.000Z',
  updated_at: '2026-10-16T12:00:00.000Z',
})

const meta = {
  title: 'Requests/RequestDetail',
  component: RequestDetail,
  args: {
    request,
    quotes: [],
    onSaveInfoNeeded: fn(() => Promise.resolve(true)),
    onCreateDraft: fn(() => Promise.resolve(true)),
    onOpenQuote: fn(),
  },
} satisfies Meta<typeof RequestDetail>

export default meta
type Story = StoryObj<typeof meta>

export const NoQuoteYet: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No quote yet')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Build quote' }))
    await expect(args.onCreateDraft).toHaveBeenCalledWith(null)

    const save = canvas.getByRole('button', { name: 'Save note' })
    await expect(save).toBeDisabled()
    await userEvent.type(canvas.getByLabelText('Note'), 'Need square footage')
    await userEvent.click(save)
    await expect(args.onSaveInfoNeeded).toHaveBeenCalledWith(
      'Need square footage',
    )
  },
}

export const Revisions: Story = {
  args: { quotes: [quote(2, 'sent', 30000), quote(1, 'expired', 25000)] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(canvas.getByRole('button', { name: 'New revision' }))
    await expect(args.onCreateDraft).toHaveBeenCalledWith(args.quotes[0].id)
    await userEvent.click(canvas.getByText(/Revision 1/))
    await expect(args.onOpenQuote).toHaveBeenCalledWith(args.quotes[1].id)
  },
}

export const DraftBlocksNewRevision: Story = {
  args: { quotes: [quote(1, 'draft', 0)] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.queryByRole('button', { name: /revision|Build/ }),
    ).toBeNull()
  },
}

export const ConvertedIsClosed: Story = {
  args: {
    request: { ...request, status: 'converted' },
    quotes: [quote(1, 'converted', 25000)],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('button', { name: 'New revision' }),
    ).toBeNull()
  },
}
