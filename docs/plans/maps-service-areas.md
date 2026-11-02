# Roadmap: OpenLayers maps and PostGIS crew service areas

- **Slug**: `maps-service-areas` (roadmap; each phase has its own `docs/plans/<slug>.md` and PR)
- **Status**: approved by Eric on 2026-11-02, with implementation started
- **Working doc**: https://claude.ai/artifact/VVcS2CcPkXHjzK64TsxeKx

## Original request

> Instead of Google maps, let's look at openlayers. We also want to be able to take a city and draw polygons for our various teams "service area" a team will automatically get routes within this polygon. Let's look at postgis so we don't have to call out to Google or openstreetmaps or whoever we make our mapping provider. Plan this out thoroughly before implementing.

## Summary

- PostGIS is already enabled (`20261002014117_foundation.sql`). `properties.location` is already `geography(Point,4326)` with a GiST index. Crews and routes already carry depot points. We add the `service_areas` table (plus `service_regions` and `service_area_rotations`) and a derived `properties.service_area_id`. All "which crew owns this address" matching happens in Postgres with `ST_Covers`, and nothing calls a provider at query time.
- There is one unavoidable external step, geocoding. Each address is geocoded once, when it is saved, and the result is stored permanently. The geocoder sits behind a swappable `Geocoder` interface.
- Map tiles come from a swappable `MapProvider`. We start on a hosted free tier (MapTiler, with Stadia as the alternate) and can later self-host Protomaps PMTiles.
- Auto-assignment runs from a per-day "Build routes from service areas" button. It creates draft routes for each owning crew. Stops are first ordered in the database; real road-time optimization later follows ADR 0006, using self-hosted VROOM and OSRM.

## Decisions (Eric, 2026-11-02)

| #   | Question             | Answer                                                         | Effect                                                                                                                                                                                                                    |
| --- | -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | What owns an area    | A crew                                                         | `service_areas.crew_id` → `crews`. One crew can own several areas, and an area can be unowned.                                                                                                                            |
| Q2  | "Take a city"        | A map frame only. An org can cover many cities (agency model). | `service_regions` is one-to-many per org and is used to frame and switch the map. No clipping and no gap report against city limits.                                                                                      |
| Q3  | Overlaps             | Allowed, with a warning                                        | No overlap constraint. The owner is decided by `priority desc, smaller ST_Area, created_at`. Saving and the area list warn about overlaps. A property shows "also in X".                                                  |
| Q4  | Areas by weekday     | Not usually, but offer crew rotation as an option              | The polygon is the same every day. Optional `service_area_rotations(area, weekday 1–7, crew)`: the rotation crew for the visit's ISO weekday wins over the area's crew. `properties.service_area_id` ignores the weekday. |
| Q5  | Who edits            | Owner/admin for now                                            | Write policies use `my_org_ids('{owner,admin}')`. All staff can read. New `manageServiceAreas` permission (owner/admin).                                                                                                  |
| Q6  | When assignment runs | Agent's recommendation                                         | A per-day button in Route Builder. No automatic or nightly run in v1.                                                                                                                                                     |
| Q7  | Tiles / hosting      | Hosted free tier first; self-host if better                    | `VITE_MAP_PROVIDER` defaults to a hosted free tier, and OSM is allowed only in dev. VROOM/OSRM hosting is decided in phase 5.                                                                                             |

Agent defaults (Eric may veto them):

- **D1** `jobs.preferred_crew_id` beats both the rotation and the polygon.
- **D2** Geocoding uses a chain of providers. A hosted geocoder whose terms allow storing results comes first (MapTiler, which shares the tile account). Calgary/Edmonton open-data address points are an optional later provider.
- **D3** Drawing works on desktop and tablet. On phones, areas are read-only.
- **D4** Workers can read their org's areas.
- **D5** The editor lives in Settings → "Hours & service areas" and replaces the mock string list there.

## Schema

- `service_areas`: `id` (v7), `organization_id`, `crew_id` (null allowed, composite FK, `on delete set null`), `region_id` (null allowed), `name`, `color`, `priority int default 0`, `boundary geometry(MultiPolygon,4326)` with checks for `ST_IsValid` and SRID 4326, `archived_at`, and timestamps. Indexes are GiST on `boundary` plus `(organization_id)`.
- `service_regions`: `id`, `organization_id`, `name`, `boundary geometry(MultiPolygon,4326)` (null allowed when only a centre/bbox is known), `bbox`/`center`, `source`, `source_ref`, and timestamps.
- `service_area_rotations`: `(organization_id, service_area_id, weekday smallint 1..7)` is the primary key, plus `crew_id`.
- `properties.service_area_id`: derived and not writable through the API. Triggers keep it current. A property gets it on insert or when its `location` changes. When a service area's boundary, priority, or archive state changes, or the area is deleted, only properties inside the old ∪ new boundary are recomputed.
- RPCs: `upsert_service_area` (GeoJSON in; `ST_MakeValid`, `ST_Multi`, snap to grid; caps on vertices and area), `service_areas_geojson`, `service_area_coverage`, `preview_service_area` (dry-run diff of moved properties and overlaps), and later `generate_draft_routes`.
- RLS follows `docs/database/rls.md`: staff can read; owner/admin can insert, update, and delete. Add pgTAP tests. Add ADR 0012 "Service areas and map provider".

