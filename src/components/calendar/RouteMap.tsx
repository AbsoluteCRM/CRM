import { MapView } from '#/components/map/MapView'
import type { BasemapChoice, MapStop } from '#/components/map/MapView'
import { UnplacedStops } from '#/components/map/UnplacedStops'
import { fmtTime } from '#/components/crm/format'
import type { LonLat } from '#/lib/map/geo'
import type { RouteStop } from './mock-routes'

const DEFAULT_COLOR = '#2f7350'

/**
 * The selected day's route: numbered stops in driving order, joined by
 * straight legs from (and back to) the yard when one is given. Stops without
 * a location are listed under the map.
 */
export function RouteMap({
  stops,
  depot,
  basemap,
}: {
  stops: Array<RouteStop>
  depot?: LonLat | null
  basemap?: BasemapChoice
}) {
  if (stops.length === 0) {
    return null
  }

  const color = stops[0].crew?.color ?? DEFAULT_COLOR
  const numbered = stops.map((s, i) => ({ s, n: i + 1 }))
  const placed = numbered.filter(({ s }) => s.location)
  const unplaced = numbered.filter(({ s }) => !s.location)

  const mapStops: Array<MapStop> = placed.map(({ s, n }) => ({
    id: s.id,
    position: s.location!,
    label: String(n),
    title: `${n}. ${s.customer}, ${fmtTime(s.time)}, ${s.address}`,
    color: s.crew?.color ?? color,
    muted: s.status === 'completed',
  }))
  const path = [
    ...(depot ? [depot] : []),
    ...placed.map(({ s }) => s.location!),
    ...(depot ? [depot] : []),
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      <MapView
        label="Route map"
        className="w-full flex-1 rounded-[22px] border border-(--line)"
        style={{ minHeight: 320 }}
        stops={mapStops}
        route={{ path, color }}
        depot={depot ? { position: depot, title: 'Yard' } : undefined}
        basemap={basemap}
      />
      <UnplacedStops
        stops={unplaced.map(({ s, n }) => ({
          id: s.id,
          label: String(n),
          title: s.customer,
          detail: s.address,
        }))}
      />
    </div>
  )
}
