import { expect, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import PageLoading from './PageLoading'

const meta = {
  title: 'Layout/PageLoading',
  component: PageLoading,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PageLoading>

export default meta
type Story = StoryObj<typeof meta>

export const App: Story = {
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole('status')
    await expect(status).toHaveTextContent('Loading…')
  },
}

export const PublicPage: Story = { args: { plain: true } }
