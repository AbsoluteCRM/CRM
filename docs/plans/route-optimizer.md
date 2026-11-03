# Plan: Route optimizer (VROOM + OSRM)

- **Slug / branch**: `route-optimizer` / `feat/route-optimizer`
- **Tier**: full (migration, trusted server code, tRPC, UI). Phase 5 of the
  [roadmap](maps-service-areas.md). Eric approved the roadmap and said to
  build route optimization as its own PR after auto-assignment. This branch
  is stacked on PR #98 (`feat/auto-assign-routes`), which is stacked on
  PR #97 (`feat/route-builder-live-data`).
- **Status**: implemented (approved through the roadmap; no separate
  plan-mode round, see Scope-change log)
- **Confidence**: 90%. The product choices are Eric's (self-hosted VROOM +
  OSRM, provider-agnostic, nearest-neighbour fallback stays). Two things are
  unverified: no solver was reachable from the build environment, so the
  VROOM and OSRM adapters are written against their documented HTTP APIs and
  tested against recorded-shape fixtures only; and the SQL was run on a
  local Postgres + PostGIS shim, not on a Supabase project.

## Original request

> We also want to be able to take a city and draw polygons for our various
> teams "service area" a team will automatically get routes within this
> polygon.

Roadmap section "Route ordering and travel times" and phase 5. Eric's
decisions for this phase: road-network travel times come from a self-hosted
VROOM + OSRM pair (no per-request provider fees); the optimizer is
provider-agnostic per
[ADR 0006](../database/decisions/0006-external-route-optimizer.md)
(`optimization_runs.provider`); the straight-line ordering from
`generate_draft_routes` stays as the fallback and the default when no
optimizer is configured; hosting is Eric's call later, so this PR ships the
integration, the docs and a docker-compose example only.

## Goal

A dispatcher opens Route Builder, picks a date and presses "Optimize
routes". The server reads that date's open routes, asks a solver for the best
stop order on real roads, and writes back the order, planned arrival and
departure per stop, travel distance and time per leg, each route's totals and
a road polyline. The page shows the run's state, per-route distance and drive
time, flags a result as stale once someone edits the route, and draws the
road polyline on the map. With no optimizer configured, or an unreachable
one, the button explains why (or records a failed run) and nothing changes.

In scope: the `Optimizer` interface with a VROOM adapter (OSRM for legs and
geometry) and a fake; env and `.env.example`; a trusted runner that owns the
run row and the write-back; one read function and one write function in SQL;
`routes.optimize`, `routes.lastRun`, `routes.optimizationStatus`,
`routes.optimizerInfo`; the Route Builder panel, stale indicator, road
polyline; ops docs with a docker-compose example. Out of scope: hosting the
solver, vehicle capacity, moving visits between crews, a nightly run, a
hosted-optimizer adapter, geocoding, service areas, and any change to
`generate_draft_routes`.

## Decisions

| #   | Question                   | Answer                                                                                                                                  |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Which solver               | Self-hosted VROOM with OSRM. No per-request fees (Eric)                                                                                 |
| Q2  | Provider model             | Provider-agnostic: `optimization_runs.provider` is `vroom` here; a hosted optimizer is a new adapter, no schema change (ADR 0006, Eric) |
| Q3  | Fallback                   | The straight-line ordering from #98 stays, and is the default when `OPTIMIZER_PROVIDER` is `none` or unset (Eric)                       |
| Q4  | Hosting                    | Eric's call later. This PR ships the integration, docs and a compose example (Eric)                                                     |
| Q5  | Who may run it             | Office roles (`can.manageJobs`), checked in tRPC, again in the trusted runner, and by the read function                                 |
| Q6  | Does it call a solver here | No. No network access to solvers from the build environment; adapters are tested with fixtures                                          |

Agent defaults (minor; Eric may veto them):

- **D1**: The optimizer reorders stops **within each route**. It does not move
  a visit to another crew: the service-area assignment from phase 4 is the
  dispatcher's intent, and silently overriding it would be a surprise. Each
  visit is sent to the solver with a skill that only its own route's vehicle
  has. Cross-crew rebalancing is a later option (`allowReassign` is not in
  the interface yet).
