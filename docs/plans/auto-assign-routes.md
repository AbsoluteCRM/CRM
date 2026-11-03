# Plan: Auto-assign routes from service areas

- **Slug / branch**: `auto-assign-routes` / `feat/auto-assign-routes`
- **Tier**: full (migration, tRPC, UI). Phase 4 of the
  [roadmap](maps-service-areas.md). Eric approved implementation on
  2026-11-02 and said to build auto-assignment once Route Builder reads live
  data (PR #97, `feat/route-builder-live-data`, still open: this branch is
  stacked on it).
- **Status**: approved (roadmap approval; no separate plan-mode round, see
  Scope-change log)
- **Confidence**: 95%. Every material choice is in Eric's roadmap decisions
  (Q1 to Q7, D1) or in his instruction for this phase. Assumptions are listed
  below.

## Original request

> We also want to be able to take a city and draw polygons for our various
> teams "service area" a team will automatically get routes within this
> polygon.

Roadmap Q6: "A per-day button in Route Builder. No automatic or nightly run
in v1." D1: `jobs.preferred_crew_id` beats both the rotation and the polygon.

## Goal

A dispatcher opens Route Builder for a date and presses "Build routes from
service areas". The database takes that date's scheduled, unrouted visits,
works out which crew owns each one, creates a draft route per crew (if there
is none) and appends the visits as stops in a sensible straight-line order.
Visits it cannot place come back with a reason, and the page says what to fix.
In scope: one SQL function, one tRPC procedure, the Route Builder button,
result summary, owner/area labels on visit cards. Out of scope: road
routing, ETAs, the optimizer (phase 5), geocoding, the service-area editor.

## Decisions

| #   | Question               | Answer                                                                                                                                                              |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Owner resolution order | (1) `jobs.preferred_crew_id` if the crew is not archived; (2) the rotation crew for the visit date's ISO weekday on the property's area; (3) the area's crew (Eric) |
| Q2  | Unassigned reasons     | `no_location`, `no_area`, `area_has_no_crew`, `crew_archived` (Eric)                                                                                                |
| Q3  | Existing routes        | One draft route per (crew, date) via the existing unique key. Skip routes that are not draft/optimized, never touch locked or existing stops, append (Eric)         |
| Q4  | Initial order          | Nearest neighbour from the route start, then a 2-opt pass, on straight-line `ST_Distance(geography)`, for the new stops only (Eric)                                 |
| Q5  | Travel figures         | `travel_distance_m` from straight-line distance; `travel_duration_s` and `planned_arrival` stay null: no fake ETAs (Eric)                                           |
| Q6  | Who may run it         | Office roles (owner, admin, dispatcher), by RLS and an explicit role check                                                                                          |
| Q7  | When it runs           | On a button press for one date. No schedule (roadmap Q6)                                                                                                            |

Agent defaults (minor; Eric may veto them):

- **D1**: Extra reason `route_locked` for a visit whose crew already has a
  published, in-progress or completed route that date. Without it those
  visits would vanish from the result with no explanation.
- **D2**: A preferred crew that is archived falls through to the area. If
  there is no area either, the reason is `crew_archived`, not `no_area`.
- **D3**: A visit with no location is `no_location` even when it has a
  preferred crew, because the ordering needs coordinates.
- **D4**: Cap of 500 visits per call (ordered by arrival window, then id).
  The result carries `remaining`, the number left over; running again places
  them. No error.
- **D5**: Where the new stops start: the last existing stop's location if the
  route has stops, else the route's `start_location`, else the first new
  visit (which then becomes stop 1 with no travel figure).
- **D6**: Routes are created through `create_route`, so depots, start time
  and the roster seed come from the same triggers as a manual create.
  An `optimized` route stays `optimized` after stops are appended (phase 5
  decides what re-optimizing means).
- **D7**: Owner/area labels on visit cards show the area name plus the
  crew(s) it points at (the job's preferred crew, the area's default crew).
  They do not resolve the weekday rotation in the browser; the server does
  that only when generating.

## Open questions

None.

## Assumptions

| Assumption                                                                  | User-confirmed?             |
| --------------------------------------------------------------------------- | --------------------------- |
| PR #97 merges before this one; until then the diff shows its commits        | yes (Eric: build after #97) |
| Straight-line ordering is acceptable until phase 5                          | yes (roadmap)               |
| The migration is applied to the remote DB by the main agent after approval  | yes (CLAUDE.md workflow)    |
| `route_locked` and `remaining` are acceptable additions to the result shape | no (D1, D4)                 |

## Design refs

- Mock: none, UI proposed below.
- Screens: `docs/route-builder/ui.md` ("Build routes from service areas").

## Layers touched

- [x] Migration (`supabase/migrations/20261103150000_generate_draft_routes.sql`)
- [x] RLS policies / pgTAP tests (no new policies; `generate_draft_routes_test.sql`)
- [x] `docs/database` (crews-routing.md, rls.md, README)
- [x] Types (hand-edited `src/types/database.ts`; not regenerated, no remote access)
- [ ] Middleware (unchanged: `requireOrgPermission('manageJobs')`)
- [x] tRPC procedures
- [ ] Routes / loaders (unchanged)
- [x] UI components
- [x] Stories
- [x] Tests
- [x] Sentry (span on the procedure)
- [x] Design record (`docs/route-builder/ui.md`, `docs/design/decisions.md`)

Security-gated paths touched: `supabase/migrations/`, `src/integrations/trpc/`,
`docs/database/rls.md`. The `security` agent gates the merge.

