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
      <div className="flex h-124 items-center justify-center gap-2 rounded-2xl border border-dashed border-(--line-2) bg-(--paper) px-5 text-center text-sm text-(--ink-2) shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_30px_-18px_rgba(17,48,31,0.25)]">
        <MapPin className="size-4" />
        Set VITE_GOOGLE_MAPS_API_KEY to show the route map
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
      className="h-124 w-full rounded-2xl border border-(--line) shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_10px_30px_-18px_rgba(17,48,31,0.25)]"
    />
  )
}
