import { MapView } from '#/components/map/MapView'
import type { BasemapChoice, MapStop } from '#/components/map/MapView'
import { UnplacedStops } from '#/components/map/UnplacedStops'
import { cn } from '#/lib/utils'
import type { LonLat } from '#/lib/map/geo'
import { fmtTime } from './format'
import { DEPOT, depotLonLat, driveMinutes } from './route'
import type { RouteStop } from './route'

/**
 * A crew's day on the map: the yard, numbered stops at each property's
 * location, and straight legs between them (road routes come with the
 * optimizer, ADR 0006). Stops whose property has no location are listed
 * underneath instead.
 */
export default function RouteMap({
  stops,
  color = '#2f7350',
  activeJobId,
  onSelect,
  className,
  showLegs = true,
  depot,
  basemap,
}: {
  stops: Array<RouteStop>
  color?: string
  activeJobId?: string | null
  onSelect?: (jobId: string) => void
  className?: string
  showLegs?: boolean
  /** The yard; defaults to the demo yard in the stops' city. */
  depot?: LonLat | null
  basemap?: BasemapChoice
}) {
  const yard =
    depot === undefined
      ? depotLonLat(stops.at(0)?.property.city ?? 'Calgary')
      : depot

  const numbered = stops.map((s, i) => ({ s, n: i + 1 }))
  const placed = numbered.filter(({ s }) => s.property.location)
  const unplaced = numbered.filter(({ s }) => !s.property.location)

  const mapStops: Array<MapStop> = placed.map(({ s, n }) => ({
    id: s.job.id,
    position: s.property.location!,
    label: String(n),
    title: `${n}. ${s.property.address_line1}, ETA ${fmtTime(s.eta)}`,
    color,
    muted: s.job.status === 'completed',
  }))

  // Legs between consecutive placed points, starting and ending at the yard.
  const path = [
    ...(yard ? [{ pos: yard, grid: DEPOT }] : []),
    ...placed.map(({ s }) => ({ pos: s.property.location!, grid: s.property })),
    ...(yard ? [{ pos: yard, grid: DEPOT }] : []),
  ]
  const legLabels = showLegs
    ? path
        .slice(1)
        .map((p, i) =>
          yard && i === path.length - 2
            ? ''
            : `${driveMinutes(path[i].grid, p.grid)}m`,
        )
    : undefined

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <MapView
        label="Route map"
        className="w-full"
        style={{ aspectRatio: '16 / 10' }}
        stops={mapStops}
        route={{ path: path.map((p) => p.pos), color, legLabels }}
        depot={yard ? { position: yard, title: 'Yard' } : undefined}
        activeStopId={activeJobId}
        onSelectStop={onSelect}
        basemap={basemap}
      />
      <UnplacedStops
        stops={unplaced.map(({ s, n }) => ({
          id: s.job.id,
          label: String(n),
          title: s.property.address_line1,
          detail: `ETA ${fmtTime(s.eta)}`,
        }))}
      />
    </div>
  )
}
