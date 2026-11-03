# Plan: Route Builder live data

- **Slug / branch**: `route-builder-live-data` / `feat/route-builder-live-data`
- **Tier**: full; schema (RPC migration), tRPC and UI in one slice.
- **Status**: approved (roadmap and implementation approved by Eric, 2026-11-02; see Original request). The `plan-auditor` audit loop was not run: this plan was written by a sub-agent that cannot dispatch agents. The reviewer and security gates run on the PR.
- **Confidence**: 90%. The data model, guard triggers, RLS and error mapping are verified in the repo, and the RPC SQL ran against a local Postgres 16 with PostGIS and pgTAP. Less certain: the PostgREST embed shapes (no live PostgREST here) and the crew-at-creation decision (D2).
- **Plan-mode file**: none; native plan mode is unavailable to this agent.
- **Roadmap**: [maps-service-areas](maps-service-areas.md) (PR #89, merged). This is the Route Builder step. Auto-assignment is a separate, later phase.

## Original request

> Eric (GitHub LeaderbotX400) approved the roadmap and implementation on 2026-11-02 and told us to build Route Builder reading live data, then auto-assignment.
>
> Turn the mock-data Route Builder (`src/components/route-builder/*`, `src/routes/_authed/route-builder.tsx`) into a live one, in a feature-sized PR. Keep the UI and interaction model from the PR #63 plan (existing routes, create route, available jobs, drag between routes, crew dropdown, up/down ordering, search, date filter). Replace the mock state with the database: `routes`, `route_stops` (a stop IS the visit's crew assignment), `route_members`, `visits` with `scheduled_date`, `jobs`/`properties`/`clients` for display, `crews`.

## Goal

The Route Builder reads and writes real routes. Office staff pick a date, see that day's routes (crew, ordered stops, totals) and the scheduled visits not yet on any route, create a route for a crew, drag or button-move visits between routes and the pool, reorder stops, change a route's crew, and delete an empty draft. Every write is atomic, runs as the user under RLS, and respects the date guard, the deferrable sequence constraint and the race fixes. The selected route is previewed on the OpenLayers `MapView` (ADR 0014). Out of scope: service areas, auto-assignment, geocoding, the optimizer, publishing.

## Decisions

| #   | Question        | Answer                                                                                                                                                                      |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Scope and order | Eric (2026-11-02): build Route Builder on live data, then auto-assignment.                                                                                                  |
| Q2  | UI model        | Keep the PR #63 model: existing routes, create route, available jobs, cross-route drag, crew dropdown, up/down order, search, date filter, keyboard and touch alternatives. |
| Q3  | Who             | Office roles (owner, admin, dispatcher), matching RLS and the nav. Reuses `can.manageJobs`; no new permission.                                                              |
| Q4  | Seed data       | Eric handles seed data. No seed files change.                                                                                                                               |
| Q5  | Map             | #92 is merged, so the selected-route preview uses `MapView` from `src/components/map` in place of the schematic.                                                            |

Agent defaults (minor; Eric may veto them):

- **D1**: Writes that touch several rows or depend on order are `security invoker` SQL functions called with `.rpc()` (ADR 0009). Single-row reads use the table API with embeds.
- **D2**: **A route needs a crew at creation.** `routes.crew_id` is `not null` and not updatable through the API (a documented rule: build a new route instead). The PR #63 prototype's crew-less local template therefore has no database row. Create route now takes a crew (a free one is preselected), and `assignCrew` swaps the crew by building a new route for the new crew, moving the stops across, and deleting the old route in one transaction. Making `crew_id` nullable was rejected as a schema contract change outside this slice.
- **D3**: Only `draft` and `optimized` routes are editable. A `published`, `in_progress` or `completed` route is locked: every write function raises `55000` (CONFLICT). The existing triggers do not enforce this; the functions do.
- **D4**: Changing a route's crew resets its roster to the new crew's active members (the old route's `route_members` are removed first so the seed trigger can place anyone who was on the old route). The old route's planned times and polyline are not carried over.
- **D5**: A moved stop's `planned_arrival`, `planned_departure` and travel columns are cleared, since they described a different position.
- **D6**: Optimistic updates cover drag moves, reorders and removals, with rollback and a toast on error, then a refetch settles on the server's truth. Create, crew change and delete wait for the server.
- **D7**: The depot is not drawn: `crews.default_start_location` and `routes.start_location` are `geography`, which supabase-js returns as raw hex. Stops use the generated `properties.latitude` / `longitude`.

## Open questions

- None that block the work. D2 is the one Eric may want to revisit (a nullable-crew "pending route" would need a migration to the routes contract).

## Assumptions

| Assumption                                                                                         | User-confirmed?                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Visits are `status = 'scheduled'` with a `scheduled_date` to be routable                           | no; verified in `visits` constraints  |
| `optimized` routes are editable (a dispatcher reviews the optimizer output)                        | no                                    |
| PostgREST resolves the unhinted composite-FK embeds (one FK between each pair of tables)           | no; could not run PostgREST here      |
| Local Postgres + PostGIS + pgTAP with a Supabase shim is faithful enough for the RPC and its tests | no; the remote project has not run it |

## Design refs

- Mock: none; the PR #63 UI, [Route Builder UI](../route-builder/ui.md), is the reference.
- Screens: `docs/route-builder/ui.md` (data, states, map), `docs/design/decisions.md`.
- Database: `docs/database/tables/crews-routing.md`, `jobs-visits.md`, `rls.md`; ADRs 0002, 0005, 0006, 0009, 0014.

## Layers touched

- [x] Migration (`supabase/migrations/20261103120000_route_builder_rpcs.sql`)
- [x] RLS policies / pgTAP tests (`supabase/tests/route_builder_rpcs_test.sql`; no policy changes)
- [x] `docs/database` (`crews-routing.md`, `rls.md`)
- [x] Types (hand-edited `src/types/database.ts`, generated style)
- [x] Middleware (none new; `requireOrgPermission('manageJobs')`)
- [x] tRPC procedures (`routes.ts`)
- [x] Routes / loaders (route file unchanged apart from providers)
- [x] UI components
- [x] Stories
- [x] Tests
- [ ] Sentry (no server functions added)
- [x] Design record

Security-gated paths touched: `supabase/migrations/**`, `src/integrations/trpc/**`, `src/routes/**` (if the route file changes), `docs/database/rls.md`. The `security` agent gates the merge. The migration is **not applied to the remote database**.

## Changes

### Schema

Migration `route_builder_rpcs` adds seven `public` functions, all `security invoker`, `set search_path = ''`, first argument `p_organization_id`, `revoke execute … from public, anon`, grant to `authenticated` only. Each locks the route row(s) `for update` before reading stops, so concurrent edits to one route serialize (two routes lock in id order). Shared rules: route not found or in another org `P0002`; route not `draft`/`optimized` `55000`.

| Function                                         | Does                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_route(org, date, crew)`                  | Inserts a draft route (the existing triggers copy depots and seed members). Crew must exist, be unarchived (`P0002`); one route per crew and date (`23505`) |
| `change_route_crew(org, route, crew)`            | Builds a route for the new crew, re-points the stops, deletes the old route. Returns the new route id. Same crew is a no-op                                 |
| `add_route_stop(org, route, visit, position)`    | Visit must be `scheduled` (`55000`) and unrouted (`23505`); date guard (`23514`); inserts at `position` (clamped, default last) and shifts the rest         |
| `move_route_stop(org, stop, to_route, position)` | Moves between routes or within one, closing the gap and opening the slot, renumbering both routes from 1; clears planned times                              |
| `reorder_route_stops(org, route, stop_ids)`      | Applies a full order; the array must be exactly the route's stops (`22023`)                                                                                 |
| `remove_route_stop(org, stop)`                   | Deletes the stop and closes the gap                                                                                                                         |
| `delete_route(org, route)`                       | Deletes a draft route with no stops (`55000` otherwise)                                                                                                     |

The sequence unique constraint is `deferrable initially deferred`, so the shifts need no temporary values.

### Procedures (`src/integrations/trpc/routes.ts`, registered as `routes`)

All use `requireOrgPermission('manageJobs')`, so workers and non-members are refused before any query, and filter by the active org.

| Procedure                | Input                             | Output                                                                                                                               |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `routes.list`            | `{ date }` (`YYYY-MM-DD`)         | Routes for the date with crew, locked flag, ordered stops (visit, job, client, property summary) and totals (stops, on-site minutes) |
| `routes.availableVisits` | `{ date }`                        | Scheduled visits on that date with no route stop, with job, client and property display fields and coordinates                       |
| `routes.create`          | `{ date, crewId }`                | `{ id }`                                                                                                                             |
| `routes.assignCrew`      | `{ routeId, crewId }`             | `{ id }` of the (new) route                                                                                                          |
| `routes.addStop`         | `{ routeId, visitId, position? }` | `{ id }` of the stop                                                                                                                 |
| `routes.moveStop`        | `{ stopId, toRouteId, position }` | void                                                                                                                                 |
| `routes.reorderStops`    | `{ routeId, stopIds }`            | void                                                                                                                                 |
| `routes.removeStop`      | `{ stopId }`                      | void                                                                                                                                 |
| `routes.delete`          | `{ routeId }`                     | void                                                                                                                                 |

Errors go through `dbError`: `P0002` NOT_FOUND, `55000` and `23505` CONFLICT, `23514`, `22023` BAD_REQUEST, `42501` FORBIDDEN.

### Routes and UI

| Route            | Screen        | States                                                                                                                                                           |
| ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/route-builder` | Route Builder | Loading skeleton, error with retry, no routes, empty route, populated, filtered-empty and all-routed pool, locked (published) route, no free crew, worker denial |

- `RouteBuilder` becomes a data-driven view over props (routes, available visits, crews, handlers, status), so stories need no network. `RouteBuilderLive` wires `useTRPC()` queries and mutations. The route file renders `RouteBuilderLive` inside the existing gated `PageShell`.
- Optimistic cache edits for `moveStop`, `addStop`, `removeStop`, `reorderStops`, with rollback to the snapshot and a toast on error, then invalidation. Mutations share one scope so they run in order.
- Drag, Add, Move-to-route, Remove, and up/down controls are kept. Locked routes show a Locked badge and disable their controls and drop target.
- The selected route is previewed on `MapView` with numbered stops and straight legs; stops with no coordinates are listed with `UnplacedStops`.

### Acceptance criteria

1. Signed-in office staff see the selected date's real routes and available visits; workers see the existing denied state.
2. Create route (with a crew), crew change, add, move (across routes and within), reorder, remove and delete persist and survive a refresh.
3. A failed move rolls the board back and shows the error.
4. A published route cannot be edited; a visit cannot be routed on another date or twice.
5. Procedure tests cover org filter, role gating, cross-tenant, multi-org and error mapping; pgTAP covers the functions.
6. Stories cover loading, empty, error, populated, drag, keyboard moves and locked routes without network.

## Commits

1. `Plan Route Builder live data` (main agent): this file.
2. `Add route builder RPC migration, tests and docs`: SQL, pgTAP, `docs/database`, types.
3. `Add routes tRPC router with tests`.
4. `Make Route Builder read live data`: UI, stories, map.
5. `Record Route Builder live-data design`: `docs/route-builder/ui.md`, `docs/design/decisions.md`, plan status.

## Unhappy paths

- Two people edit one route: functions lock the route row; the second waits, then sees the first's result (a visit already routed is `23505`).
- A visit is rescheduled while being routed: the existing guard locks the visit and checks its date (`23514`, or a retryable `40P01` deadlock, which surfaces as a generic error and a refetch).
- A drop onto a published route: refused with `55000` and rolled back.
- A crew change collides with another route for that crew and date: `23505`, nothing changes.
- Network failure on a move: optimistic edit reverts to the snapshot, toast shows the failure.
- Stale board (another user moved the stop): `P0002` or `23505`, refetch.

## Out of scope

- Service areas, auto-assignment, geocoding, optimizer runs, publishing or unpublishing, road polylines, a depot marker, per-day roster editing.

## Dependencies not to add

- No drag library; native HTML drag and drop stays.

## Verify command

```
pnpm install --frozen-lockfile && pnpm lint && pnpm check && pnpm exec tsc --noEmit && pnpm exec vitest run
```

## Verification

- Verify command above (five Storybook tests fail on `main` and are reported separately).
- pgTAP file run against a local Postgres 16 + PostGIS + pgTAP with a Supabase shim (not the remote project).
- Shots: pending (Git LFS uploads are refused in this environment).

## Audit log

### Round 1: not run

No `plan-auditor` was dispatched (see Status). Reviewer and security verdicts are recorded on the PR.

### Review (`reviewer`, and `security` since gated): pending

## Scope-change log

_None._
