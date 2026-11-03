See the [design record README](../design/README.md) for the visual system and screen-spec conventions.

| Screen        | Route            | What it shows                                                                      |
| ------------- | ---------------- | ---------------------------------------------------------------------------------- |
| Route Builder | `/route-builder` | The day's real routes, the scheduled visits not yet routed, and a map of one route |

## Route Builder

**Route**: `/route-builder`

**Roles**: Owner, admin, and dispatcher use the builder. Workers receive the existing PageShell access-denied card, including on direct navigation, and the procedures refuse them as well (`can.manageJobs`; RLS on routes, stops and visits is office staff only).

**Layout**: The PageShell cream surface precedes four sections.

- **Create route** pairs the page-level date filter with a crew dropdown and a Create route button. The dropdown lists only crews with no route on that date and preselects the first.
- **Build routes from service areas** is a card with one button for the selected date and, after a run, the result (see Interactions). It is hidden when the viewer cannot manage jobs.
- **Existing routes** is a responsive board of rounded paper cards, beside **Available jobs** on desktop and above it on phone. Each route card has its own selection button, a status badge, a crew dropdown, the date, stop count, on-site duration, and ordered draggable visit cards. A draft route with no stops also shows a delete button.
- Beneath the board, the selected route is drawn on the OpenLayers map ([ADR 0014](../database/decisions/0014-map-provider.md)): numbered pins in the crew colour joined by straight lines. Stops with no coordinates are listed under the map ([Calendar UI](../calendar/ui.md) shows the same pattern). No depot is drawn.

**Data**: Live, through the `routes` tRPC router ([plan](../plans/route-builder-live-data.md)).

