# 0012. Service areas: PostGIS polygons and a derived property area

- **Status**: Accepted (2026-11-02)
- **Date**: 2026-11-02
- **Plan**: [service-areas-db.md](../../plans/service-areas-db.md) (roadmap
  `maps-service-areas`, PR #89)

## Context

Eric wants to draw polygons over a city for each crew's service area, and
have work inside a polygon go to that crew, without calling Google,
OpenStreetMap, or any other provider at query time. PostGIS is already
enabled, and `properties.location` is a `geography(Point, 4326)` with a GiST
index. His decisions (2026-11-02): a crew owns an area (or none); a city is
only a map frame; overlaps are allowed with a warning; weekday crew rotation
is optional; owner/admin edit and all staff read.

## Decision

- **Polygons are `geometry(MultiPolygon, 4326)`; points stay
  `geography(Point, 4326)`.** Drawn polygons come from a planar web map in
  lon/lat, so planar edges match what the user drew; geography edges are
  great-circle arcs that bow away from the drawn line on long east–west
  edges. Geometry also has the full function set (`ST_MakeValid`,
  `ST_SnapToGrid`, `ST_CollectionExtract`). Matching casts the point:
  `ST_Covers(boundary, location::geometry)`, served by a new GiST index on
  `(organization_id, (location::geometry))`. Sizes use geodesic area
  (`area_m2 = ST_Area(boundary::geography)`, a stored generated column).
  Always MultiPolygon, so one type covers areas split by a river.
- **`ST_Covers`, not `ST_Contains`.** A point exactly on an edge (common with
  snapped vertices and addresses on a boundary street) belongs to the area.
- **Overlaps are allowed.** There is no exclusion constraint. The winning
  area for a point is the live area with the highest `priority`, then the
  smallest `area_m2` (the more specific area), then the oldest `created_at`,
  then `id`. The editor warns through `overlapping_area_ids` (interiors
  intersect, `ST_Relate … 'T********'`; touching edges don't count) and
  `preview_service_area`.
- **`properties.service_area_id` is derived and stored.** A before trigger
  sets it on insert and on any change to `location` (or a direct write of the
  column, which it overrides). An after trigger on `service_areas` recomputes
  only the properties inside the old ∪ new boundary when the boundary,
  priority, or archive state changes, or the area is deleted. It is
  `security definer` because the column has no grant, and it takes a per-org
  advisory lock so two concurrent overlapping edits see each other. Storing
  it makes "which crew" a plain indexed read for lists, counts, and route
  building, rather than a spatial join each time.
- **Rotations** are a separate table keyed by ISO weekday (1–7). The polygon
  is the same every day; on a rotation weekday the rotation crew wins over the
  area's crew when routes are built (phase 4). `service_area_id` ignores
  rotations, and `jobs.preferred_crew_id` still wins over both (roadmap D1).
- **Writes go through GeoJSON RPCs.** `boundary` (and the region geometry)
  has no column grant. `upsert_service_area` is `security invoker`, normalizes
  the GeoJSON (`ST_GeomFromGeoJSON`, SRID 4326, `ST_MakeValid`, polygon parts
  only, snap to a 1e-7° grid, `ST_Multi`; caps of 5,000 vertices and
  5,000 km²), then calls `private.save_service_area`, a `security definer`
  writer that re-checks `has_org_role(org, '{owner,admin}')`. We chose this
  over making the whole public function `security definer` (the pattern
  `generate_visits` uses, ADR 0009's update) so that the public API keeps
  ADR 0009's invoker default and the definer surface is one small function in
  `private`, which PostgREST does not expose. Table checks (`ST_IsValid`,
  SRID, not empty, vertex cap) hold even for trusted code. Reads
  (`service_areas_geojson`, `preview_service_area`, `service_area_coverage`,
  `service_regions_geojson`) are invoker, so RLS decides what they see.
  Generated TypeScript types show geometry as `unknown`, so geometry crosses
  the API only as GeoJSON.
- **ADR 0006 stands.** Service areas decide which crew a property belongs to;
  they don't order stops. Route optimization stays with an external solver
  that writes `routes` and `route_stops`.

## Alternatives considered

- **`geography(MultiPolygon)`**: geodesic edges don't match the drawn map,
  and `ST_MakeValid`/snapping need geometry anyway.
- **An exclusion constraint against overlaps**: rejected by Eric; real
  service areas overlap at their edges and during reorganizations.
- **Computing the area at read time** (a spatial join per query): simpler
  writes, but every list, count, and route build pays for it, and it can't
  be indexed as a foreign key.
- **Granting `boundary` and normalizing in a trigger**: direct writes would
  bypass the vertex and area caps' clear error messages, and Eric asked for
  polygon writes to go through the RPC.

## Consequences

- An area edit can reassign many properties. `preview_service_area` shows
  the diff first, and archived or deleted areas release their properties.
- Recomputing touches `properties.updated_at` for reassigned rows.
- A property saved at the same instant an area changes can keep a stale
  area until its next location change or the next area edit over it (the
  property trigger takes no lock). Acceptable at this scale.
- Workers can read areas, regions, and rotations, but `property_count` is 0
  for them because they have no `properties` policy (ADR 0011).
- Geocoding quality decides the area. That is phase 2's concern.
