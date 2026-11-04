import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import PropertyModal from './PropertyModal'
import type { PropertyRow } from '#/integrations/clients/properties'

const onSave = fn((_values: unknown) => Promise.resolve())
const onClose = fn()

const property: PropertyRow = {
  id: '0198f0a0-0000-7000-8000-000000000003',
  organization_id: '0198f0a0-0000-7000-8000-000000000001',
  client_id: '0198f0a0-0000-7000-8000-000000000002',
  name: 'Home',
  address_line1: '120 Crowfoot Way NW',
  address_line2: null,
  city: 'Calgary',
  region: 'AB',
  postal_code: 'T3G 2R2',
  country: 'CA',
  latitude: 51.1266,
  longitude: -114.2061,
  geocode_source: 'geoapify',
  access_notes: null,
  lot_size_sqft: 4200,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

const meta = {
  title: 'Clients/PropertyModal',
  component: PropertyModal,
  args: {
    clientName: 'Jane Smith',
    saving: false,
    onSave: (v) => onSave(v),
    onClose: () => onClose(),
  },
} satisfies Meta<typeof PropertyModal>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)
const reset = () => {
  onSave.mockClear()
  onClose.mockClear()
}

export const AddsAProperty: Story = {
  play: async () => {
    reset()
    await userEvent.click(body().getByRole('button', { name: 'Add property' }))
    await expect(onSave).not.toHaveBeenCalled()
    await userEvent.type(body().getByLabelText('Street address'), '12 Elm St')
    await userEvent.type(body().getByLabelText('City'), 'Calgary')
    await userEvent.type(body().getByLabelText('Postal code'), 't2x 1a1')
    await userEvent.click(body().getByRole('button', { name: 'Add property' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    await expect(onSave).toHaveBeenCalledWith({
      address: {
        address_line1: '12 Elm St',
        address_line2: '',
        city: 'Calgary',
        region: '',
        postal_code: 't2x 1a1',
        country: 'CA',
      },
      name: null,
      access_notes: null,
      lot_size_sqft: null,
    })
  },
}

export const EditsDetailsWithoutTouchingTheAddress: Story = {
  args: { property },
  play: async () => {
    reset()
    await expect(body().getByLabelText('Street address')).toHaveValue(
      '120 Crowfoot Way NW',
    )
    await userEvent.type(
      body().getByLabelText('Access notes (optional)'),
      'Gate code 1234',
    )
    await userEvent.click(body().getByRole('button', { name: 'Save property' }))
    // No address in the patch, so the saved coordinates stay.
    await expect(onSave).toHaveBeenCalledWith({
      name: 'Home',
      access_notes: 'Gate code 1234',
      lot_size_sqft: 4200,
    })
  },
}

export const RetypingDropsCoordinates: Story = {
  args: { property },
  play: async () => {
    reset()
    const street = body().getByLabelText('Street address')
    await userEvent.clear(street)
    await userEvent.type(street, '14 Elm St')
    await userEvent.click(body().getByRole('button', { name: 'Save property' }))
    const values = onSave.mock.calls[0][0] as { address: object }
    await expect(values.address).toMatchObject({ address_line1: '14 Elm St' })
    await expect(values.address).not.toHaveProperty('latitude')
  },
}
