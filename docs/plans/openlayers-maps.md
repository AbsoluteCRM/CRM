# Plan: OpenLayers maps

- **Slug / branch**: `openlayers-maps` / `feat/openlayers-maps`
- **Tier**: full (new dependency, env change, and UI across the calendar, the
  jobs page, and the job drawer)
- **Status**: implemented
- **Confidence**: 96%, because the provider, the wrapper, the screens to
  replace, and the env change come from Eric's roadmap decisions (Q7 and the
  phase 1 row). The remaining choices are the minor defaults listed below.
- **Plan-mode file**: none. This is phase 1 of the approved roadmap
  [`maps-service-areas`](https://github.com/AbsoluteCRM/CRM/pull/89)
  (`docs/plans/maps-service-areas.md` on that PR's branch). Eric approved the
  roadmap and the start of implementation on 2026-11-02; that approval covers
  the question rounds and the audit for this phase.

## Original request

> Instead of Google maps, let's look at openlayers. We also want to be able to
> take a city and draw polygons for our various teams "service area" a team
> will automatically get routes within this polygon. Let's look at postgis so
> we don't have to call out to Google or openstreetmaps or whoever we make our
> mapping provider. Plan this out thoroughly before implementing.

## Goal

Replace both stand-in maps with real OpenLayers maps on a swappable hosted
basemap. The calendar's selected-day route (today a Google Maps Embed iframe
that needs `VITE_GOOGLE_MAPS_API_KEY`) and the jobs page and job drawer route
map (today a hand-drawn SVG with fake 0–100 positions) both show numbered stops
at real lon/lat, the yard, and the route line on map tiles. The wrapper in
`src/components/map/` is the base that phase 3b (service area editor) and
phase 4 (Route Builder) build on. Service areas, geocoding, and schema are
other phases.

## Decisions

From the roadmap (Eric, 2026-11-02):

| #   | Question        | Answer (user's words or a faithful summary)                                                                                              |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R0  | Mapping library | OpenLayers instead of Google Maps.                                                                                                       |
| Q7  | Tiles / hosting | Hosted free tier first, self-host if better. `VITE_MAP_PROVIDER` defaults to a hosted free tier, and OSM is allowed only in dev.         |
| P1  | Phase 1 scope   | `ol`, map components, provider config and env, replace the Google iframe and the fake SVG map, drop `VITE_GOOGLE_MAPS_API_KEY`, stories. |

Agent defaults (minor; Eric may veto them):

- **D1**: Provider resolution. `VITE_MAP_PROVIDER` picks `maptiler`, `stadia`,
  or `osm`. Unset, it is `maptiler` when `VITE_MAP_API_KEY` is set, `osm` in
  dev, and no basemap in a production build. MapTiler without a key, or OSM
  outside dev, renders no basemap and a small "Basemap not configured" note,
  never a broken tile grid. Stadia works without a key (it supports domain
  auth), so the key is optional there.
- **D2**: Raster XYZ tiles: MapTiler `streets-v2` (512 px), Stadia
  `alidade_smooth`, OSM standard. The attribution control is never collapsed,
  and always credits OpenStreetMap contributors plus the provider.
- **D3**: Stops and the yard are canvas vector features (numbered circles in
  the crew colour, the active stop with a lime ring, completed stops faded,
  the yard as the leaf-900 tile with the lime warehouse glyph), so they match
  the old SVG pins. A visually hidden list names every stop for screen
  readers; keyboard selection stays with the stop lists that sit beside every
  map today.
- **D4**: Demo data gets real coordinates by mapping each seeded property's
  existing 0–100 `x`/`y` into its org city's bounding box (Calgary for
  GreenLeaf, Edmonton for Northline). The random sequence is unchanged, so
  every other seeded value stays the same, and the straight-line drive
  estimates stay consistent with where pins land. The yard uses the same
  mapping of `DEPOT`. Calendar mock customers get hand-picked Calgary
  coordinates for their real addresses.
- **D5**: A property created in the demo store (Add client) has no
  coordinates until phase 2 geocodes on save, so its stops are listed under
  the map as "Not on the map".
- **D6**: Stories never hit the network: a Storybook decorator sets the map
  basemap to none, and one story uses OpenLayers' local tile-grid source.
- **D7**: Wheel zoom and drag pan stay on (OpenLayers defaults); rotation is
  turned off.
