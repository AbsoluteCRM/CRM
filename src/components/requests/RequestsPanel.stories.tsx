import { expect, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { inferRouterOutputs } from '@trpc/server'

import RequestsPanel from './RequestsPanel'
import type { TRPCRouter } from '#/integrations/trpc/router'

type RequestRow = inferRouterOutputs<TRPCRouter>['requests']['list'][number]
type ServiceRow = inferRouterOutputs<TRPCRouter>['services']['list'][number]

const service = {
  id: '0198f0a0-0000-7000-8000-000000000002',
  organization_id: '0198f0a0-0000-7000-8000-000000000001',
  name: 'Lawn maintenance',
  description: null,
  unit: 'each',
  default_price_cents: 20000,
  default_duration_minutes: 60,
  color: '#7fb547',
  equipment: [],
  frequencies: ['one_time'],
  season_start_month: null,
  season_end_month: null,
  archived_at: null,
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: '2026-10-01T12:00:00.000Z',
} satisfies ServiceRow

const snowService = {
  ...service,
  id: '0198f0a0-0000-7000-8000-000000000003',
  name: 'Snow removal',
  color: '#6aa6c9',
} satisfies ServiceRow

const request = (
  overrides: Partial<RequestRow> &
    Pick<RequestRow, 'id' | 'status' | 'service_id'>,
): RequestRow => {
  const { id, service_id, status, ...values } = overrides
  return {
    id,
    organization_id: '0198f0a0-0000-7000-8000-000000000001',
    client_id: null,
    service_id,
    contact_name: 'Ava Green',
    contact_email: 'ava@example.com',
    contact_phone: '403-555-0100',
    address: '123 Main Street SW, Calgary',
    notes: 'Please call before arriving.',
    status,
    source: 'web_form',
    submitted_at: '2026-10-15T12:00:00.000Z',
    created_at: '2026-10-15T12:00:00.000Z',
    updated_at: '2026-10-15T12:00:00.000Z',
    ...values,
  }
}

const requests = [
  request({
    id: '0198f0a0-0000-7000-8000-000000000011',
    status: 'submitted',
    service_id: service.id,
  }),
  request({
    id: '0198f0a0-0000-7000-8000-000000000012',
    status: 'rejected',
    service_id: snowService.id,
    contact_name: 'Ben Stone',
    contact_email: 'ben@example.com',
    address: '456 Pine Avenue, Calgary',
    notes: null,
    source: 'phone',
    submitted_at: '2026-10-14T12:00:00.000Z',
  }),
]

const meta = {
  title: 'Requests/RequestsPanel',
  component: RequestsPanel,
  args: { requests, services: [service, snowService] },
} satisfies Meta<typeof RequestsPanel>

export default meta
type Story = StoryObj<typeof meta>

export const FiltersAndReadOnlyDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('row')).toHaveLength(2)

    await userEvent.click(canvas.getByRole('tab', { name: /All/ }))
    await expect(canvas.getAllByRole('row')).toHaveLength(3)

    const search = canvas.getByRole('searchbox', {
      name: 'Search name, address, service',
    })
    await userEvent.type(search, '123 Main')
    await expect(canvas.getAllByRole('row')).toHaveLength(2)
    await expect(canvas.getByText('Ava Green')).toBeInTheDocument()
    await expect(canvas.queryByText('Ben Stone')).toBeNull()

    await userEvent.clear(search)
    await userEvent.click(
      canvas.getByRole('row', { name: 'Open request from Ava Green' }),
    )
    const dialog = within(canvas.getByRole('dialog'))
    await expect(
      dialog.getByRole('heading', { name: 'Ava Green' }),
    ).toBeVisible()
    await expect(dialog.getByText('Lawn maintenance')).toBeVisible()
    await expect(dialog.getByText('Please call before arriving.')).toBeVisible()
    await expect(dialog.getByText('Web form')).toBeVisible()
    await expect(
      dialog.queryByRole('button', { name: /reject|approve|schedule/i }),
    ).toBeNull()

    await userEvent.click(dialog.getByRole('button', { name: 'Close' }))
    await expect(canvas.queryByRole('dialog')).toBeNull()

    await userEvent.click(canvas.getByRole('tab', { name: /Rejected/ }))
    await expect(canvas.getAllByRole('row')).toHaveLength(2)
    await expect(canvas.getByText('Ben Stone')).toBeInTheDocument()
    await expect(canvas.queryByText('Ava Green')).toBeNull()
  },
}
