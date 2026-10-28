import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const config = vi.hoisted<{ WEATHER_API_KEY: string | undefined }>(() => ({
  WEATHER_API_KEY: 'secret-weather-key',
}))
vi.mock('#/env', () => ({ env: config }))
const fixture = () => ({
  location: { tz_id: 'America/Edmonton' },
  current: {
    temp_c: 7.2,
    wind_kph: 12.3,
    last_updated_epoch: 1793185200,
    condition: { code: 1003, text: 'Partly cloudy' },
  },
  forecast: {
    forecastday: [0, 1, 2].map((n) => ({
      date: `2026-10-${28 + n}`,
      day: {
        maxtemp_c: 13 + n,
        mintemp_c: -1,
        daily_chance_of_rain: 30,
        daily_chance_of_snow: 70,
        condition: { code: 1069, text: 'Patchy sleet possible' },
      },
    })),
  },
})
const fetchMock = vi.fn()
beforeEach(() => {
  vi.resetModules()
  config.WEATHER_API_KEY = 'secret-weather-key'
  vi.stubGlobal('fetch', fetchMock)
  fetchMock
    .mockReset()
    .mockResolvedValue({ ok: true, json: async () => fixture() })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Calgary weather', () => {
  it('normalizes metric current readings, provider dates and available daily highs', async () => {
    const { getWeatherForecast } = await import('./weather')
    const result = await getWeatherForecast()
    expect(result).toMatchObject({
      city: 'Calgary',
      temperature: 7.2,
      wind: 12.3,
      timezone: 'America/Edmonton',
      text: 'Partly cloudy',
    })
    expect(result.days).toHaveLength(3)
    expect(result.days[0]).toMatchObject({
      date: '2026-10-28',
      high: 13,
      low: -1,
      precip: 70,
      condition: 'snow',
    })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url.origin + url.pathname).toBe(
      'https://api.weatherapi.com/v1/forecast.json',
    )
    expect(url.searchParams.get('q')).toBe('51.0447,-114.0719')
    expect(url.searchParams.get('days')).toBe('5')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })
  it('categorizes thunder, mixed precipitation and unknown conditions safely', async () => {
    const { weatherCategory } = await import('./weather')
    expect(weatherCategory(1279)).toBe('thunder')
    expect(weatherCategory(1204)).toBe('snow')
    expect(weatherCategory(1243)).toBe('rain')
    expect(weatherCategory(1000)).toBe('sun')
    expect(weatherCategory(9999)).toBe('cloud')
  })
  it('deduplicates concurrent calls, caches successes for ten minutes and refreshes expired data', async () => {
    vi.useFakeTimers()
    const { getWeatherForecast } = await import('./weather')
    await Promise.all([getWeatherForecast(), getWeatherForecast()])
    await getWeatherForecast()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(600_001)
    await getWeatherForecast()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('does not silently serve expired cache after refresh failure', async () => {
    vi.useFakeTimers()
    const { getWeatherForecast } = await import('./weather')
    await getWeatherForecast()
    vi.advanceTimersByTime(600_001)
    fetchMock.mockRejectedValueOnce(new Error('secret-weather-key'))
    await expect(getWeatherForecast()).rejects.toThrow('Weather unavailable')
    await expect(getWeatherForecast()).resolves.toMatchObject({
      temperature: 7.2,
    })
  })
  it.each([401, 403, 429, 500])(
    'sanitizes upstream status %s and recovers',
    async (status) => {
      const { getWeatherForecast } = await import('./weather')
      fetchMock.mockResolvedValueOnce({ ok: false, status })
      await expect(getWeatherForecast()).rejects.toEqual(
        new Error('Weather unavailable'),
      )
      await expect(getWeatherForecast()).resolves.toHaveProperty(
        'city',
        'Calgary',
      )
    },
  )
  it('does not fetch without a key', async () => {
    config.WEATHER_API_KEY = undefined
    const { getWeatherForecast } = await import('./weather')
    await expect(getWeatherForecast()).rejects.toEqual(
      new Error('Weather unavailable'),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([{}, { ...fixture(), forecast: { forecastday: [] } }])(
    'rejects malformed or empty forecast',
    async (value) => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => value })
      const { getWeatherForecast } = await import('./weather')
      await expect(getWeatherForecast()).rejects.toEqual(
        new Error('Weather unavailable'),
      )
    },
  )
  it('aborts after eight seconds and replaces raw exceptions without a cause', async () => {
    vi.useFakeTimers()
    const signal = new AbortController()
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) => {
        setTimeout(() => signal.abort(), ms)
        return signal.signal
      })
    fetchMock.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options.signal.addEventListener('abort', () =>
            reject(
              new Error('https://api.weatherapi.com?key=secret-weather-key'),
            ),
          ),
        ),
    )
    const { getWeatherForecast } = await import('./weather')
    const request = expect(getWeatherForecast()).rejects.toEqual(
      new Error('Weather unavailable'),
    )
    await vi.advanceTimersByTimeAsync(8000)
    await request
    expect(timeout).toHaveBeenCalledWith(8000)
    timeout.mockRestore()
  })
})
