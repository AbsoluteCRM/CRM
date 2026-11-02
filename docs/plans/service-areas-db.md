# Plan: Service areas database and API (roadmap phase 3a)

- **Slug / branch**: `service-areas-db` / `feat/service-areas-db`
- **Tier**: full (schema, RLS, and tRPC)
- **Status**: implemented
- **Confidence**: 95%. Every material choice comes from Eric's roadmap
  decisions (Q1–Q7, 2026-11-02) or from repo conventions verified in the
  migrations. The few agent defaults are listed under D1–D6.
- **Roadmap**: `docs/plans/maps-service-areas.md` (PR #89)

## Original request

> Instead of Google maps, let's look at openlayers. We also want to be able to take a city and draw polygons for our various teams "service area" a team will automatically get routes within this polygon. Let's look at postgis so we don't have to call out to Google or openstreetmaps or whoever we make our mapping provider. Plan this out thoroughly before implementing.

Eric approved the roadmap and the start of implementation on 2026-11-02. This
phase is 3a: the database and API only, with no UI.

## Goal

Store each organization's cities (`service_regions`), crew service-area
polygons (`service_areas`), and optional weekday crew rotations, and keep
`properties.service_area_id` derived in Postgres with `ST_Covers`. Expose
them through RPCs and a `serviceAreas` tRPC router, so the editor (3b) and
auto-assignment (4) can be built on top.

## Decisions

| #   | Question             | Answer (Eric, 2026-11-02)                                                                     |
| --- | -------------------- | --------------------------------------------------------------------------------------------- |
| Q1  | What owns an area    | A crew. `crew_id` is nullable (unowned areas), and a crew can own several areas               |
| Q2  | "Take a city"        | A map frame only: `service_regions`, many per org, with no clipping                           |
| Q3  | Overlaps             | Allowed, with a warning. Priority desc, then smaller area, then created_at decides the winner |
| Q4  | Areas by weekday     | Optional `service_area_rotations` (ISO weekday 1–7 → crew); `service_area_id` ignores weekday |
| Q5  | Who edits            | Owner/admin. All staff read. New `manageServiceAreas` permission                              |
| Q6  | When assignment runs | Phase 4; nothing here assigns visits                                                          |

Agent defaults (Eric may veto them):

- **D1** Polygons are written only by `upsert_service_area` /
  `upsert_service_region` (no column grant on geometry). The public RPCs are
  `security invoker`; they call a `private` `security definer` writer that
  re-checks `has_org_role(org, '{owner,admin}')`. See ADR 0012.
- **D2** `service_areas.area_m2` is a stored generated column (geodesic
  `ST_Area`), used for the tie-break and shown to the UI.
- **D3** Area names are unique per org (case-insensitive) among live areas;
  region names are unique per org.
- **D4** Caps: areas up to 5,000 vertices and 5,000 km²; regions (city
  limits) up to 20,000 vertices and 20,000 km². Snapping is to a 1e-7° grid
  (about 1 cm).
- **D5** `priority` is bounded to −1000..1000.
- **D6** `coverage` is gated on a new `viewServiceAreaCoverage` permission
  (office staff), because it counts properties, which only office staff can
  read under RLS.

## Open questions

- None that change this phase.

## Assumptions

| Assumption                                                                                                     | User-confirmed?   |
| -------------------------------------------------------------------------------------------------------------- | ----------------- |
| ADR number 0012 is free (a map-provider ADR may be written in parallel; the later PR renumbers)                | no (coordination) |
| Geometry (planar, 4326) is accurate enough for city-scale polygons; geodesic area is used only for size checks | no (agent)        |

## Layers touched

- [x] Migration (`supabase/migrations/20261102180000_service_areas.sql`)
- [x] RLS policies / pgTAP tests (`supabase/tests/service_areas_test.sql`)
- [x] `docs/database` (tables, ERD, RLS matrix, README, ADR 0012)
- [x] Types (hand-edited until `pnpm db:types` runs after the remote apply)
- [x] Middleware (`manageServiceAreas`, `viewServiceAreaCoverage`)
- [x] tRPC procedures (`serviceAreas` router)
- [ ] Routes / loaders: none (phase 3b)
- [ ] UI components: none (phase 3b)
- [ ] Stories: none (no UI)
- [x] Tests (Vitest procedure tests, pgTAP)
- [x] Sentry (spans on every procedure)
- [ ] Design record: none (no UI)

Security-gated paths touched: `supabase/migrations/**`,
`src/integrations/trpc/**`, `src/integrations/organization/**`,
`docs/database/rls.md`. The `security` agent gates the merge.

## Changes

### Schema

Migration `service_areas`:

- `service_regions`: `name`, `boundary geometry(MultiPolygon,4326)` (null
  allowed), `center geometry(Point,4326) not null`, `bbox geometry(Polygon,4326)`,
  `source`, `source_ref`, timestamps. Unique `(organization_id, lower(name))`.
- `service_areas`: `crew_id` and `region_id` (composite FKs, on delete set
  null), `name`, `color` (hex check), `priority int not null default 0`,
  `boundary geometry(MultiPolygon,4326) not null` with checks for
  `ST_IsValid`, SRID 4326, not empty, and ≤ 5,000 vertices; generated
  `area_m2`; `archived_at`; timestamps with moddatetime. GiST
  `(organization_id, boundary)`, btree `(organization_id, crew_id)` and
  `(organization_id, region_id)`, partial unique name index. No overlap
  constraint.
- `service_area_rotations`: PK `(organization_id, service_area_id, weekday)`,
  `crew_id not null`, composite FKs with cascade.
- `properties.service_area_id`: composite FK to `service_areas` (on delete set
  null), index `(organization_id, service_area_id)`, plus a GiST index on
  `(organization_id, location::geometry)` for planar `ST_Covers`. No column
  grant.
- Triggers:
  - `properties` before insert / update of `location` or `service_area_id`:
    sets the winner (live area that `ST_Covers` the point, ordered by priority
    desc, `area_m2` asc, created_at asc, id). A direct write of the column is
    therefore always re-derived.
  - `service_areas` after insert / update of `boundary`, `priority`,
    `archived_at` / delete (`security definer`): recomputes only properties in
    the old ∪ new boundary (or currently pointing at the area), under a per-org
    advisory lock.
- RLS: staff select (`my_org_ids()`); owner/admin insert/update/delete
  (`my_org_ids('{owner,admin}')`). Column grants: `service_areas` update
  `(name, crew_id, region_id, color, priority, archived_at)`;
  `service_regions` update `(name, source, source_ref)`; rotations insert all
  four columns and update `crew_id`.
- RPCs (public, `security invoker`, execute to `authenticated` only):
  `upsert_service_area`, `preview_service_area`, `service_areas_geojson`,
  `service_area_coverage`, `set_service_area_rotations`,
  `upsert_service_region`, `service_regions_geojson`.

### Middleware

- `can.manageServiceAreas` (owner/admin) and `can.viewServiceAreaCoverage`
  (owner/admin/dispatcher) in `src/integrations/organization/permissions.ts`.

### Procedures

| Procedure                     | Input                                                                             | Output                                       | Roles allowed |
| ----------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------- | ------------- |
| `serviceAreas.list`           | `organizationId`, `includeArchived?`                                              | FeatureCollection                            | staff         |
| `serviceAreas.upsert`         | `id?`, `name`, `crewId?`, `regionId?`, `color?`, `priority`, `boundary` (GeoJSON) | `{ id }`                                     | owner, admin  |
| `serviceAreas.preview`        | same as upsert                                                                    | changes, overlapping ids, area, vertex count | owner, admin  |
| `serviceAreas.archive`        | `id`, `archived`                                                                  | `{ id }`                                     | owner, admin  |
| `serviceAreas.coverage`       | `organizationId`                                                                  | counts                                       | office        |
| `serviceAreas.regions.list`   | `organizationId`                                                                  | FeatureCollection                            | staff         |
| `serviceAreas.regions.upsert` | `id?`, `name`, `boundary?`, `center?`, `bbox?`, `source?`, `sourceRef?`           | `{ id }`                                     | owner, admin  |
| `serviceAreas.rotations.set`  | `serviceAreaId`, `rotations: [{ weekday, crewId }]`                               | void                                         | owner, admin  |

Shared zod GeoJSON schema in `src/lib/map/geojson.ts`: Polygon/MultiPolygon,
closed rings of ≥ 4 positions, lon −180..180, lat −90..90, ≤ 5,000 vertices.

### Routes and UI

None (phase 3b).

### Acceptance criteria

1. The migration applies on top of `main`'s migrations and every pgTAP file passes.
2. Cross-org isolation, the role matrix, validation, boundary matching,
   priority on overlap, and every recompute path are covered by pgTAP.
3. `service_area_id` and `boundary` cannot be written through the API.
4. tRPC procedures filter by the verified org, are role-gated, and reject bad GeoJSON.
5. Lint, prettier, tsc, and Vitest pass.

## Commits

1. `Plan service areas database and API` (this file)
2. `Add service areas migration and pgTAP tests`
3. `Document service areas schema and ADR 0012`
4. `Add serviceAreas tRPC router` (types, permissions, GeoJSON schema, router, tests)
5. `Seed Calgary service areas`

## Unhappy paths

- Invalid GeoJSON, a non-polygon, projected coordinates, a zero-area shape,
  too many vertices, or too large: `22023` → `BAD_REQUEST`.
- Self-intersecting polygon: made valid (`ST_MakeValid`) and saved.
- A crew or region from another org: composite FK `23503` → `BAD_REQUEST`.
- Unknown area id (or one in another org): `P0002` → `NOT_FOUND`.
- Not owner/admin: `42501` → `FORBIDDEN` (and the tRPC gate rejects first).
- Duplicate name: `23505` → `CONFLICT`.
- Two admins editing overlapping areas at once: the recompute takes a per-org
  advisory lock, so the second sees the first's committed polygon.
- A property saved at the same moment an area changes may keep a stale
  assignment until its next location change or area edit (no lock on the
  property path). Accepted; noted in ADR 0012.

## Out of scope

UI, OpenLayers, geocoding, `generate_draft_routes`, map providers.

## Dependencies not to add

None are needed; PostGIS is already enabled.

## Verify command

```
pnpm install && pnpm lint && pnpm check && pnpm exec tsc --noEmit && pnpm exec vitest run
```

## Verification

- pgTAP: run against a local Postgres 16 + PostGIS 3 + pgTAP with a minimal
  Supabase shim (roles, `auth.uid()`, storage and cron stubs). The remote is
  Postgres 17; the main agent must still apply the migration with
  `apply_migration`, run the advisors, run the pgTAP files with `execute_sql`,
  and regenerate types with `pnpm db:types`.

## Audit log

The roadmap was approved by Eric with implementation started; this phase plan
follows it without new user decisions. A `plan-auditor` round was not run
inside this implementation session; the `reviewer` and `security` agents gate
the PR.

## Scope-change log

_None._
