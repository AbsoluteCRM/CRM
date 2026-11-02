import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TRPCClientError, createTRPCClient } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { TRPCProvider } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'
import type { PortalService } from '#/server/trusted/portal'
import RequestModal from './RequestModal'

const service: PortalService = {
  id: '0198f0a0-0000-7000-8000-000000000002',
  name: 'Bi-Weekly Lawn Maintenance',
  description: null,
  unit: 'monthly',
  default_price_cents: 19998,
  default_duration_minutes: 60,
  color: '#7fb547',
  frequencies: ['biweekly'],
  season_start_month: 4,
  season_end_month: 10,
}

// A tRPC client whose link answers from memory, so stories never hit the network.
function Providers({
  children,
  submit,
}: {
  children: React.ReactNode
  submit: (input: unknown) => unknown
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
  )
  const [client] = useState(() =>
    createTRPCClient<TRPCRouter>({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              Promise.resolve()
                .then(() => submit(op.input))
                .then((data) => {
                  observer.next({ result: { type: 'data', data } })
                  observer.complete()
                })
                .catch((e) => observer.error(TRPCClientError.from(e as Error)))
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

const submit = fn((_input: unknown) => ({ id: 'req-1' }))

const meta = {
  title: 'Portal/RequestModal',
  component: RequestModal,
  args: {
    orgSlug: 'test-organization',
    orgName: 'Test Organization',
    service,
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <Providers submit={(i) => submit(i)}>
        <Story />
      </Providers>
    ),
  ],
} satisfies Meta<typeof RequestModal>

export default meta
type Story = StoryObj<typeof meta>

const body = () => within(document.body)
const reset = () => submit.mockClear()

export const AsksForContactDetailsOnly: Story = {
  play: async () => {
    reset()
    await expect(body().getByText('From $199.98 per month')).toBeVisible()
    await expect(body().getByLabelText('Your name')).toBeVisible()
    await expect(body().getByLabelText('Street address')).toBeVisible()
    await expect(body().getByLabelText('City')).toBeVisible()
    // No Geoapify key in Storybook, so the search box stays hidden.
    await expect(body().queryByLabelText('Find your address')).toBeNull()
    await expect(body().queryByLabelText('How often?')).toBeNull()
  },
}

export const ValidatesBeforeSending: Story = {
  play: async () => {
    reset()
    await userEvent.click(body().getByRole('button', { name: 'Send request' }))
    await expect(body().getByText('Enter a valid email')).toBeVisible()
    await expect(submit).not.toHaveBeenCalled()
  },
}

export const SubmitsAndConfirms: Story = {
  play: async () => {
    reset()
    await userEvent.type(body().getByLabelText('Your name'), 'Jane Doe')
    await userEvent.type(body().getByLabelText('Email'), 'Jane@Example.com')
    await userEvent.type(body().getByLabelText('Street address'), '1 Main St')
    await userEvent.type(body().getByLabelText('City'), 'Calgary')
    await userEvent.click(body().getByRole('button', { name: 'Send request' }))
    await expect(await body().findByText('Request sent')).toBeVisible()
    await expect(submit).toHaveBeenCalledTimes(1)
    await expect(submit.mock.calls[0][0]).toMatchObject({
      orgSlug: 'test-organization',
      serviceId: service.id,
      name: 'Jane Doe',
      address: '1 Main St, Calgary',
      website: '',
    })
  },
}

export const ShowsRateLimitError: Story = {
  play: async () => {
    reset()
    submit.mockImplementationOnce(() => {
      throw new Error('Too many requests. Please try again later.')
    })
    await userEvent.type(body().getByLabelText('Your name'), 'Jane Doe')
    await userEvent.type(body().getByLabelText('Email'), 'jane@example.com')
    await userEvent.type(body().getByLabelText('Street address'), '1 Main St')
    await userEvent.type(body().getByLabelText('City'), 'Calgary')
    await userEvent.click(body().getByRole('button', { name: 'Send request' }))
    await expect(
      await body().findByText('Too many requests. Please try again later.'),
    ).toBeVisible()
  },
}
