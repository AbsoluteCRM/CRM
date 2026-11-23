import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import ClientAddressModal from './ClientAddressModal'
import type { ClientRow } from '#/integrations/clients/clients'

const onSave = fn((_address: unknown) => Promise.resolve())
const onClose = fn()

const client = {
  id: '0198f0a0-0000-7000-8000-000000000002',
  organization_id: '0198f0a0-0000-7000-8000-000000000001',
  kind: 'individual',
  status: 'active',
  display_name: 'Jane Smith',
  first_name: null,
  last_name: null,
  company_name: null,
  email: 'jane@example.com',
  phone: null,
  billing_address_line1: null,
  billing_address_line2: null,
  billing_city: null,
  billing_region: null,
  billing_postal_code: null,
  billing_country: null,
  lead_source: null,
  tags: [],
  notes: null,
  tax_exempt: false,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
} as ClientRow

const meta = {
  title: 'Clients/ClientAddressModal',
  component: ClientAddressModal,
  args: {
    client,
    saving: false,
    onSave: (a) => onSave(a),
    onClose: () => onClose(),
  },
} satisfies Meta<typeof ClientAddressModal>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)
const reset = () => {
  onSave.mockClear()
  onClose.mockClear()
}

export const AddsAnAddress: Story = {
  play: async () => {
    reset()
    await expect(
      body().queryByRole('button', { name: 'Remove address' }),
    ).toBeNull()
    await userEvent.click(body().getByRole('button', { name: 'Save address' }))
    await expect(onSave).not.toHaveBeenCalled()
    await userEvent.type(body().getByLabelText('Street address'), '12 Elm St')
    await userEvent.type(body().getByLabelText('City'), 'Calgary')
    await userEvent.click(body().getByRole('button', { name: 'Save address' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    await expect(onSave).toHaveBeenCalledWith({
      address_line1: '12 Elm St',
      address_line2: '',
      city: 'Calgary',
      region: '',
      postal_code: '',
      country: 'CA',
    })
  },
}

export const EditsOrRemovesAnAddress: Story = {
  args: {
    client: {
      ...client,
      billing_address_line1: '120 Crowfoot Way NW',
      billing_city: 'Calgary',
      billing_region: 'AB',
      billing_postal_code: 'T3G 2R2',
      billing_country: 'CA',
    },
  },
  play: async () => {
    reset()
    await expect(body().getByLabelText('Postal code')).toHaveValue('T3G 2R2')
    await userEvent.click(
      body().getByRole('button', { name: 'Remove address' }),
    )
    await expect(onSave).toHaveBeenCalledWith(null)
  },
}
