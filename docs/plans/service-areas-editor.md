# Plan: Service areas editor (roadmap phase 3b)

- **Slug / branch**: `service-areas-editor` / `feat/service-areas-editor`
- **Tier**: full (new UI feature on a security-gated route file)
- **Status**: implemented
- **Confidence**: 95%. Every material choice comes from Eric's roadmap
  decisions (Q1–Q7, D3, D5; 2026-11-02) or from the code and RPC shapes
  verified in PRs #91 and #92. The few agent defaults are listed under D1–D6.
- **Roadmap**: `docs/plans/maps-service-areas.md` (PR #89)
- **Stacked on**: PR #91 (`feat/service-areas-db`: tables, RPCs, `serviceAreas`
  tRPC router) and PR #92 (`feat/openlayers-maps`: `MapView`, basemap
  providers, GeoJSON schemas, ADR 0014). This branch is `feat/service-areas-db`
  with `feat/openlayers-maps` merged in. Until both merge, this PR's diff also
  shows their commits. Nothing here merges before them.

## Original request

> Instead of Google maps, let's look at openlayers. We also want to be able to take a city and draw polygons for our various teams "service area" a team will automatically get routes within this polygon. Let's look at postgis so we don't have to call out to Google or openstreetmaps or whoever we make our mapping provider. Plan this out thoroughly before implementing.

Eric approved the roadmap and implementation on 2026-11-02. This phase is 3b:
the editor UI only.

## Goal

Owners and admins draw, edit, and archive crew service areas on a map in
Settings → "Hours & service areas", see what a change would do to existing
properties before saving, and see which properties no area covers. Other staff
see the same map and list read-only. The editor sits above the free-text
"Public request areas" card on that tab (see the Scope-change log).

## Decisions

| #   | Question          | Answer                                                                                                |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| Q1  | What owns an area | A crew (roadmap Q1). The form picks it from `crews.list`; "Unassigned" is allowed.                    |
| Q2  | Cities            | A map frame only (roadmap Q2): a switcher over `serviceAreas.regions.list`.                           |
| Q3  | Overlaps          | Allowed, with a non-blocking warning (roadmap Q3). Priority decides the owner.                        |
| Q4  | Weekday rotation  | Optional, behind an "Add rotation" toggle, saved with `rotations.set` (roadmap Q4).                   |
| Q5  | Who edits         | `can.manageServiceAreas` (owner/admin). Everyone else gets a read-only map and list (roadmap Q5, D4). |
| D3  | Devices           | Drawing on desktop and tablet; phones are read-only with a note (roadmap D3).                         |
| D5  | Where             | Settings → "Hours & service areas", above the "Public request areas" list (see Scope-change log).     |

Agent defaults (Eric may veto them):

