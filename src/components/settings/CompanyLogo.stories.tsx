import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import CompanyLogo from './CompanyLogo'

const meta = {
  title: 'Settings/CompanyLogo',
  component: CompanyLogo,
  args: {
    name: 'Acme Lawn',
    brand: '#2f7350',
    logoUrl: null,
    hasLogo: false,
    upload: fn(async (_file: File) => true),
    remove: fn(async () => true),
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320, padding: 20 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompanyLogo>
export default meta
type Story = StoryObj<typeof meta>

export const SelectReplaceRemove: Story = {
  render: (args) => {
    const [hasLogo, setHasLogo] = useState(false)
    return (
      <CompanyLogo
        {...args}
        hasLogo={hasLogo}
        upload={async (file) => {
          await args.upload(file)
          setHasLogo(true)
          return true
        }}
        remove={async () => {
          await args.remove()
          setHasLogo(false)
          return true
        }}
      />
    )
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Company logo file')
    const file = new File(['png'], 'logo.png', { type: 'image/png' })
    await userEvent.upload(input, file)
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Remove' })).toBeEnabled(),
    )
    await userEvent.upload(input, file)
    await waitFor(() => expect(args.upload).toHaveBeenCalledTimes(2))
    await userEvent.click(canvas.getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(canvas.queryByRole('button', { name: 'Remove' })).toBeNull(),
    )
    await expect(args.remove).toHaveBeenCalled()
  },
}
export const ValidationAndRetry: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.upload(
      canvas.getByLabelText('Company logo file'),
      new File([], 'empty.png', { type: 'image/png' }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent('nonempty')
    await userEvent.upload(
      canvas.getByLabelText('Company logo file'),
      new File(['png'], 'logo.png', { type: 'image/png' }),
    )
    await waitFor(() => expect(canvas.queryByRole('alert')).toBeNull())
    await expect(args.upload).toHaveBeenCalled()
  },
}
export const Failure: Story = {
  args: {
    upload: fn(async (_file: File): Promise<boolean> => {
      throw new Error('Couldn’t upload the logo. Please try again.')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.upload(
      canvas.getByLabelText('Company logo file'),
      new File(['png'], 'logo.png', { type: 'image/png' }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Please try again',
    )
    await expect(
      canvas.getByRole('button', { name: 'Upload logo' }),
    ).toBeEnabled()
  },
}
export const BusyActions: Story = {
  args: {
    hasLogo: true,
    upload: fn((_file: File) => new Promise<boolean>(() => {})),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.upload(
      canvas.getByLabelText('Company logo file'),
      new File(['png'], 'logo.png', { type: 'image/png' }),
    )
    await expect(
      canvas.getByRole('button', { name: 'Updating…' }),
    ).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Remove' })).toBeDisabled()
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Updating company logo',
    )
  },
}
