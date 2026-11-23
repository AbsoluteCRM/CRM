import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TRPCClientError, createTRPCClient } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { expect, fn, userEvent, within } from 'storybook/test'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { TRPCProvider } from '#/integrations/trpc/react'
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_PALETTE,
} from '#/integrations/settings/schema'
import type { TRPCRouter } from '#/integrations/trpc/router'
import type { Portal } from '#/server/trusted/portal'
import PortalView from './PortalView'

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

const portal: Portal = {
  organization_name: 'Greenline Landscaping',
  accepting: true,
  brand_color: '#2f7350',
  palette: DEFAULT_PALETTE,
  logo_url: null,
  tagline: 'Lawn care and landscaping across northwest Calgary',
  mission:
    'Healthy, low-water yards that families actually use, cared for by a crew that shows up when we say we will.',
  about:
    'Family-run since 2014. Fully insured, WCB covered, and every crew lead is a certified horticulturist.',
  timezone: 'America/Edmonton',
  contact: {
    email: 'hello@greenline.test',
    phone: '403-555-0142',
    address: '120 Crowfoot Way NW · Calgary, AB · T3G 2R2',
  },
  business_hours: DEFAULT_BUSINESS_HOURS,
  service_areas: ['Tuscany', 'Rocky Ridge', 'Royal Oak', 'Arbour Lake'],
  embed: { enabled: true, compact: false },
  services: [
    {
      id: '0198f0a0-0000-7000-8000-000000000002',
      name: 'Bi-Weekly Lawn Maintenance',
      description: 'Mow, trim, edge, and blow, every second week.',
      unit: 'monthly',
      default_price_cents: 19998,
      default_duration_minutes: 60,
      color: '#7fb547',
      frequencies: ['biweekly'],
      season_start_month: 4,
      season_end_month: 10,
    },
    {
      id: '0198f0a0-0000-7000-8000-000000000003',
      name: 'Spring Cleanup',
      description: 'Rake, dethatch, and haul away winter debris.',
      unit: 'visit',
      default_price_cents: 34900,
      default_duration_minutes: 180,
      color: '#3f7fa8',
      frequencies: ['one_time'],
      season_start_month: 3,
      season_end_month: 5,
    },
    {
      id: '0198f0a0-0000-7000-8000-000000000004',
      name: 'Snow Removal',
      description: null,
      unit: 'visit',
      default_price_cents: 6500,
      default_duration_minutes: 30,
      color: '#7d5ba6',
      frequencies: ['one_time', 'weekly'],
      season_start_month: 11,
      season_end_month: 3,
    },
  ],
}

const submit = fn((_input: unknown) => ({ id: 'req-1' }))

const meta = {
  title: 'Portal/PortalView',
  component: PortalView,
  parameters: { layout: 'fullscreen' },
  args: { orgSlug: 'greenline', portal, month: 5 },
  decorators: [
    (Story) => (
      <Providers submit={(i) => submit(i)}>
        <Story />
      </Providers>
    ),
  ],
} satisfies Meta<typeof PortalView>

export default meta
type Story = StoryObj<typeof meta>

const page = () => within(document.body)

export const FullPage: Story = {
  play: async () => {
    await expect(
      page().getByRole('heading', {
        level: 1,
        name: 'Lawn care and landscaping across northwest Calgary',
      }),
    ).toBeVisible()
    await expect(page().getByText(/Healthy, low-water yards/)).toBeVisible()
    await expect(page().getByText('Areas we serve')).toBeVisible()
    await expect(page().getAllByText('(403) 555-0142').length).toBeGreaterThan(
      0,
    )
    await expect(page().getByText('$199.98')).toBeVisible()
  },
}

export const ScrollsToServices: Story = {
  play: async () => {
    await expect(
      page().getByRole('button', { name: 'Request an estimate' }),
    ).toBeVisible()
    // About comes before Services.
    const about = page().getByRole('heading', { name: 'About us' })
    const services = page().getByRole('heading', { name: 'Services' })
    await expect(
      about.compareDocumentPosition(services) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  },
}

export const CustomPalette: Story = {
  args: {
    portal: {
      ...portal,
      palette: { primary: '#f2e8c9', secondary: '#15324a', accent: '#c2582f' },
    },
  },
  play: async () => {
    // Light primary and accent get dark text; dark secondary gets a white heading.
    await expect(page().getByRole('banner')).toHaveStyle({
      color: 'rgb(19, 36, 26)',
    })
    await expect(page().getByRole('heading', { level: 1 })).toHaveStyle({
      color: 'rgb(255, 255, 255)',
    })
  },
}

export const OpensTheRequestForm: Story = {
  play: async () => {
    submit.mockClear()
    await userEvent.click(
      page().getByRole('button', { name: 'Request Spring Cleanup' }),
    )
    await expect(
      await page().findByText('Request Spring Cleanup'),
    ).toBeVisible()
    await userEvent.type(page().getByLabelText('Your name'), 'Jane Doe')
    await userEvent.type(page().getByLabelText('Email'), 'jane@example.com')
    await userEvent.type(page().getByLabelText('Street address'), '1 Main St')
    await userEvent.type(page().getByLabelText('City'), 'Calgary')
    await userEvent.click(page().getByRole('button', { name: 'Send request' }))
    await expect(await page().findByText('Request sent')).toBeVisible()
    await expect(submit.mock.calls[0][0]).toMatchObject({
      orgSlug: 'greenline',
      serviceId: '0198f0a0-0000-7000-8000-000000000003',
    })
  },
}

export const PricesAndDetailsHidden: Story = {
  args: {
    portal: {
      ...portal,
      mission: null,
      about: null,
      contact: null,
      business_hours: null,
      service_areas: null,
      services: portal.services.map((s) => ({
        ...s,
        default_price_cents: null,
      })),
    },
  },
  play: async () => {
    await expect(page().getAllByText('Free estimate')).toHaveLength(3)
    await expect(page().queryByText('$199.98')).toBeNull()
    await expect(page().queryByText(/Healthy, low-water yards/)).toBeNull()
    await expect(page().queryByText('Contact')).toBeNull()
  },
}

export const RequestsPaused: Story = {
  args: { portal: { ...portal, accepting: false, services: [] } },
  play: async () => {
    await expect(page().getByText('Online requests are paused')).toBeVisible()
    await expect(page().queryByRole('button', { name: /^Request / })).toBeNull()
    await expect(
      page().getAllByText('hello@greenline.test').length,
    ).toBeGreaterThan(0)
  },
}

export const EmbeddedCompact: Story = {
  args: {
    embed: true,
    portal: { ...portal, embed: { enabled: true, compact: true } },
  },
  play: async () => {
    await expect(page().queryByRole('heading', { level: 1 })).toBeNull()
    await expect(page().queryByText(/Healthy, low-water yards/)).toBeNull()
    await expect(
      page().getAllByRole('button', { name: /^Request / }),
    ).toHaveLength(3)
  },
}

export const EmbeddingTurnedOff: Story = {
  args: {
    embed: true,
    portal: { ...portal, embed: { enabled: false, compact: false } },
  },
  play: async () => {
    const link = page().getByRole('link', { name: 'Open request page' })
    await expect(link).toHaveAttribute('href', '/portal/greenline')
    await expect(page().queryByRole('button', { name: /^Request / })).toBeNull()
  },
}