- **D1** Adding a city makes no provider call. A city is a name plus a centre
  (typed lon/lat or picked on the map) or the current map extent ("Frame this
  view"). The region's `bbox` is stored only for "Frame this view"; the map
  derives a frame from the centre otherwise.
- **D2** The area list is the keyboard-accessible equivalent of the map: it
  selects (and highlights on the map), edits, and archives. Drawing a polygon
  itself is pointer-only, so the form also offers "Use map view as boundary"
  (a rectangle of the visible extent) that works from the keyboard.
- **D3a** The editor draws on its own OpenLayers layers, added through
  `MapView`'s existing `onReady(map)` hook inside a lazily loaded component, so
  `ol` never loads on the server.
- **D4** Archive is one click with a toast; unarchive is not in this phase
  (archived areas are not listed).
- **D5a** Coverage shows counts only, as `serviceAreas.coverage` returns them.
  Workers cannot read it, and the panel is hidden for them.
- **D6** One small change to PR #92's `OlMap`: an optional `frameBounds` prop
  (`[west, south, east, north]`) so the editor frames a city instead of the
  default stops/depot fit. Nothing else in #91/#92 changes.

## Open questions

- None.

## Assumptions

| Assumption                                                                               | User-confirmed?                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------- |
| The Settings page stays on the demo store for everything except this editor              | no, superseded (see Scope-change log) |
| The mock `serviceAreas` string list stays in the demo store/seed (other screens read it) | yes (task)                            |
| No seed, migration, geocoding, or route-generation changes belong in this phase          | yes (task)                            |
| Screenshots wait on Git LFS pushes working from the agent environment                    | no                                    |

## Design refs

- Mock: none, UI proposed below and recorded in `docs/service-areas/ui.md`
- Screens: `docs/service-areas/ui.md` (new); `docs/design/decisions.md`
  (new entry); `docs/design/README.md` (spec table)

## Layers touched

- [ ] Migration (none)
- [ ] RLS policies / pgTAP tests (none)
- [ ] `docs/database` (none)
- [ ] Types (none)
- [ ] Middleware (none)
- [ ] tRPC procedures (none; uses #91's `serviceAreas` router as is)
- [x] Routes / loaders (`src/routes/_authed/settings.tsx` hours tab)
- [x] UI components (`src/components/service-areas/*`)
- [x] Hooks (`src/integrations/service-areas/serviceAreas.ts`)
- [x] Stories
- [x] Tests
- [ ] Sentry (no server functions added)
- [x] Design record

Security-gated paths touched: `src/routes/_authed/settings.tsx`
(`src/routes/**`). The `security` agent gates the merge.

## Changes

### Hooks (`src/integrations/service-areas/serviceAreas.ts`)

`useServiceAreas`, `useServiceRegions`, `useServiceAreaCoverage` (disabled
unless `can.viewServiceAreaCoverage`), and `useServiceAreaMutations`
(`upsert`, `preview`, `archive`, `setRotations`, `upsertRegion`). Queries pass
the active `organizationId` (`useOrganization()`); successful mutations
invalidate `serviceAreas.list`, `serviceAreas.coverage` and
`serviceAreas.regions.list` as relevant. Failures toast.

### Components (`src/components/service-areas/`)

| File                  | Job                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ |
| `ServiceAreasSection` | Container: reads the hooks and role, renders the editor, wires the mutations         |
| `ServiceAreasEditor`  | Presentational editor: city switcher, map, area list, form, preview dialog, coverage |
| `AreaMap`             | `MapView` plus lazily loaded OpenLayers layers (areas, draft; Draw + Modify + Snap)  |
| `AreaMapLayers`       | The `ol` code: layers, interactions, selection highlight, framing, "pick a point"    |
| `AreaList`            | Name, crew, colour swatch, property count, "overlaps N", select/edit/archive         |
| `AreaForm`            | Name, crew, colour, priority, rotation toggle and weekday crews                      |
| `ImpactDialog`        | `serviceAreas.preview` result: moved properties (from → to) and the overlap warning  |
| `CoveragePanel`       | Covered / uncovered / no-location counts from `serviceAreas.coverage`                |
| `RegionForm`          | Add a city: name and lon/lat, pick on map, or frame the current view                 |
| `model.ts`            | Pure helpers: bounds, labels, palette, geometry compare, rotation mapping            |

### Routes and UI

| Route                       | Screen              | States                                                             |
| --------------------------- | ------------------- | ------------------------------------------------------------------ |
| `/settings` (Hours & areas) | Service area editor | loading, error, empty (no areas), populated, read-only, phone note |

### Acceptance criteria

1. Owner/admin can add a city, switch cities, draw a polygon, set crew, name,
   colour and priority, and save through `serviceAreas.upsert`.
2. Save first calls `serviceAreas.preview`; the dialog lists properties that
   would move (from → to) and warns, without blocking, on overlaps.
3. The area list shows name, crew, swatch, property count, an "overlaps N"
   badge and an archive action; selecting an area highlights it on the map.
4. The coverage panel shows uncovered and no-location counts.
5. "Add rotation" saves weekday crews through `rotations.set`.
6. Non-managers see a read-only map and list; phones show read-only plus a note.
7. Loading, empty, error and populated states render.
8. No network in stories; tsc, lint, prettier and the Storybook tests pass.

## Commits

1. `Add the service areas editor plan` (plan only)
2. `Add the service areas editor` (hooks, components, `OlMap` `frameBounds`,
   Settings integration)
3. `Add service area editor stories` (stories with interaction tests)
4. `Document the service areas editor` (`ui.md`, decisions, plan status)

## Unhappy paths

- Preview or save fails: toast the error, keep the draft and the form.
- Archived or deleted area while editing: the refetch drops it; the form closes.
- Geometry rejected by the database (self-intersection, too many vertices):
  the error message shows in the dialog and nothing is saved.
- Overlaps: warned, never blocked.
- Region with no areas: empty state with a draw prompt.
- No cities yet: the editor asks for one before drawing.
- Worker or dispatcher: no edit controls; coverage hidden for workers.
- Rotation save fails after the area saved: toast; the area stays saved.

## Out of scope

Migrations, seed data, geocoding, route generation, property pin drag (deferred
by Eric, 2026-11-02, to a later phase), unarchiving, and screenshots when LFS uploads are refused.

## Dependencies not to add

None. `ol` arrives with PR #92.

## Verify command

```
pnpm install --frozen-lockfile && pnpm lint && pnpm check && pnpm exec tsc --noEmit && pnpm exec vitest run
```

## Verification

Definition of done from the workflow: tsc, lint and prettier pass; stories with
interaction tests; the editor behaves in the running app where a Supabase
session is available (otherwise stated in the PR); reviewer and security
passed; docs updated.

## Audit log

Not audited by a `plan-auditor` agent in this run. Eric approved the roadmap
and the implementation on 2026-11-02, and this phase follows its table.

**Audit waived (user decision, 2026-11-02):** the plan was never audited. Eric
waived the audit rather than run it after the code was built and reviewed.

### Review

- Security: pass at c68bad9 (high confidence, no findings).
- Reviewer: needs-changes at c68bad9 for the documentation drift recorded in
  the Scope-change log below; fixed in the following commit, then re-reviewed.

## Scope-change log

- **2026-11-02, "Public request areas" card kept.** The plan said the editor
  replaces the string-list card and that Settings stays on the demo store.
  Neither held after `main` was merged in: Settings now reads and saves
  `organizations.settings.service_areas` as live data, and the public request
  page serves it. The card stays, renamed "Public request areas", below the
  editor. `docs/service-areas/ui.md` and `docs/design/decisions.md` now say so.
  Folding the two lists into one is not decided.
- **2026-11-02, property pin drag deferred.** The roadmap listed it for 3b; this
  plan always excluded it. Eric deferred it to a later phase (user decision).
