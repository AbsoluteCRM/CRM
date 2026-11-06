import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudLightning,
  Sun,
} from 'lucide-react'
import { Badge, btnClass, Card } from './ui'
import type { WeatherForecast } from '#/server/weather'
import type { Job } from '#/mocks/crm-types'

export type WeatherState = {
  data?: WeatherForecast
  isError: boolean
  retry: () => void
}
const ICON = {
  sun: Sun,
  cloud: Cloud,
  rain: CloudRain,
  snow: CloudSnow,
  partly: CloudSun,
  thunder: CloudLightning,
}
const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', {
    weekday: 'short',
    timeZone: 'UTC',
  })

export function WeatherBadge({ weather }: { weather: WeatherState }) {
  const data = weather.data
  const Icon = data ? ICON[data.condition] : Cloud
  return (
    <span className="hidden items-center gap-2 rounded-full border border-(--line) bg-(--paper) px-3 py-2 text-[13px] font-semibold text-(--ink-2) sm:inline-flex">
      <Icon className="size-4 text-(--sky)" />
      Calgary ·{' '}
      {data
        ? `${Math.round(data.temperature)}°C · ${data.text}${weather.isError ? ' · Update failed' : ''}`
        : weather.isError
          ? 'Weather unavailable'
          : 'Loading weather…'}
    </span>
  )
}

export function WeatherCard({
  weather,
  jobs,
}: {
  weather: WeatherState
  jobs: Array<Pick<Job, 'date' | 'status'>>
}) {
  const now = weather.data
  if (!now)
    return (
      <Card className="crm-rise flex flex-col p-5 lg:col-span-4">
        <p className="text-sm font-semibold">Weather · Calgary</p>
        <p role="status" className="mt-3 text-sm text-(--ink-3)">
          {weather.isError ? 'Weather unavailable' : 'Loading weather…'}
        </p>
        {weather.isError && (
          <button className={btnClass('outline', 'sm')} onClick={weather.retry}>
            Retry weather
          </button>
        )}
      </Card>
    )
  const days = now.days
  const NowIcon = ICON[now.condition]
  return (
    <Card className="crm-rise flex flex-col overflow-hidden lg:col-span-4">
      <div className="bg-gradient-to-br from-(--sky-100) to-(--paper) p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-(--sky) uppercase">
              Weather · Calgary
            </p>
            <p className="crm-display mt-2 text-5xl font-semibold">
              {Math.round(now.temperature)}°C
            </p>
            <p className="mt-1 text-sm text-(--ink-2)">
              {now.text} · Low {Math.round(days[0].low)}°C · Wind{' '}
              {Math.round(now.wind)} km/h
            </p>
          </div>
          <NowIcon className="size-14 text-(--sky)" strokeWidth={1.4} />
        </div>
        {days.length > 1 && (
          <div
            className="mt-5 grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${days.length - 1}, minmax(0, 1fr))`,
            }}
          >
            {days.slice(1).map((d) => {
              const I = ICON[d.condition]
              const alert = ['rain', 'snow', 'thunder'].includes(d.condition)
              return (
                <div
                  key={d.date}
                  className={`rounded-2xl px-2 py-2.5 text-center ${alert ? 'bg-(--paper) ring-1 ring-(--sky)/30' : 'bg-white/60'}`}
                >
                  <p className="text-[11px] font-semibold text-(--ink-3)">
                    {weekday(d.date)}
                  </p>
                  <I className="mx-auto my-1.5 size-5 text-(--sky)" />
                  <p className="text-[13px] font-bold">
                    {Math.round(d.high)}°C
                  </p>
                </div>
              )
            })}
          </div>
        )}
        {weather.isError && (
          <p role="status" className="mt-3 text-sm">
            Weather update failed. Showing the last update.{' '}
            <button className="underline" onClick={weather.retry}>
              Retry weather
            </button>
          </p>
        )}
        <p className="mt-2 text-[11px] text-(--ink-3)">
          Updated{' '}
          {new Date(now.updatedAt * 1000).toLocaleTimeString('en-CA', {
            timeZone: now.timezone,
            hour: 'numeric',
            minute: '2-digit',
          })}{' '}
          Calgary time
        </p>
      </div>
      <div className="flex flex-1 flex-col p-4">
        {days.length > 1 && (
          <>
            <p className="mb-2 text-[11px] font-bold tracking-wider text-(--ink-3) uppercase">
              Outdoor work ahead
            </p>
            <ul className="space-y-1.5">
              {days.slice(1).map((d) => {
                const I = ICON[d.condition]
                const count = jobs.filter(
                  (j) =>
                    j.date === d.date &&
                    (j.status === 'assigned' || j.status === 'scheduled'),
                ).length
                const alert = ['rain', 'snow', 'thunder'].includes(d.condition)
                return (
                  <li
                    key={d.date}
                    className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] hover:bg-(--cream)"
                  >
                    <I className="size-4 shrink-0 text-(--sky)" />
                    <span className="w-10 font-semibold">
                      {weekday(d.date)}
                    </span>
                    <span className="w-12 text-xs text-(--ink-3)">
                      {d.precip}%
                    </span>
                    <span className="flex-1 text-(--ink-2)">
                      {count} job{count === 1 ? '' : 's'}
                    </span>
                    {alert && count > 0 && (
                      <Badge tone="sky">
                        {d.condition === 'snow'
                          ? 'Offer snow removal'
                          : 'Review lawn jobs'}
                      </Badge>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
        <Link
          to="/calendar"
          className="mt-auto inline-flex items-center gap-1 pt-3 text-[13px] font-semibold text-(--leaf-700) no-underline"
        >
          Open calendar <ArrowRight className="size-3.5" />
        </Link>
        <a
          className="mt-3 text-[11px] text-(--ink-3) underline"
          href="https://www.weatherapi.com/"
          target="_blank"
          rel="noreferrer"
        >
          Weather data by WeatherAPI.com
        </a>
      </div>
    </Card>
  )
}
