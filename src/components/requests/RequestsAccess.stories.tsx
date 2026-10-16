import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTRPCClient } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { expect, fn, within } from 'storybook/test'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { NoAccess } from '#/components/crm/ui'
import { useRequests } from '#/integrations/requests/requests'
import { TRPCProvider } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'

const operations = fn()

function MockProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [client] = useState(() =>
    createTRPCClient<TRPCRouter>({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              operations(op.path)
              observer.next({ result: { type: 'data', data: [] } })
              observer.complete()
            }),
      ],
    }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}

function WorkerAccess() {
  useRequests('0198f0a0-0000-7000-8000-000000000001', false)
  return <NoAccess section="Requests" />
}

const meta = {
  title: 'Requests/Access',
  component: WorkerAccess,
  decorators: [
    (Story) => (
      <MockProviders>
        <Story />
      </MockProviders>
    ),
  ],
} satisfies Meta<typeof WorkerAccess>

export default meta
type Story = StoryObj<typeof meta>

export const WorkerDoesNotLoadRequests: Story = {
  play: async ({ canvasElement }) => {
    operations.mockClear()
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Requests is limited to managers'),
    ).toBeVisible()
    await expect(operations).not.toHaveBeenCalled()
  },
}
