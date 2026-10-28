import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { expect, fn, userEvent, within } from 'storybook/test'
import { WeatherBadge, WeatherCard } from './DashboardWeather'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { WeatherForecast } from '#/server/weather'
import type { WeatherState } from './DashboardWeather'
import '#/styles.css'

const data: WeatherForecast = {
  city: 'Calgary',
  timezone: 'America/Edmonton',
  temperature: 7,
  wind: 12,
  updatedAt: 1793185200,
  condition: 'partly',
  text: 'Partly cloudy',
  days: [
    {
      date: '2026-10-28',
      high: 13,
      low: -1,
      precip: 10,
      condition: 'partly',
      text: 'Partly cloudy',
    },
    {
      date: '2026-10-29',
      high: 9,
      low: 0,
      precip: 80,
      condition: 'rain',
      text: 'Rain',
    },
    {
      date: '2026-10-30',
      high: 2,
      low: -4,
      precip: 90,
      condition: 'snow',
      text: 'Snow',
    },
    {
      date: '2026-10-31',
      high: 4,
      low: -2,
      precip: 10,
      condition: 'cloud',
      text: 'Cloudy',
    },
    {
      date: '2026-11-01',
      high: 8,
      low: -1,
      precip: 0,
      condition: 'sun',
      text: 'Sunny',
    },
  ],
}
function Preview({ weather }: { weather: WeatherState }) {
  const root = createRootRoute({
    component: () => (
      <div className="crm-app max-w-md space-y-4 p-5">
        <WeatherBadge weather={weather} />
        <WeatherCard
          weather={weather}
          jobs={[
            { date: '2026-10-29', status: 'scheduled' },
            { date: '2026-10-30', status: 'assigned' },
            { date: '2026-10-30', status: 'cancelled' },
          ]}
        />
      </div>
    ),
  })
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return <RouterProvider router={router} />
}
const meta = {
  title: 'Dashboard/Weather',
  component: Preview,
  args: { weather: { data, isError: false, retry: fn() } },
} satisfies Meta<typeof Preview>
export default meta
type Story = StoryObj<typeof meta>
export const Populated: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await expect(await c.findByText('Weather · Calgary')).toBeInTheDocument()
    await expect(c.getByText('7°C')).toBeInTheDocument()
    await expect(c.getByText('Review lawn jobs')).toBeInTheDocument()
    await expect(c.getByText('Offer snow removal')).toBeInTheDocument()
    await expect(c.getAllByText('1 job')).toHaveLength(2)
    await expect(c.getAllByRole('listitem')).toHaveLength(4)
    await expect(c.getByText('80%')).toBeInTheDocument()
    await expect(
      c.getByRole('link', { name: /Open calendar/ }),
    ).toHaveAttribute('href', '/calendar')
  },
}
export const Loading: Story = {
  args: { weather: { isError: false, retry: fn() } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('status'),
    ).toHaveTextContent('Loading weather…')
  },
}
export const ShortForecast: Story = {
  args: {
    weather: {
      data: { ...data, days: data.days.slice(0, 2) },
      isError: false,
      retry: fn(),
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('Weather · Calgary')
    await expect(c.getAllByRole('listitem')).toHaveLength(1)
    await expect(c.queryByText('Offer snow removal')).not.toBeInTheDocument()
    await expect(c.getAllByText('Thu')).toHaveLength(2)
  },
}
export const TodayOnly: Story = {
  args: {
    weather: {
      data: { ...data, days: data.days.slice(0, 1) },
      isError: false,
      retry: fn(),
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByText('Weather · Calgary')
    await expect(c.queryByText('Outdoor work ahead')).not.toBeInTheDocument()
    await expect(c.queryByRole('list')).not.toBeInTheDocument()
  },
}
export const Unavailable: Story = {
  args: { weather: { isError: true, retry: fn() } },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('status')).toHaveTextContent(
      'Weather unavailable',
    )
    await userEvent.click(c.getByRole('button', { name: 'Retry weather' }))
    await expect(args.weather.retry).toHaveBeenCalledOnce()
  },
}
export const RefreshFailed: Story = {
  args: { weather: { data, isError: true, retry: fn() } },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement)
    await expect(await c.findByRole('status')).toHaveTextContent(
      'Weather update failed. Showing the last update.',
    )
    await expect(c.getByText(/Update failed/)).toBeInTheDocument()
    await expect(c.getByText('7°C')).toBeInTheDocument()
    await userEvent.click(c.getByRole('button', { name: 'Retry weather' }))
    await expect(args.weather.retry).toHaveBeenCalledOnce()
  },
}