- **D2**: Only `draft` and `optimized` routes are sent. `published`,
  `in_progress` and `completed` routes are never read for writing and never
  touched; the SQL function re-checks under a row lock.
- **D3**: `is_locked` stops keep their route and their **position number**
  (their `sequence`). The solver orders the unlocked stops; the runner places
  them in the remaining positions, then re-times the whole route with OSRM
  (arrivals and legs are computed from the final order, not taken from the
  solver). A route with locked stops and no `OSRM_URL` is left unchanged and
  reported as skipped, because without OSRM the legs after a pinned stop
  cannot be known.
- **D4**: A stop the solver cannot fit (time window, shift length) stays on
  its route after the optimized stops, in its old relative order, with no
  planned times, and its visit id goes in `optimization_runs.unassigned_visit_ids`.
  A stop whose property has no location is treated the same. The optimizer
  never drops a visit from a route.
- **D5**: Times. VROOM times are Unix seconds. Vehicle window: `planned_start`
  to `planned_start + max_work_minutes` (12 hours when the crew sets none).
  A stop's window is `visits.window_start`/`window_end`; service time is
  `duration_minutes`. Arrival is when the crew arrives; `planned_arrival`
  waits until the window opens if the crew is early.
- **D6**: Runs are asynchronous (ADR 0006). `routes.optimize` inserts the run
  as `queued` and returns it; the work continues in the server process
  (`queued` -> `running` -> `succeeded` / `failed`). The page polls
  `routes.lastRun`. If the process dies mid-run the row would stay
  `running`, so a partial unique index allows one active run per
  (organization, date), and a run older than 15 minutes is marked failed
  ("timed out") before a new one is created.
- **D7**: `OPTIMIZER_PROVIDER=none` (or unset), `vroom` without `VROOM_URL`,
  or an unreachable solver all fail soft: a `failed` run row with a plain
  `error`, routes untouched, HTTP 200 with the run. The UI shows the reason.
  `none` / unconfigured creates no solver call; the button is disabled with
  the reason and `optimize` still records a failed run if called directly.
- **D8**: The raw request and response go to `optimization_run_payloads`
  (service role only). Coordinates appear only there and in the request to
  the solver; they are never logged and never in Sentry spans or errors.
- **D9**: Stale. An `optimized` route is shown as stale when it has a stop
  that was not part of the result (no planned arrival and not in the run's
  unassigned list), its stops are out of arrival order, its stop count
  differs from the count the run optimized (`routes.optimized_stop_count`,
  written only by the apply function), or any of its rows changed after the
  run finished.
- **D10**: Polyline is Google-encoded at precision 5 (OSRM `polyline` and
  VROOM geometry both use it). The map decodes it client-side; the existing
  `MapRoute.path` takes any number of vertices, so `MapView` is unchanged.

## Open questions

- None that block the build. For Eric later: where to host VROOM/OSRM (the
  compose file in `docs/ops/optimizer.md` is a starting point), and whether
  to rebalance visits across crews (D1).

## Assumptions

