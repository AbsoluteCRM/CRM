See the [design record README](../design/README.md) for the visual system and screen-spec conventions.

| Screen        | Route            | What it shows                                                                      |
| ------------- | ---------------- | ---------------------------------------------------------------------------------- |
| Route Builder | `/route-builder` | The day's real routes, the scheduled visits not yet routed, and a map of one route |

## Route Builder

**Route**: `/route-builder`

**Roles**: Owner, admin, and dispatcher use the builder. Workers receive the existing PageShell access-denied card, including on direct navigation, and the procedures refuse them as well (`can.manageJobs`; RLS on routes, stops and visits is office staff only).

**Layout**: The PageShell cream surface precedes three sections.

- **Create route** pairs the page-level date filter with a crew dropdown and a Create route button. The dropdown lists only crews with no route on that date and preselects the first.
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

**Decisions**:

- **Crew at creation.** The earlier prototype made crew-less templates, which have no database row. A route now needs a crew when it is created, and changing the crew replaces the route inside one transaction. Making `crew_id` nullable would have changed the routes contract and is left for Eric to decide.
- **Editable statuses.** Only `draft` and `optimized` routes change; the database functions enforce it.
- **Reorder.** Up/down send the route's whole new order (`reorderStops`); drag between routes sends one move (`moveStop`).

**Origin**: Built from the approved [Route Builder template plan](../plans/route-builder-template.md) (PR #63) and the [live data plan](../plans/route-builder-live-data.md), following the maps roadmap (PR #89).

**Code**: `src/routes/_authed/route-builder.tsx`, `src/components/route-builder/RouteBuilder.tsx` (props-driven view), `RouteBuilderLive.tsx` (wiring), `RouteBuilder.stories.tsx`, `src/integrations/routes/routes.ts` (queries, optimistic mutations), `src/integrations/trpc/routes.ts`.

**Verification**: Procedure tests (`routes.test.ts`, `routes.mutations.test.ts`) cover the org filter, role gating, cross-tenant and multi-org callers, validation and error mapping. `src/integrations/routes/routes.test.ts` covers the optimistic patches. The pgTAP file `supabase/tests/route_builder_rpcs_test.sql` covers the functions. Stories cover loading, error, empty, locked and populated states and button and drag actions. Against an in-memory tRPC link with the real hooks they cover load, move, add, reorder, remove, failed-move rollback, create, delete, crew change, date change and retry. Not yet exercised against a live Supabase project: the migration is unapplied there.

**Shots**: pending. Git LFS uploads are refused in the environment that built this, so the old mock screenshots were removed rather than left describing a different screen.