- **D8**: The decision is recorded as ADR 0014, `0014-map-provider.md`
  (0012 is the service areas ADR and 0013 the geocoding ADR, from the parallel
  phases). It is separate from the service areas ADR, and cross-links to it.

## Open questions

- None that change the outcome. Which hosted provider to sign up for is Eric's
  call at deploy time; both are supported by config alone.

## Assumptions

| Assumption                                                                         | User-confirmed?        |
| ---------------------------------------------------------------------------------- | ---------------------- |
| Raster tiles are enough for phase 1 (vector tiles and Protomaps are a later swap)  | yes (roadmap Q7)       |
| Straight segments between stops are acceptable until phase 5 adds road polylines   | yes (roadmap phases)   |
| Deriving demo coordinates from the old 0–100 positions is acceptable for mock data | no; minor default (D4) |
| The calendar map shows the org yard too (the Google embed did not)                 | no; minor default      |

## Design refs

- Mock: none. The pins and the yard copy the current
  `src/components/crm/RouteMap.tsx`; the tiles come from the provider.
- Screens: `docs/calendar/ui.md` (Calendar: map states and interactions) and a
  new `docs/jobs/ui.md` (Jobs route view and the job drawer's Route tab).

## Layers touched

- [ ] Migration: none
- [ ] RLS policies / pgTAP tests: none
- [x] `docs/database`: ADR 0014 only (no tables)
- [ ] Types (`pnpm db:types`): none
- [ ] Middleware: none
- [ ] tRPC procedures: none
- [x] Routes / loaders (`_authed/calendar.tsx`, `_authed/jobs.tsx` props only)
- [x] UI components
- [x] Stories
- [x] Tests (unit test for provider resolution, story interaction tests)
- [ ] Sentry: no server functions added
- [x] Design record (`docs/calendar/ui.md`, `docs/jobs/ui.md`, decisions)

Security-gated paths touched: `src/env.ts`, `.env.example`,
`src/routes/_authed/calendar.tsx`. The `security` agent gates the merge.

## Changes

### Schema

- None. Properties get coordinates in the database in phase 2; the demo
  `Property` type gains `location: { lon, lat } | null` to mirror
  `properties.location`.

### Env

- `src/env.ts`: add optional client vars `VITE_MAP_PROVIDER`
  (`maptiler | stadia | osm`) and `VITE_MAP_API_KEY`; remove
  `VITE_GOOGLE_MAPS_API_KEY`.
- `.env.example`: same, with a note that the key is public (it ships to the
  browser) and must be restricted by HTTP origin in the provider's console.

### Library and components

- `ol` (current stable, 10.x). No React wrapper library.
- `src/lib/map/geo.ts`: the `LonLat` type, kept free of `ol` imports so seed
  and route code can use it.
- `src/lib/map/providers.ts`: `resolveBasemap({ provider, apiKey, dev })`
  (pure) and `createBasemapSource(basemap)`, which returns an OpenLayers tile
  source with its attributions.
- `src/components/map/MapView.tsx`: the public, SSR-safe component. It renders
  a skeleton until hydrated, then lazy-loads `OlMap.tsx`, so the server never
  imports `ol`. `MapBasemapProvider` lets Storybook (and later tests) override
  the env basemap.
- `src/components/map/OlMap.tsx`: the lazy chunk. Imports `ol/ol.css`, creates
  one `ol/Map` in a ref, disposes it on unmount, syncs layers from props, fits
  the view to the data, and calls `onSelectStop` on a stop click.
- `src/components/map/layers.ts`: `createStopsLayer`, `createRouteLayer` (with
  optional leg labels), `createDepotLayer`, reading colours from the CSS
  tokens. Data is EPSG:4326 lon/lat; the view is EPSG:3857.
- `src/components/map/UnplacedStops.tsx`: lists stops without coordinates
  under a map.
- `src/components/crm/RouteMap.tsx`: same props (`stops`, `color`,
  `activeJobId`, `onSelect`, `className`, `showLegs`) plus an optional
  `depot`. Pins come from `property.location`.
- `src/components/calendar/RouteMap.tsx`: `stops` plus an optional `depot`
  (`apiKey` is removed). Stops carry an optional `location`.
- `WeekCalendar`: `mapApiKey` is replaced by an optional `depot`;
  `_authed/calendar.tsx` passes the org yard and each stop's location.

### Procedures

| Procedure | Input | Output | Roles allowed |
| --------- | ----- | ------ | ------------- |
| none      |       |        |               |

### Routes and UI

| Route       | Screen                   | States                                                                               |
| ----------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `/calendar` | Selected day's route map | loading (skeleton), populated, some stops unplaced, no basemap configured            |
| `/jobs`     | Route view map           | loading (skeleton), populated, selected stop opens the drawer, unplaced stops listed |
| `/jobs`     | Job drawer, Route tab    | loading (skeleton), populated with the active job ringed                             |

### Acceptance criteria

1. No file imports `ol` at runtime outside `src/lib/map/providers.ts`,
   `src/components/map/OlMap.tsx`, and `src/components/map/layers.ts`, and the
   server render of `/calendar` and `/jobs` succeeds without loading them.
2. The calendar's selected day shows numbered stops at their Calgary
   locations, the yard, and a line through them, on the configured basemap,
   with OpenStreetMap and provider attribution visible.
3. The jobs route view and the job drawer show the same, in the crew's colour.
   Clicking a stop on the jobs page opens that job; the drawer rings the
   current job.
4. Stops without coordinates are listed under the map, not placed on it.
5. `VITE_GOOGLE_MAPS_API_KEY` no longer appears in the code or `.env.example`.
6. Storybook stories for `MapView` and both route maps pass their interaction
   tests without network access.

## Commits

1. `Plan OpenLayers maps (phase 1)`: this file.
2. `Add OpenLayers and a swappable basemap provider`: `ol`, env, `.env.example`,
   `src/lib/map/*` and its unit test.
3. `Add the client-only OpenLayers MapView`: `src/components/map/*` and stories.
4. `Show route maps on OpenLayers`: demo coordinates, both `RouteMap`s,
   `WeekCalendar`, the routes, and their stories.
5. `Record the OpenLayers maps design`: ADR 0014, `docs/calendar/ui.md`,
   `docs/jobs/ui.md`, design decision, shots.

All commits are made by the implementing agent; there are no remote-database
steps.

## Unhappy paths

- No provider or key configured in production: no basemap, a small note, and
  the pins and line still render on the plain background.
- Tile requests fail (quota, bad key, offline): OpenLayers leaves the tiles
  blank; pins and line still render.
- Every stop lacks coordinates: the map frames the yard (or Calgary) and lists
  every stop underneath.
- `ol` chunk fails to load: the error propagates to the route's error
  boundary like any other lazy import.
- Component unmounts mid-load or re-renders under StrictMode: the map is
  created in an effect and disposed in its cleanup, so no orphan maps or
  listeners remain.

## Out of scope

- Service areas, polygons, drawing (phases 3a and 3b).
- Geocoding and the "needs location" state on properties (phase 2).
- Road-following polylines and real drive times (phase 5).
- Route Builder's schematic map (phase 4 moves it to live data and this map).
- Migrations and generated types.

## Dependencies not to add

- `rlayers`, `react-openlayers`, or any other React wrapper for OpenLayers.
- `ol-mapbox-style` or other vector-tile styling (later, if vector tiles are
  adopted).

## Verify command

```
pnpm lint && pnpm check && pnpm exec tsc --noEmit && pnpm exec vitest run
```

## Verification

- The Definition of done from the workflow (no procedures are added, so there
  are no procedure tests).
- `pnpm build` succeeds, and the server bundle only references `ol` from the
  lazily imported map chunk.
- Verified in the running app on `/calendar` and `/jobs` where the
  environment allows signing in; otherwise through Storybook, with the gap
  recorded in the PR.

## Audit log

### Plan audit (`plan-auditor`): not run

The approved roadmap covered it. Eric approved the roadmap on 2026-11-02
together with the start of implementation, and this phase plan restates its
phase 1 scope.

### Review (`reviewer`): pass

No blocking findings. Non-blocking: `pnpm-lock.yaml` carried about 560 lines of
churn beyond the `ol` tree (peer suffixes and `libc` fields from a different
pnpm version). Resolved by rebuilding the lockfile as the `main` lockfile plus
only the `ol` importer entry and its 22 new packages and snapshots (146
insertions, no deletions); `pnpm install --frozen-lockfile` passes.

### Security (`security`): pass

Gated paths touched: `src/env.ts`, `.env.example`, and
`src/routes/_authed/calendar.tsx`. No blocking findings.

| #   | Blocking finding (recurring?) | Resolution |
| --- | ----------------------------- | ---------- |
| -   | None                          | -          |

## Scope-change log

_None._