## Changes

### Schema

Migration `20261103150000_generate_draft_routes`:

- `private.order_stops(origin geography, points geography[]) returns integer[]`:
  pure, immutable. Returns a visiting order of the points (indexes into the
  array). Nearest neighbour from the origin (or from point 1 when the origin
  is null), then 2-opt passes (open path, first node fixed) until no move
  shortens the path or 100 passes. Uses a precomputed distance matrix.
  Execute granted to `authenticated` (called from an invoker function).
- `public.generate_draft_routes(p_organization_id uuid, p_date date) returns jsonb`,
  `security invoker`, `set search_path = ''`:
  1. Role check: `private.has_org_role(org, '{owner,admin,dispatcher}')`
     else `42501`.
  2. `pg_advisory_xact_lock` on `generate_draft_routes:<org>:<date>`.
  3. One query picks the candidate visits (`scheduled_date = p_date`,
     `status = 'scheduled'`, no `route_stops` row), joins job, property,
     preferred crew, area, weekday rotation and owner crew, and classifies
     each as a crew or a reason. Cap 500.
  4. Per crew (id order): lock or create the (crew, date) route; skip it
     (`route_locked`) unless draft/optimized; find the origin; order the new
     visits with `private.order_stops`; insert `route_stops` after the
     existing maximum sequence with `travel_distance_m` set from straight-line
     distance (rounded metres).
  5. Returns `{assigned, routes_created, unassigned: [{visit_id, reason}], remaining}`.
- Grants: revoke from `public, anon, service_role`; grant to `authenticated`.

Idempotency: placed visits have a stop, so a second run selects nothing new,
creates no route and returns only the same unassigned set. Atomicity: one
function body is one transaction; any error rolls everything back.
Concurrency: the advisory lock serializes runs for one org and date; routes
are locked `for update` (the same lock `add_route_stop` takes). A manual add
of the same visit in the same instant makes the run fail with `23505` and
change nothing; retrying works.

### Middleware

None.

### Procedures

| Procedure               | Input                      | Output                                                                    | Roles allowed (`manageJobs`) |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------- | ---------------------------- |
| `routes.generateDrafts` | `{ organizationId, date }` | `{ assigned, routesCreated, remaining, unassigned: [{visitId, reason}] }` | owner, admin, dispatcher     |

Uses `ctx.supabase.rpc('generate_draft_routes', ...)` with the verified org,
a Sentry span, `dbError` for errors, and a zod parse of the jsonb result.
`routes.list` and `routes.availableVisits` also return the job's preferred
crew and the property's area (name, colour, default crew) for the card labels.

### Routes and UI

| Route (Route Builder)    | Screen                                                                                       | States                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/_authed` Route Builder | "Build routes from service areas" button in the date card; result panel; owner/area on cards | idle, building (button busy), done (summary), done with unassigned (reasons and fix links), error (alert, retry), hidden when the caller cannot manage jobs |

Result panel: assigned count, routes created, the unassigned visits (customer,
address, reason in words, a link: "Set a location" to the client's page,
"Edit service areas" in Settings, "Assign a crew to the area" in Settings),
`remaining` note, dismiss. The board refetches routes and the pool on success.

### Acceptance criteria

1. Visits in an area land on that area's crew's draft route; a preferred crew
   overrides; a weekday rotation overrides the area crew on its weekday only.
2. Each unassigned reason is produced and shown in words.
3. Running twice changes nothing the second time.
4. Locked stops, existing stops and published routes are untouched.
5. Another org's data is never read or written; workers are refused.
6. The button is absent for roles without `manageJobs`.

## Commits

1. `Plan auto-assign routes` (implementer): this file.
2. `Add generate_draft_routes` : migration, pgTAP, docs/database, types.
3. `Add routes.generateDrafts` : procedure, visit owner fields, tests.
4. `Add Build routes from service areas to Route Builder` : UI, stories, docs.

## Unhappy paths

- Wrong role or non-member: `42501` → FORBIDDEN, nothing written.
- Null org or date: `22023` → BAD_REQUEST.
- Date with no eligible visits: all zeros, empty list, no routes created.
- Crew archived between page load and run: reason `crew_archived`.
- Crew's route published since the page loaded: `route_locked`.
- More than 500 eligible visits: first 500 placed, `remaining` says so.
- Concurrent run: the second waits on the advisory lock, then finds nothing new.
- Failure halfway (for example `23505` from a racing manual add): everything
  rolls back.
- Network failure in the browser: the button shows an error and can be pressed again.

## Out of scope

Road routing, ETAs and the optimizer (phase 5); geocoding; the service-area
editor; nightly or automatic runs; re-optimizing existing stops.

## Dependencies not to add

None.

## Verify command

```
pnpm install --frozen-lockfile && pnpm lint && pnpm check && pnpm exec tsc --noEmit && pnpm exec vitest run
```

## Verification

- pgTAP: `supabase/tests/generate_draft_routes_test.sql`, run on a local
  Postgres + PostGIS + pgTAP with a minimal Supabase shim (not the remote
  project; the migration is not applied remotely).
- Definition of done from the workflow; screenshots are "Shots: pending"
  because Git LFS pushes are refused.

## Audit log

Not audited by `plan-auditor` (see Scope-change log). Review: `reviewer` and
`security` to run on the PR.

## Scope-change log

- 2026-11-03: written after Eric's approval of the roadmap and his
  instruction to build phase 4 once Route Builder reads live data. No
  separate plan-mode round was held; the decisions above are his.
