/**
 * The app's map. SSR-safe: the server and the first client render show a
 * skeleton, and only after hydration is the OpenLayers chunk (`OlMap`)
 * lazy-loaded, so `ol` is never imported on the server.
 */
import { useHydrated } from '@tanstack/react-router'
import { Suspense, createContext, lazy, use } from 'react'
import type { ReactNode } from 'react'

import { cn } from '#/lib/utils'
import type { BasemapChoice, MapViewProps } from './types'

export type {
  BasemapChoice,
  MapDepot,
  MapRoute,
  MapStop,
  MapViewProps,
} from './types'

const OlMap = lazy(() => import('./OlMap'))

const BasemapContext = createContext<{ choice: BasemapChoice }>({
  choice: undefined,
})

/**
 * Overrides the env basemap for every map below it. Storybook sets `null`
 * so stories never fetch tiles.
 */
export function MapBasemapProvider({
  basemap,
  children,
}: {
  basemap: BasemapChoice
  children: ReactNode
}) {
  return <BasemapContext value={{ choice: basemap }}>{children}</BasemapContext>
}

/** Inline so the map fills its box even without stylesheets. */
const FILL = { position: 'absolute', inset: 0 } as const

function MapSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="map-skeleton"
      className="animate-pulse bg-(--sage)"
      style={FILL}
    />
  )
}

export function MapView({
  className,
  style,
  label = 'Map',
  basemap,
  stops = [],
  ...props
}: MapViewProps) {
  const hydrated = useHydrated()
  const context = use(BasemapContext)
  const choice = basemap !== undefined ? basemap : context.choice

  return (
    <div
      role="region"
      aria-label={label}
      className={cn('isolate rounded-2xl bg-(--sage)', className)}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
    >
      {hydrated ? (
        <Suspense fallback={<MapSkeleton />}>
          <OlMap {...props} stops={stops} basemap={choice} />
        </Suspense>
      ) : (
        <MapSkeleton />
      )}
      {stops.length > 0 && (
        // One text node rather than a list, so the stops aren't counted twice
        // next to the page's own stop list.
        <p className="sr-only" data-testid="map-stops">
          {`Stops on the map: ${stops.map((s) => s.title).join('; ')}`}
        </p>
      )}
    </div>
  )
}
