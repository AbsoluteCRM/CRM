import { MapPin } from 'lucide-react'

import { env } from '#/env'
import type { RouteStop } from './mock-routes'

export function RouteMap({
  stops,
  apiKey = env.VITE_GOOGLE_MAPS_API_KEY,
}: {
  stops: Array<RouteStop>
  apiKey?: string
}) {
  if (stops.length === 0) {
    return null
  }

  if (!apiKey) {
    return (
      <div className="crm-leaf-pattern flex h-full min-h-80 flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-(--line-2) bg-(--sage) p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-(--paper) text-(--leaf-700) shadow-sm">
          <MapPin className="size-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-(--ink)">
            Route map unavailable
          </p>
          <p className="mt-1 max-w-xs text-xs text-(--ink-3)">
            Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to <code>.env.local</code>{' '}
            to show this route on Google Maps.
          </p>
        </div>
      </div>
    )
  }

  const addresses = stops.map((stop) => stop.address)
  const params = new URLSearchParams({ key: apiKey })
  let mode: 'place' | 'directions'

  if (addresses.length === 1) {
    mode = 'place'
    params.set('q', addresses[0])
  } else {
    mode = 'directions'
    params.set('origin', addresses[0])
    params.set('destination', addresses[addresses.length - 1])
    const waypoints = addresses.slice(1, -1)
    if (waypoints.length > 0) {
      params.set('waypoints', waypoints.join('|'))
    }
  }

  const src = `https://www.google.com/maps/embed/v1/${mode}?${params.toString()}`
  return (
    <iframe
      title="Route map"
      src={src}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
      className="h-full min-h-80 w-full rounded-[22px] border border-(--line) bg-(--sage)"
    />
  )
}