| Assumption                                                                                                                                                             | User-confirmed?              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| VROOM's `POST /` accepts the documented `vehicles`/`jobs`/`skills`/`time_windows`/`service` shapes and returns `routes[].steps[]` with `arrival`, `duration`           | no (docs)                    |
| OSRM `GET /route/v1/driving/{lon,lat;...}?overview=full&geometries=polyline&steps=false` returns `routes[0].legs[]` with `distance`, `duration`, and `geometry`        | no (docs)                    |
| `service_role` has table privileges on `public` (Supabase default), so a `security invoker` function granted only to it works                                          | no (Supabase docs)           |
| A single process serves the app (self-hosted Nitro), so a background promise outlives the request; on a serverless host the work would be cut off, and the doc says so | yes (hosting is Eric's call) |

## Design refs

- Mock: none, UI proposed below.
- Screens: `docs/route-builder/ui.md` (Optimize routes panel, stale badge,
  per-route figures, road polyline).

## Layers touched

- [x] Migration (`supabase/migrations/20261103180000_optimizer_apply_results.sql`)
- [x] RLS policies / pgTAP tests (`supabase/tests/optimizer_apply_results_test.sql`)
- [x] `docs/database` (crews-routing.md, rls.md, README, ADR 0015)
- [x] Types (hand-edited in `src/types/database.ts`; regenerate with `pnpm db:types` after applying)
- [x] Middleware (no change: `manageJobs` via `requireOrgPermission`)
- [x] tRPC procedures
- [ ] Routes / loaders (no change)
- [x] UI components
- [x] Stories
- [x] Tests
- [x] Sentry
- [x] Design record (`docs/route-builder/ui.md`, `docs/design/decisions.md`)

Security-gated paths touched: `supabase/migrations/**`,
`src/integrations/trpc/**`, `src/server/**` (including `src/server/trusted/`),
`src/env.ts`, `.env.example`, `docs/database/rls.md`. The `security` agent
gates the merge.

## Changes

### Schema

Migration `optimizer_apply_results` (timestamp after #98's `20261103150000`).
**Not applied to any database by this PR.**

- `routes.optimized_stop_count integer` (nullable, check `>= 0`). Written
  only by `apply_optimization_results`; no column grant to `authenticated`.
- Partial unique index `optimization_runs_one_active_idx` on
  `(organization_id, route_date) where status in ('queued', 'running')`.
- `public.optimizer_inputs(p_organization_id, p_date, p_route_ids uuid[])`:
  `security invoker`, `stable`, office-role check (`42501`), returns jsonb
  with each open route (depots as lon/lat, planned start, crew
  `max_work_minutes`, stops with lock flag, duration, window, property
  lon/lat) and a `skipped` list for requested routes that are missing or not
  `draft` / `optimized`. RLS applies, so it only returns the caller's org.
  Execute: `authenticated`.
- `public.apply_optimization_results(p_organization_id, p_run_id, p_routes jsonb, p_unassigned uuid[])`:
  `security invoker`, execute to `service_role` only (revoked from public,
  anon, authenticated). The run must exist in the org and be `queued` or
  `running` (`P0002` / `55000`). Per route, in id order: lock the route row,
  skip it when it is not `draft` / `optimized`, belongs to another date, its
  stop set no longer matches the result, or a locked stop's sequence moved.
  Otherwise renumber the stops (the deferred unique constraint allows it in
  one transaction), set planned times and travel figures, then the route's
  totals, `polyline`, `planned_start`, `planned_end`, `optimized_stop_count`,
  `optimization_run_id` and `status = 'optimized'`. Finally the run is set
  `succeeded` (or `failed` when every route was skipped), with
  `finished_at`, `unassigned_visit_ids` and a note in `error` listing how
  many routes were skipped. Returns `{applied, skipped}`.

### Middleware

- None new. `routes.optimize` uses `requireOrgPermission('manageJobs')`.

### Server

- `src/server/optimizer/`: `types.ts` (the `Optimizer` interface and
  request/result types), `vroom.ts`, `osrm.ts`, `plan.ts` (pure: lock
  composition, re-timing), `request.ts` (rows -> request, result -> apply
  payload), `fake.ts`, `http.ts` (JSON `POST`/`GET` with `AbortController`
  timeout, errors without URLs or bodies), `index.ts` (`getOptimizer()` from
  env).
- `src/server/trusted/optimization-runner.ts`: verifies the caller (active
  member with `can.manageJobs`) with the service-role client, inserts the run,
  runs the optimizer in the background, stores payloads, applies results,
  and always ends the run (`succeeded` / `failed`).
- `src/lib/map/polyline.ts`: encode/decode (shared by server and client).
- `src/env.ts`, `.env.example`: `OPTIMIZER_PROVIDER` (`none` | `vroom`),
  `VROOM_URL`, `OSRM_URL`, `OPTIMIZER_TIMEOUT_MS`.

### Procedures

| Procedure                   | Input                                 | Output                                                                  | Roles allowed            |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `routes.optimize`           | `{ organizationId, date, routeIds? }` | The run (`id`, `status`, `provider`, `error`, ...) and `skipped` routes | owner, admin, dispatcher |
| `routes.lastRun`            | `{ organizationId, date }`            | The date's most recent run or null                                      | owner, admin, dispatcher |
| `routes.optimizationStatus` | `{ organizationId, runId }`           | One run's state                                                         | owner, admin, dispatcher |
| `routes.optimizerInfo`      | `{ organizationId }`                  | `{ available, provider, reason }`; no secrets, no URLs                  | owner, admin, dispatcher |

`routes.list` also returns each route's `plannedEnd`, totals, `polyline`,
stale flag and each stop's planned times and travel figures.

### Routes and UI

| Route            | Screen                                      | States                                                                                                         |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/route-builder` | "Optimize routes" card under the build card | not configured (disabled, reason), idle, queued, running, succeeded (per-route figures), failed (error), stale |
| `/route-builder` | Route cards, map                            | distance / drive time, stale badge, arrival and drive per stop, road polyline instead of straight lines        |

### Acceptance criteria

1. With `OPTIMIZER_PROVIDER` unset the button is disabled with the reason;
   calling `routes.optimize` records a `failed` run and changes no route.
2. With a working solver a run goes queued -> running -> succeeded and the
   routes become `optimized` with times, legs and a polyline.
3. A malformed or unreachable solver response fails the run and leaves routes
   untouched.
4. Locked stops keep their sequence; published, in-progress and completed
   routes are never changed.
5. A worker, a non-member and another organization's dispatcher cannot start
   or read a run.
6. Editing an optimized route shows it as stale.

## Commits

1. `Add the route optimizer plan` (main agent): this file.
2. `Add optimizer_inputs and apply_optimization_results` (main agent):
   migration, pgTAP test, types, docs/database.
3. `Add the optimizer module and runner` (main agent): `src/server/optimizer`,
   runner, env, polyline, tests.
4. `Add routes.optimize and routes.lastRun` (main agent): tRPC and tests.
5. `Add the Optimize routes panel to Route Builder` (main agent): UI, stories.
6. `Document the optimizer` (main agent): ops doc, UI record, decisions.

## Unhappy paths

- No optimizer configured, VROOM URL missing, solver down or slow: failed
  run, plain message, routes untouched.
- Solver returns malformed JSON, unknown ids, a stop twice, or an id the
  request did not contain: zod rejects it; failed run.
- A route is edited, locked, published or deleted while the solver runs: the
  apply function skips that route under its lock and reports it.
- Two presses at once: the partial unique index rejects the second
  (`CONFLICT`).
- Process dies mid-run: the row is reaped after 15 minutes.
- The write-back fails halfway: one transaction, nothing is applied; the run
  is marked failed.

## Out of scope

- Hosting VROOM/OSRM, capacity, cross-crew moves, nightly runs, a hosted
  provider adapter, multi-day plans, the worker app, geocoding, service areas.

## Dependencies not to add

- No polyline package (a 30-line encoder/decoder), no VROOM/OSRM client
  library, no queue.

## Verify command

```
pnpm install --frozen-lockfile && pnpm lint && pnpm check && pnpm exec tsc --noEmit && pnpm exec vitest run
```

## Verification

- Procedure tests: role gating, cross-tenant, multi-org, provider failure,
  malformed solver response, locked stops preserved, double press.
- Runner and adapter tests with a fake `fetch`.
- pgTAP: `supabase/tests/optimizer_apply_results_test.sql` (run on a local
  Postgres + PostGIS shim; not on Supabase).
- Stories with interaction tests for every panel state. Verified in the
  running app: pending (no database or solver in the build environment).

## Audit log

Not audited: this plan was written under the approved roadmap, not in plan
mode (see Scope-change log). The reviewer and security agents gate the merge.

### Review (`reviewer`, and `security` since gated): pending

| #   | Blocking finding (recurring?) | Resolution |
| --- | ----------------------------- | ---------- |
|     |                               |            |

## Scope-change log

_None._
