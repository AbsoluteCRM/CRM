import { expect, fireEvent, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { RouteBuilder } from './RouteBuilder'

const meta = {
  title: 'Operations/RouteBuilder',
  component: RouteBuilder,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-(--cream) p-4 text-(--ink)">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RouteBuilder>
export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {}

export const AddRemoveAndReorder: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const draft = within(canvas.getByRole('region', { name: 'Route draft' }))
    const list = within(
      canvas.getByRole('list', { name: 'Ordered route stops' }),
    )
    await expect(
      draft.getByRole('button', { name: 'Move Eleanor Mitchell up' }),
    ).toBeDisabled()
    await expect(
      draft.getByRole('button', { name: 'Move Westbrook Commons down' }),
    ).toBeDisabled()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    )
    await expect(list.getAllByRole('listitem')).toHaveLength(3)
    await expect(
      canvas.getByLabelText('On-site work 3h 30m'),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('img', { name: /with 3 numbered stops/ }),
    ).toBeInTheDocument()
    await userEvent.click(
      draft.getByRole('button', { name: 'Move Oliver Bennett up' }),
    )
    await expect(
      within(list.getAllByRole('listitem')[1]).getByRole('heading', {
        name: 'Oliver Bennett',
      }),
    ).toBeInTheDocument()
    await userEvent.click(
      draft.getByRole('button', { name: 'Move Eleanor Mitchell down' }),
    )
    await expect(
      within(list.getAllByRole('listitem')[0]).getByRole('heading', {
        name: 'Oliver Bennett',
      }),
    ).toBeInTheDocument()
    await userEvent.click(
      draft.getByRole('button', { name: 'Remove Oliver Bennett from route' }),
    )
    await expect(list.getAllByRole('listitem')).toHaveLength(2)
    await expect(
      canvas.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByLabelText('On-site work 2h 45m'),
    ).toBeInTheDocument()
  },
}

export const CrewAndDateDrafts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const crew = canvas.getByRole('combobox', { name: 'Assign to crew' })
    const date = canvas.getByLabelText('Route date')
    const stops = () =>
      within(canvas.getByRole('list', { name: 'Ordered route stops' }))
    await userEvent.selectOptions(crew, 'crew-south')
    await expect(canvas.getByText('Your route starts here')).toBeInTheDocument()
    // Existing north-crew visits are unavailable to the south crew.
    await expect(
      canvas.queryByRole('button', { name: 'Add Eleanor Mitchell to route' }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Add Sarah Chen to route' }),
    )
    await userEvent.selectOptions(crew, 'crew-north')
    await expect(stops().getAllByRole('listitem')).toHaveLength(2)
    await expect(
      canvas.queryByRole('button', { name: 'Add Sarah Chen to route' }),
    ).not.toBeInTheDocument()
    await fireEvent.change(date, { target: { value: '2026-10-30' } })
    await expect(canvas.getByText('A clear day')).toBeInTheDocument()
    await expect(canvas.getByText('Your route starts here')).toBeInTheDocument()
    await fireEvent.change(date, { target: { value: '2026-10-29' } })
    await expect(stops().getAllByRole('listitem')).toHaveLength(2)
    await userEvent.selectOptions(crew, 'crew-south')
    await expect(stops().getAllByRole('listitem')).toHaveLength(1)
    await expect(
      stops().getByRole('heading', { name: 'Sarah Chen' }),
    ).toBeInTheDocument()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove Sarah Chen from route' }),
    )
    await userEvent.selectOptions(crew, 'crew-north')
    await expect(
      canvas.getByRole('button', { name: 'Add Sarah Chen to route' }),
    ).toBeInTheDocument()
  },
}

export const SearchAndReset: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const search = canvas.getByRole('searchbox')
    for (const query of ['Oliver', 'Willow', 'J-1043', 'Leaf removal']) {
      await userEvent.clear(search)
      await userEvent.type(search, query)
      await expect(
        canvas.getByRole('button', { name: 'Add Oliver Bennett to route' }),
      ).toBeInTheDocument()
      await expect(
        canvas.queryByRole('button', { name: 'Add Sarah Chen to route' }),
      ).not.toBeInTheDocument()
    }
    await userEvent.click(
      canvas.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    )
    await userEvent.type(search, 'not-a-match')
    await expect(canvas.getByText('No matching visits')).toBeInTheDocument()
    await userEvent.selectOptions(canvas.getByRole('combobox'), 'crew-south')
    await userEvent.click(canvas.getByRole('button', { name: 'Reset demo' }))
    await expect(search).toHaveValue('')
    await expect(canvas.getByRole('combobox')).toHaveValue('crew-north')
    await expect(canvas.getByLabelText('Route date')).toHaveValue('2026-10-29')
    await expect(
      canvas.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('status')).toHaveTextContent('Demo reset.')
    await expect(
      within(
        canvas.getByRole('list', { name: 'Ordered route stops' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(2)
  },
}

export const AllVisitsAssigned: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const name of [
      'Oliver Bennett',
      'Sarah Chen',
      'Maple Ridge Dental',
      'James Campbell',
    ]) {
      await userEvent.click(
        canvas.getByRole('button', { name: `Add ${name} to route` }),
      )
    }
    await expect(
      canvas.getByText('All visits are on a route'),
    ).toBeInTheDocument()
    await expect(canvas.getByLabelText('6 planned stops')).toBeInTheDocument()
    const stops = within(
      canvas.getByRole('list', { name: 'Ordered route stops' }),
    ).getAllByRole('listitem')
    for (const [index, stop] of stops.entries()) {
      await expect(
        within(stop).getByText(String(index + 1), { exact: true }),
      ).toBeInTheDocument()
    }
  },
}

export const EmptyDate: Story = { args: { initialDate: '2026-10-30' } }
export const FilteredEmpty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole('searchbox'), 'No such customer')
    await expect(canvas.getByText('No matching visits')).toBeInTheDocument()
  },
}
export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 358, maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
}