## Geocoding

The `Geocoder` interface lives server-only in `src/server/geo/`. It is a chain set by `GEOCODER_CHAIN`. Geocoding runs on property create/update when the address changed. A failure still saves the property, with `location = null`. A manual pin (`geocode_source = 'manual'`) is never overwritten unless the address text changes. Results are stored in a service-role-only `geocode_cache` keyed by a hash of the normalized address, with no tenant ids. A backfill script uses the service role and is rate-limited. Public Nominatim is for dev and backfill only, and Google/Mapbox are not used because their terms restrict storing results.

## Auto-assignment and ordering

`generate_draft_routes(org, date)` takes the scheduled, unrouted visits for the date. Each visit's crew is resolved as `preferred_crew_id`, then the rotation crew for the weekday, then the area's crew. The function upserts draft routes per crew and date and inserts stops. It skips locked stops, published or in-progress routes, and archived crews, and returns the unassigned visits with a reason. The first ordering pass is a nearest-neighbour + 2-opt on straight-line distance, with ETAs labelled as estimates. Phase 5 replaces it with VROOM + OSRM, which writes `optimization_runs`, `route_stops`, and `routes.polyline`.

## OpenLayers

`ol` is wrapped by a thin in-repo layer in `src/components/map/`. It renders client-only, because OpenLayers needs `window`. The provider factory lives in `src/lib/map/providers.ts` and is driven by `VITE_MAP_PROVIDER` and `VITE_MAP_API_KEY`, and map attribution is always shown. Maps appear in the calendar route map (replacing the Google Embed), the jobs page and job drawer (replacing the fake SVG map), the service area editor (Draw + Modify + Snap, a city switcher, an overlap warning, and a coverage panel), the property pin, and Route Builder.

## Phases (one PR each, end to end)

| #   | Branch                      | Ships                                                                                                                                     | Depends on                               |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `feat/openlayers-maps`      | `ol`, map components, provider config and env, replaces the Google iframe and the fake SVG map, drops `VITE_GOOGLE_MAPS_API_KEY`, stories | —                                        |
| 2   | `feat/property-geocoding`   | `Geocoder` chain, `geocode_cache`, geocoding on property save, backfill script, "needs location" state                                    | —                                        |
| 3a  | `feat/service-areas-db`     | Migration, RLS, triggers, RPCs, pgTAP, docs/database + ADR 0012, `serviceAreas` tRPC router + tests, seed                                 | —                                        |
| 3b  | `feat/service-areas-editor` | Settings editor UI: draw/modify/snap, cities, rotation, overlap warnings, coverage, property pin drag                                     | 1, 3a                                    |
| 4   | `feat/auto-assign-routes`   | `generate_draft_routes`, Route Builder button and unassigned reasons, in-DB ordering                                                      | 3a, plus Route Builder reading live data |
| 5   | `feat/route-optimizer`      | VROOM + OSRM worker, road polylines                                                                                                       | 4                                        |

Every PR requests nick-sait and Eric (LeaderbotX400) as reviewers. Nothing uses a merge queue, and agents don't merge.

## Risks

- Geocoding quality decides which crew gets an address. The UI shows the pin on save, a manual pin wins, and low-confidence results are flagged.
- Provider terms on storing results, and free-tier load caps.
- Polygon validity, slivers, and vertex counts. Handled with `ST_MakeValid`, snapping, caps, and the preview diff.
- An area edit can reassign addresses unexpectedly. A preview diff guards against this, and published or locked routes are never touched.
- Generated Supabase types show geometry as `unknown`. Geometry crosses the API only as GeoJSON through RPCs.
- OpenLayers and SSR: map components must stay client-only.
- Route Builder still runs on mock data, so phase 4 needs it reading live data first.
- Straight-line ordering is wrong across the Bow River and Deerfoot Trail. ETAs stay labelled as estimates until phase 5.

## Out of scope

Turn-by-turn navigation, live GPS tracking, a portal check for "is my address served", and offline maps.
