# Service areas

A **service area** is a polygon a crew covers. A **service region** is a city
the organization works in; it only frames and switches the map (no clipping,
no gap report against city limits). A **rotation** optionally gives an area a
different crew on some ISO weekdays. Every property's
`service_area_id` is **derived** in Postgres from its `location` and the org's
live areas, so "which crew owns this address" never calls a map provider. See
[ADR 0012](../decisions/0012-service-areas.md).

Standard columns are described in the [README](../README.md#conventions).
Migration: `supabase/migrations/20261102180000_service_areas.sql`.

## `service_regions`

| Column       | Type                           | Null | Default | Notes                                                        |
| ------------ | ------------------------------ | ---- | ------- | ------------------------------------------------------------ |
| `name`       | `text`                         | no   |         | 1–120 chars. Unique per org on `lower(name)`                 |
| `boundary`   | `geometry(MultiPolygon, 4326)` | yes  |         | City limits, when known. Valid, not empty, ≤ 20,000 vertices |
| `center`     | `geometry(Point, 4326)`        | no   |         | Given, or a point on the boundary                            |
| `bbox`       | `geometry(Polygon, 4326)`      | yes  |         | Given `[w, s, e, n]`, or the boundary's envelope             |
| `source`     | `text`                         | yes  |         | `manual`, `osm`, … (≤ 40 chars)                              |
| `source_ref` | `text`                         | yes  |         | The source's id for the boundary (≤ 200 chars)               |

Rows are created only by `upsert_service_region`. The API may update `name`,
`source`, and `source_ref` directly; geometry has no column grant.

## `service_areas`

| Column        | Type                           | Null | Default | Notes                                                                               |
| ------------- | ------------------------------ | ---- | ------- | ----------------------------------------------------------------------------------- |
| `crew_id`     | `uuid`                         | yes  |         | Composite FK → `crews`, on delete set null. Null = unowned area                     |
| `region_id`   | `uuid`                         | yes  |         | Composite FK → `service_regions`, on delete set null                                |
| `name`        | `text`                         | no   |         | 1–120 chars. Unique per org on `lower(name)` among live (not archived) areas        |
| `color`       | `text`                         | yes  |         | `#rrggbb`                                                                           |
| `priority`    | `integer`                      | no   | `0`     | −1000..1000. Higher wins on overlap                                                 |
| `boundary`    | `geometry(MultiPolygon, 4326)` | no   |         | Checks: `ST_IsValid`, SRID 4326, not empty, ≤ 5,000 vertices. No column grant       |
| `area_m2`     | `double precision`             | —    |         | `generated always as (st_area(boundary::geography)) stored`. Geodesic square metres |
| `archived_at` | `timestamptz`                  | yes  |         | An archived area keeps its polygon but owns no properties                           |

Indexes: GiST `(organization_id, boundary)`, `(organization_id, crew_id)`,
`(organization_id, region_id)`, and the partial unique name index. There is
**no overlap constraint** (Eric's decision): overlaps are reported, not
blocked.

Rows are created only by `upsert_service_area`. The API may update `name`,
`crew_id`, `region_id`, `color`, `priority`, and `archived_at` directly
(archiving is a plain update).

## `service_area_rotations`

Has no `id` column.

| Column            | Type       | Null | Default | Notes                                                      |
| ----------------- | ---------- | ---- | ------- | ---------------------------------------------------------- |
| `service_area_id` | `uuid`     | no   |         | Composite FK → `service_areas`, on delete cascade. PK part |
| `weekday`         | `smallint` | no   |         | ISO weekday, 1 = Monday … 7 = Sunday. PK part              |
| `crew_id`         | `uuid`     | no   |         | Composite FK → `crews`, on delete cascade                  |

PK `(organization_id, service_area_id, weekday)`; index
`(organization_id, crew_id)`. A rotation crew wins over the area's crew on
that weekday when routes are built (phase 4). `properties.service_area_id`
ignores rotations.

## `properties.service_area_id`

Derived; not writable through the API (no column grant). Composite FK →
`service_areas`, on delete set null. The **winning area** for a point is the
live area that `ST_Covers(boundary, location::geometry)` (a point on the edge
counts), ordered by `priority desc, area_m2 asc, created_at asc, id`.

| Trigger                                          | When                                                                  | Does                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `properties.set_service_area`                    | before insert; before update of `location` or `service_area_id`       | Sets the winner (null without a location). A direct write of the column, even by trusted code, is replaced by the derived value   |
| `service_areas.recompute_property_service_areas` | after insert; update of `boundary`, `priority`, `archived_at`; delete | `security definer`. Recomputes only properties inside old ∪ new boundary (or pointing at the area), under a per-org advisory lock |

## RPCs

All are in `public`, `security invoker` (RLS applies), and executable by
`authenticated` only. Geometry crosses the API only as GeoJSON (lon/lat).

| Function                                                                                                       | Returns                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upsert_service_area(p_organization_id, p_id, p_name, p_crew_id, p_region_id, p_color, p_priority, p_geojson)` | The area id. `p_id` null creates. Normalizes the GeoJSON (below), then calls the `private.save_service_area` writer                                                                                                 |
| `preview_service_area(…same arguments…)`                                                                       | `{ changes: [{ property_id, address_line1, from_area_id, to_area_id, to_preview }], overlapping_area_ids, area_m2, vertex_count, geometry }`. A dry run: writes nothing. `to_preview` marks the edited area winning |
| `service_areas_geojson(p_organization_id, p_include_archived default false)`                                   | FeatureCollection; each feature's properties: `id, name, crew_id, region_id, color, priority, area_m2, archived_at, updated_at, property_count, overlapping_area_ids, rotations`                                    |
| `service_area_coverage(p_organization_id)`                                                                     | `{ areas: [{ id, name, crew_id, property_count }], covered_count, uncovered_count, no_location_count }` (non-archived properties)                                                                                   |
| `set_service_area_rotations(p_organization_id, p_service_area_id, p_rotations)`                                | Replaces the area's rotations with `[{ weekday, crew_id }]` (empty clears)                                                                                                                                          |
| `upsert_service_region(p_organization_id, p_id, p_name, p_boundary, p_center, p_bbox, p_source, p_source_ref)` | The region id. Boundary (Polygon/MultiPolygon) or center (Point) required                                                                                                                                           |
| `service_regions_geojson(p_organization_id)`                                                                   | FeatureCollection; geometry is the boundary (or null); properties carry `center [lon, lat]` and `bbox [w, s, e, n]`                                                                                                 |

**Normalization** (`private.normalize_multipolygon`): accepts only a GeoJSON
`Polygon` or `MultiPolygon`; rejects coordinates outside lon/lat range; then
`ST_MakeValid`, keeps polygon parts (`ST_CollectionExtract(…, 3)`), snaps to a
1e-7° grid (about 1 cm), makes valid again, and `ST_Multi`. It rejects an
empty result, more than 5,000 vertices (20,000 for regions), or an area over
5,000 km² (20,000 km² for regions). Every rejection is SQLSTATE `22023`.

`property_count` and coverage read `properties` under RLS, so workers (who
have no `properties` policy) see 0.

**Writers**: `private.save_service_area` and `private.save_service_region` are
the only code that writes polygons. They are `security definer`, check
`private.has_org_role(org, '{owner,admin}')` (else `42501`), and scope every
statement to that org (an id from another org is `P0002`).

## RLS

| Table                    | owner/admin | dispatcher | worker | portal user |
| ------------------------ | ----------- | ---------- | ------ | ----------- |
| `service_regions`        | S I U D     | S          | S      | —           |
| `service_areas`          | S I U D     | S          | S      | —           |
| `service_area_rotations` | S I U D     | S          | S      | —           |
