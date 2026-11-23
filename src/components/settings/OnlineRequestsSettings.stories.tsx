import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { DEFAULT_ONLINE_REQUESTS } from '#/integrations/settings/schema'
import OnlineRequestsSettings from './OnlineRequestsSettings'

const onSave = fn((_patch: unknown) => Promise.resolve(true))

const meta = {
  title: 'Settings/OnlineRequestsSettings',
  component: OnlineRequestsSettings,
  args: {
    orgName: 'Greenline Landscaping',
    slug: 'greenline',
    brandColor: '#2f7350',
    settings: {
      ...DEFAULT_ONLINE_REQUESTS,
      mission: 'Healthy, low-water yards.',
    },
    pageUrl: 'https://app.test/portal/greenline',
    embedUrl: 'https://app.test/portal/greenline?embed=true',
    saving: false,
    onSave: (patch) => onSave(patch),
  },
} satisfies Meta<typeof OnlineRequestsSettings>

export default meta
type Story = StoryObj<typeof meta>

const snippet = (canvas: ReturnType<typeof within>) =>
  (canvas.getByLabelText('Snippet') as HTMLTextAreaElement).value

export const ShowsLinkQrAndSnippet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Your link')).toHaveValue(
      'https://app.test/portal/greenline',
    )
    await expect(
      await canvas.findByAltText(
        'QR code that opens https://app.test/portal/greenline',
      ),
    ).toBeVisible()
    await expect(snippet(canvas)).toContain(
      'src="https://app.test/portal/greenline?embed=true"',
    )
    await expect(snippet(canvas)).toContain('height="900"')
  },
}

export const PausesRequests: Story = {
  play: async ({ canvasElement }) => {
    onSave.mockClear()
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('switch', { name: 'Accept online requests' }),
    )
    await expect(onSave).toHaveBeenCalledWith({ enabled: false })
  },
}

export const SwitchesEmbedToButton: Story = {
  play: async ({ canvasElement }) => {
    onSave.mockClear()
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'Button' }))
    await expect(onSave).toHaveBeenCalledWith({ embed: { style: 'button' } })
    await expect(snippet(canvas)).toContain(
      'href="https://app.test/portal/greenline"',
    )
    await expect(snippet(canvas)).toContain('Request a quote</a>')
  },
}

export const SavesPageContent: Story = {
  play: async ({ canvasElement }) => {
    onSave.mockClear()
    const canvas = within(canvasElement)
    const save = canvas.getByRole('button', { name: 'Save page' })
    await expect(save).toBeDisabled()
    await userEvent.type(canvas.getByLabelText('Tagline'), 'Lawns done right')
    await userEvent.click(
      canvas.getByRole('switch', { name: 'Show service prices' }),
    )
    await userEvent.click(save)
    await expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        tagline: 'Lawns done right',
        show_prices: false,
        mission: 'Healthy, low-water yards.',
      }),
    )
  },
}
