import { z } from 'zod'
import { env } from '#/env'

const condition = z.object({ text: z.string().min(1), code: z.number().int() })
const payload = z.object({
  location: z.object({ tz_id: z.string().min(1) }),
  current: z.object({
    temp_c: z.number(),
    wind_kph: z.number().nonnegative(),
    last_updated_epoch: z.number().int().positive(),
    condition,
  }),
  forecast: z.object({
    forecastday: z
      .array(
        z.object({
          date: z.iso.date(),
          day: z.object({
            maxtemp_c: z.number(),
            mintemp_c: z.number(),
            daily_chance_of_rain: z.number().min(0).max(100),
            daily_chance_of_snow: z.number().min(0).max(100),
            condition,
          }),
        }),
      )
      .min(1),
  }),
})

export function weatherCategory(code: number) {
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return 'thunder' as const
  if (
    [
      1066, 1069, 1072, 1114, 1117, 1147, 1168, 1171, 1198, 1201, 1204, 1207,
      1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261,
      1264,
    ].includes(code)
  )
    return 'snow' as const
  if (
    [
      1063, 1150, 1153, 1180, 1183, 1186, 1189, 1192, 1195, 1240, 1243, 1246,
    ].includes(code)
  )
    return 'rain' as const
  if (code === 1000) return 'sun' as const
  if (code === 1003) return 'partly' as const
  return 'cloud' as const
}

export function normalizeWeather(value: unknown) {
  const data = payload.parse(value)
  return {
    city: 'Calgary',
    timezone: data.location.tz_id,
    temperature: data.current.temp_c,
    wind: data.current.wind_kph,
    updatedAt: data.current.last_updated_epoch,
    condition: weatherCategory(data.current.condition.code),
    text: data.current.condition.text,
    days: data.forecast.forecastday.slice(0, 5).map(({ date, day }) => ({
      date,
      high: day.maxtemp_c,
      low: day.mintemp_c,
      precip: Math.max(day.daily_chance_of_rain, day.daily_chance_of_snow),
      condition: weatherCategory(day.condition.code),
      text: day.condition.text,
    })),
  }
}
export type WeatherForecast = ReturnType<typeof normalizeWeather>

let cached: { value: WeatherForecast; expires: number } | undefined
let pending: Promise<WeatherForecast> | undefined

export async function getWeatherForecast(): Promise<WeatherForecast> {
  if (cached && cached.expires > Date.now()) return cached.value
  if (pending) return pending
  pending = (async () => {
    try {
      if (!env.WEATHER_API_KEY) throw new Error()
      const url = new URL('https://api.weatherapi.com/v1/forecast.json')
      url.search = new URLSearchParams({
        key: env.WEATHER_API_KEY,
        q: '51.0447,-114.0719',
        days: '5',
        aqi: 'no',
        alerts: 'no',
      }).toString()
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error()
      const value = normalizeWeather(await response.json())
      cached = { value, expires: Date.now() + 600_000 }
      return value
    } catch {
      // Never attach upstream URLs, bodies or exceptions: the URL holds the key.
      throw new Error('Weather unavailable')
    }
  })()
  try {
    return await pending
  } finally {
    pending = undefined
  }
}
