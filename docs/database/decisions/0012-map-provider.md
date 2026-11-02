# 0012. Map provider: OpenLayers on a swappable tile provider

- **Status**: Accepted (phase 1 of
  [maps-service-areas](https://github.com/AbsoluteCRM/CRM/pull/89)). Phase 3a
  extends this record with service areas.
- **Date**: 2026-11-02
- **Decided by**: Eric (roadmap Q7), implemented in `feat/openlayers-maps`

## Context

The calendar showed routes in a Google Maps Embed iframe keyed by
`VITE_GOOGLE_MAPS_API_KEY`, and the jobs page used a hand-drawn SVG with fake
positions. Eric asked to move to OpenLayers and to keep spatial logic
(service areas, matching addresses to crews) in PostGIS rather than calling
out to a mapping provider. The browser still needs basemap tiles from
somewhere.

## Decision

- **Rendering**: [OpenLayers](https://openlayers.org/) (`ol`), wrapped by a
  thin in-repo layer in `src/components/map/`. No React wrapper library.
  OpenLayers touches `window`, so `MapView` renders a skeleton on the server
  and lazy-loads the `OlMap` chunk after hydration; nothing else imports `ol`.
- **Coordinates**: data is WGS 84 lon/lat (EPSG:4326), the same as
  `properties.location`; only the map chunk projects to Web Mercator
  (EPSG:3857) for display.
- **Tiles**: raster XYZ from a hosted free tier, picked by config in
  `src/lib/map/providers.ts`:

  | `VITE_MAP_PROVIDER` | Tiles                                      | Key (`VITE_MAP_API_KEY`) |
  | ------------------- | ------------------------------------------ | ------------------------ |
  | `maptiler`          | MapTiler `streets-v2`                      | Required                 |
  | `stadia`            | Stadia `alidade_smooth`                    | Optional (domain auth)   |
  | `osm`               | OpenStreetMap standard tiles, **dev only** | None                     |

  Unset, the provider is `maptiler` when a key is set, `osm` in dev, and none
  in a production build (the map draws without a basemap and says so). The
  key is public, so it is restricted by HTTP origin in the provider's console.

- **Attribution** is always visible and never collapsed: OpenStreetMap
  contributors plus the provider (and OpenMapTiles for Stadia).
- **No provider calls at query time**: tiles are the only external map
  traffic. Geocoding (phase 2) runs once per address save and is stored.

## Consequences

- Switching providers, or self-hosting Protomaps PMTiles later, is a change to
  `providers.ts` and env only; no component changes.
- `VITE_GOOGLE_MAPS_API_KEY` is removed.
- Maps only work client-side; any future map screen goes through `MapView`.
- Route lines are straight segments until the optimizer (ADR 0006, roadmap
  phase 5) stores road polylines.
- Stories and tests never fetch tiles: Storybook sets the basemap to none
  through `MapBasemapProvider`, and the local tile-grid basemap is available
  for visual checks.
