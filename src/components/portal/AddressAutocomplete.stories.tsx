import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import AddressAutocomplete from './AddressAutocomplete'
import type { GeoapifyResult } from './AddressAutocomplete'

const RESULTS: Array<GeoapifyResult> = [
  {
    place_id: 'a',
    formatted: '120 Crowfoot Way NW, Calgary, AB T3G 2R2, Canada',
    address_line1: '120 Crowfoot Way NW',
    address_line2: 'Calgary, AB T3G 2R2, Canada',
    housenumber: '120',
    street: 'Crowfoot Way NW',
    city: 'Calgary',
    state: 'Alberta',
    state_code: 'AB',
    postcode: 'T3G 2R2',
    country: 'Canada',
    country_code: 'ca',
    lat: 51.1266,
    lon: -114.2061,
  },
  {
    place_id: 'b',
    formatted: '120 Crowchild Trail NW, Calgary, AB T2N 4R6, Canada',
    address_line1: '120 Crowchild Trail NW',
    address_line2: 'Calgary, AB T2N 4R6, Canada',
    housenumber: '120',
    street: 'Crowchild Trail NW',
    city: 'Calgary',
    state_code: 'AB',
    postcode: 'T2N 4R6',
    country: 'Canada',
  },
]

const onSelect = fn()
const fetcher = fn((text: string) =>
  Promise.resolve(
    RESULTS.filter((r) =>
      r.formatted?.toLowerCase().includes(text.toLowerCase()),
    ),
  ),
)

const meta = {
  title: 'Portal/AddressAutocomplete',
  component: AddressAutocomplete,
  args: { onSelect: (a) => onSelect(a), fetcher: (t) => fetcher(t) },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480, minHeight: 320, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AddressAutocomplete>

export default meta
type Story = StoryObj<typeof meta>

export const PicksWithTheMouse: Story = {
  play: async ({ canvasElement }) => {
    onSelect.mockClear()
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Find your address'), '120 Crow')
    await userEvent.click(
      await canvas.findByRole('option', { name: /120 Crowfoot Way NW/ }),
    )
    await expect(onSelect).toHaveBeenCalledWith({
      line1: '120 Crowfoot Way NW',
      line2: '',
      city: 'Calgary',
      region: 'AB',
      postalCode: 'T3G 2R2',
      country: 'Canada',
      countryCode: 'CA',
      latitude: 51.1266,
      longitude: -114.2061,
    })
    await expect(canvas.queryByRole('listbox')).toBeNull()
  },
}

export const PicksWithTheKeyboard: Story = {
  play: async ({ canvasElement }) => {
    onSelect.mockClear()
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Find your address')
    await userEvent.type(input, '120 Crow')
    await canvas.findAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ line1: '120 Crowchild Trail NW' }),
      ),
    )
  },
}

export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Find your address'), 'zzzz')
    await expect(await canvas.findByText(/No matches/)).toBeVisible()
  },
}

export const HiddenWithoutAKey: Story = {
  args: { fetcher: undefined, apiKey: undefined },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByLabelText('Find your address'),
    ).toBeNull()
  },
}