- A route is a `routes` row for one crew and date; a stop is a `route_stops` row, which is the visit's crew assignment. Display fields come from the visit, its job, client and property.
- Available jobs are the date's `scheduled` visits with no stop.
- A route's label is its crew's name, since a crew has one route a day.
- Arrival windows show in the browser's local time.
- Writes are the `security invoker` functions in [crews-routing.md](../database/tables/crews-routing.md#route-builder-functions).

**States**:

- Loading: a skeleton board; Create route is disabled.
- Error: an alert with the message and Try again; the date filter stays usable.
- No routes for the date: "A fresh start". No free crew: the crew dropdown is disabled with a note ("Every crew already has a route on this date", or "no crews yet" with a pointer to Teams).
- An empty route shows "Empty route". The pool shows "No matching visits" for a search with no hits and "Everything is routed" when nothing is waiting.
- Locked: a `published`, `in_progress` or `completed` route shows a lock and its status. Its crew dropdown, stop controls and drag are disabled, it takes no drops, and it is not offered as a move target.
- Pending: a stop added a moment ago, before the server has given it an id, cannot be dragged or edited until the refetch lands.

**Interactions**:

- Create route makes a draft for the chosen crew and date and selects it. A crew is required because `routes.crew_id` is not null (see Decisions).
- Changing a route's crew builds a route for the new crew, keeps the stops, and removes the old route, so the route's id changes and the selection follows. A crew with a route that day is disabled in the dropdown.
- Drag a visit card from Available jobs onto any open route, a stop between routes, or a stop back onto Available jobs. A drop onto a route appends. Regions highlight while accepting a drag. The drag carries a JSON payload on a custom MIME type, and a payload that is stale, unknown, or for a locked route changes nothing.
- Add, remove, Move to route (dropdown plus Move), and up/down controls are the keyboard and touch equivalents; they call the same procedures. A live status announces each change and each refused action.
- Search matches customer, address, job number and service title in the pool.
- Moves, adds, removes and reorders update the board first. If the server refuses, the board is restored to the snapshot and a toast reports the error; after every mutation the board refetches. Mutations run one at a time, in the order made. Create, crew change and delete wait for the server.

- Build routes from service areas calls `routes.generateDrafts` for the date. While it runs the button reads "Building routes…" and is disabled. On success a result panel (`role=status`) states how many visits were placed on how many new routes, says when visits went onto routes that already existed, and says how many eligible visits remain when the per-call cap (500) was hit. Each visit it could not place is listed with its customer and address, the reason, and a way to fix it:

  | Reason             | Shown as                          | Fix offered                                                        |
  | ------------------ | --------------------------------- | ------------------------------------------------------------------ |
  | `no_location`      | No map location                   | Link to the client, to set the location                            |
  | `no_area`          | Outside every service area        | Link to Settings (service areas); or give the job a preferred crew |
  | `area_has_no_crew` | Area has no crew                  | Link to Settings, to assign a crew to the area                     |
  | `crew_archived`    | Crew is archived                  | Link to Teams                                                      |
  | `route_locked`     | Crew's route is already published | Add the visit to an open route by hand                             |

  The panel is dismissable and clears when the date changes. After a run the board refetches routes and the pool. A failure shows an alert with the server's message and "Nothing was changed"; the button works again. Running it twice places nothing new. Pool cards show the job's preferred crew, the service area with its crew, or "Outside every service area" / "No map location". The card shows the area's default crew; the weekday rotation is applied only by the server when it builds.
  **Decisions**:

- **Crew at creation.** The earlier prototype made crew-less templates, which have no database row. A route now needs a crew when it is created, and changing the crew replaces the route inside one transaction. Making `crew_id` nullable would have changed the routes contract and is left for Eric to decide.
- **Editable statuses.** Only `draft` and `optimized` routes change; the database functions enforce it.
- **Build is a button, not automatic** (roadmap Q6). Stops are ordered by straight-line distance only (nearest neighbour, then 2-opt) and carry a distance but no travel time or arrival; road-based ordering and ETAs arrive with the optimizer.
- **Reorder.** Up/down send the route's whole new order (`reorderStops`); drag between routes sends one move (`moveStop`).

**Origin**: Built from the approved [Route Builder template plan](../plans/route-builder-template.md) (PR #63) and the [live data plan](../plans/route-builder-live-data.md), following the maps roadmap (PR #89).

**Optimize routes** (phase 5): a card under Build routes, shown when the viewer can manage jobs.

- It explains that it orders open routes by real road travel time, using the crew's start and shift, visit durations and arrival windows. Stops stay with their crew, locked stops keep their position, published routes are untouched.
- The button reads "Optimize routes", or "Optimizing…" (disabled, `aria-busy`) while a run is queued or running. It is disabled, with a note giving the reason, when the server has no optimizer ("No route optimizer is set up…"), while the info loads, when the board has not loaded, or when no draft or optimized route has stops.
- Run state (`role=status` / `alert`, polled every two seconds): waiting to start, working, done (time, a note when routes were skipped, and how many visits could not be fit), or failed (the plain reason and "Routes were not changed"). A refused start (for example a run already active for the date) shows "The optimization did not start". The board refetches when a run ends.
- A list of optimized routes shows each route's distance, total time and an "Up to date" or "Out of date" badge. A route is out of date once a stop is added, removed, moved or reordered, or the route changes after the run. A note says to optimize again.
- Route cards show distance and total time, and each stop "Arrive 9:12 a.m. · 6 min drive". Stops the solver could not fit, or with no map location, have no time.
- The selected route's map draws the decoded road polyline instead of straight lines (`MapRoute.path` takes any vertices; no change to `MapView`). The caption says when the line is out of date.
- Decisions: the optimizer reorders within a route and never moves a visit between crews; the straight-line order is the fallback and default; polylines are encoded at precision 5 and stored in `routes.polyline`. Setup is in the [ops guide](../ops/optimizer.md); data in [ADR 0015](../database/decisions/0015-optimizer-integration.md).
- Code: `OptimizePanel.tsx`, `optimize-format.ts`, `useOptimization` in `src/integrations/routes/routes.ts`; server in `src/server/optimizer/` and `src/server/trusted/optimization-runner.ts`.
- Verification: `routes.optimize.test.ts` (role gating, cross-tenant, multi-org, provider failure, malformed solver response, locked stops, double press, stale flag), `src/server/optimizer/*.test.ts`, `optimization-runner.test.ts`, `supabase/tests/optimizer_apply_results_test.sql` (run on a local Postgres shim, not on Supabase), and stories for every panel state plus a live optimize. Not exercised against a real VROOM/OSRM.
- **Shots**: pending (large-file uploads are refused in the build environment).

**Plan**: [Auto-assign routes](../plans/auto-assign-routes.md) (stacked on the live data plan).

**Code**: `src/routes/_authed/route-builder.tsx`, `src/components/route-builder/RouteBuilder.tsx` (props-driven view), `DraftRoutesPanel.tsx` (build button and result), `RouteBuilderLive.tsx` (wiring), `RouteBuilder.stories.tsx`, `src/integrations/routes/routes.ts` (queries, optimistic mutations), `src/integrations/trpc/routes.ts`.

**Verification**: Procedure tests (`routes.test.ts`, `routes.mutations.test.ts`) cover the org filter, role gating, cross-tenant and multi-org callers, validation and error mapping. `src/integrations/routes/routes.test.ts` covers the optimistic patches. The pgTAP file `supabase/tests/route_builder_rpcs_test.sql` covers the functions. Stories cover loading, error, empty, locked and populated states and button and drag actions. Against an in-memory tRPC link with the real hooks they cover load, move, add, reorder, remove, failed-move rollback, create, delete, crew change, date change and retry. Build routes: `routes.generate.test.ts` (access, org scoping, errors, result shape), `supabase/tests/generate_draft_routes_test.sql` (assignment, rotation, preferred crew, each reason, overlap priority, idempotency, locked and published routes, the cap, cross-org, roles), and stories for the result, each reason, progress, failure, hidden button and the live refresh. Not yet exercised against a live Supabase project: the migration is unapplied there.

**Shots**: pending. Git LFS uploads are refused in the environment that built this, so the old mock screenshots were removed rather than left describing a different screen.
