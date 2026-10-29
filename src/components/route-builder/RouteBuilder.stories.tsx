import { flushSync } from 'react-dom'
import { expect, fireEvent, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { RouteBuilder } from '#/components/route-builder/RouteBuilder'

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
const route = (element: HTMLElement, name: string) =>
  within(within(element).getByRole('region', { name }))
async function drop(element: HTMLElement, name: string, id: string) {
  const transfer = new DataTransfer()
  transfer.setData('application/x-crm-route-visit', id)
  const target = within(element).getByRole('region', { name })
  target.dispatchEvent(
    new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }),
  )
  flushSync(() => {
    target.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  })
}
export const Populated: Story = {}
export const CreateEmptyAndAssignCrew: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByRole('button', { name: 'Create route' }))
    const third = route(canvasElement, 'Route 3')
    await expect(third.getByText('Empty template')).toBeInTheDocument()
    await expect(
      third.getByRole('combobox', { name: 'Crew for Route 3' }),
    ).toHaveValue('')
    await expect(
      third.getByLabelText('Route 3: 0 stops, 0 min on site'),
    ).toBeInTheDocument()
    await userEvent.click(
      c.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    )
    await expect(
      third.getByRole('article', { name: 'Visit Oliver Bennett' }),
    ).toBeInTheDocument()
    await expect(
      third.getByRole('option', { name: /North crew/ }),
    ).toBeDisabled()
    // Even a forged change cannot claim a crew already occupied on this date.
    await fireEvent.change(
      third.getByRole('combobox', { name: 'Crew for Route 3' }),
      {
        target: { value: 'crew-north' },
      },
    )
    await expect(
      third.getByRole('combobox', { name: 'Crew for Route 3' }),
    ).toHaveValue('')
    await expect(c.getByRole('status')).toHaveTextContent('already has a route')
    await userEvent.selectOptions(
      route(canvasElement, 'Route 1').getByRole('combobox', {
        name: 'Crew for Route 1',
      }),
      '',
    )
    await userEvent.selectOptions(
      third.getByRole('combobox', { name: 'Crew for Route 3' }),
      'crew-north',
    )
    await userEvent.selectOptions(
      third.getByRole('combobox', { name: 'Crew for Route 3' }),
      '',
    )
    await expect(
      third.getByRole('article', { name: 'Visit Oliver Bennett' }),
    ).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Create route' }))
    await expect(
      route(canvasElement, 'Route 4').getByText('Empty template'),
    ).toBeInTheDocument()
    await expect(
      c.getByRole('button', { name: 'Select Route 4' }),
    ).toHaveAttribute('aria-pressed', 'true')
  },
}
export const DragTransfersAndInvalidDrops: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const one = route(canvasElement, 'Route 1')
    const two = route(canvasElement, 'Route 2')
    const pool = route(canvasElement, 'Available jobs')
    const source = pool.getByRole('article', { name: 'Visit Oliver Bennett' })
    await expect(source).toHaveAttribute('draggable', 'true')
    const data = new DataTransfer()
    source.dispatchEvent(
      new DragEvent('dragstart', { bubbles: true, dataTransfer: data }),
    )
    await expect(data.getData('application/x-crm-route-visit')).toBe('visit-2')
    flushSync(() => {
      c.getByRole('region', { name: 'Route 1' }).dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: data,
        }),
      )
    })
    await expect(
      one.getByLabelText('Route 1: 3 stops, 3h 30m on site'),
    ).toBeInTheDocument()
    await expect(
      c.getByRole('img', { name: /with 3 numbered stops/ }),
    ).toBeInTheDocument()
    await drop(canvasElement, 'Route 2', 'visit-2')
    await expect(
      one.queryByRole('article', { name: 'Visit Oliver Bennett' }),
    ).not.toBeInTheDocument()
    await expect(
      two.getByLabelText('Route 2: 2 stops, 1h 45m on site'),
    ).toBeInTheDocument()
    await expect(two.getByLabelText('Stop 2')).toBeInTheDocument()
    await drop(canvasElement, 'Route 2', 'visit-2')
    await expect(two.getAllByRole('listitem')).toHaveLength(2)
    await drop(canvasElement, 'Route 2', 'unknown-visit')
    await expect(c.getByRole('status')).toHaveTextContent('cannot be moved')
    await expect(two.getAllByRole('listitem')).toHaveLength(2)
    await drop(canvasElement, 'Available jobs', 'visit-2')
    await expect(
      pool.getByRole('article', { name: 'Visit Oliver Bennett' }),
    ).toBeInTheDocument()
    await expect(two.getByLabelText('Stop 1')).toBeInTheDocument()
    await fireEvent.change(c.getByLabelText('Route date'), {
      target: { value: '2026-10-30' },
    })
    await userEvent.click(c.getByRole('button', { name: 'Create route' }))
    await drop(canvasElement, 'Route 3', 'visit-2')
    await expect(
      route(canvasElement, 'Route 3').getByText('Empty template'),
    ).toBeInTheDocument()
    await expect(c.getByRole('status')).toHaveTextContent('cannot be moved')
  },
}
export const FallbackMoveReorderAndSelection: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const one = route(canvasElement, 'Route 1')
    await expect(
      one.getByRole('button', { name: 'Move Eleanor Mitchell up' }),
    ).toBeDisabled()
    await expect(
      one.getByRole('button', { name: 'Move Westbrook Commons down' }),
    ).toBeDisabled()
    await userEvent.click(
      one.getByRole('button', { name: 'Move Westbrook Commons up' }),
    )
    await expect(
      within(one.getAllByRole('listitem')[0]).getByRole('heading', {
        name: 'Westbrook Commons',
      }),
    ).toBeInTheDocument()
    await userEvent.click(
      one.getByRole('button', { name: 'Move Westbrook Commons down' }),
    )
    await userEvent.selectOptions(
      one.getByRole('combobox', { name: 'Move Eleanor Mitchell to route' }),
      'draft-crew-south-2026-10-29',
    )
    await userEvent.click(
      one.getByRole('button', {
        name: 'Move Eleanor Mitchell to selected route',
      }),
    )
    const two = route(canvasElement, 'Route 2')
    await expect(two.getByLabelText('Stop 2')).toBeInTheDocument()
    await expect(
      one.queryByRole('article', { name: 'Visit Eleanor Mitchell' }),
    ).not.toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Select Route 2' }))
    await userEvent.click(
      c.getByRole('button', { name: 'Add Oliver Bennett to route' }),
    )
    await expect(
      two.getByRole('article', { name: 'Visit Oliver Bennett' }),
    ).toBeInTheDocument()
    await userEvent.click(
      two.getByRole('button', { name: 'Remove Oliver Bennett from route' }),
    )
    await expect(
      route(canvasElement, 'Available jobs').getByRole('article', {
        name: 'Visit Oliver Bennett',
      }),
    ).toBeInTheDocument()
  },
}
export const DateSearchAndReset: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const search = c.getByRole('searchbox')
    for (const query of ['Oliver', 'Willow', 'J-1043', 'Leaf removal']) {
      await userEvent.clear(search)
      await userEvent.type(search, query)
      await expect(
        route(canvasElement, 'Available jobs').getAllByRole('article'),
      ).toHaveLength(1)
    }
    await userEvent.type(search, 'nonsense')
    await expect(c.getByText('No matching visits')).toBeInTheDocument()
    await userEvent.clear(search)
    await fireEvent.change(c.getByLabelText('Route date'), {
      target: { value: '2026-10-30' },
    })
    await expect(c.getByText('A fresh start')).toBeInTheDocument()
    await expect(c.getByText('A clear day')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Create route' }))
    await expect(
      route(canvasElement, 'Route 3').getByText('Empty template'),
    ).toBeInTheDocument()
    await fireEvent.change(c.getByLabelText('Route date'), {
      target: { value: '2026-10-29' },
    })
    await expect(
      route(canvasElement, 'Route 1').getAllByRole('listitem'),
    ).toHaveLength(2)
    await userEvent.click(c.getByRole('button', { name: 'Reset demo' }))
    await expect(
      c.queryByRole('region', { name: 'Route 3' }),
    ).not.toBeInTheDocument()
    await expect(
      c.getByRole('button', { name: 'Select Route 1' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(c.getByRole('status')).toHaveTextContent('Demo reset.')
  },
}
export const AllVisitsAssigned: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    for (const name of [
      'Oliver Bennett',
      'Maple Ridge Dental',
      'James Campbell',
    ])
      await userEvent.click(
        c.getByRole('button', { name: `Add ${name} to route` }),
      )
    await expect(c.getByText('All visits are on a route')).toBeInTheDocument()
    await expect(
      route(canvasElement, 'Route 1').getByLabelText('Stop 5'),
    ).toBeInTheDocument()
  },
}
export const EmptyDate: Story = { args: { initialDate: '2026-10-30' } }
export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 358, maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
}
