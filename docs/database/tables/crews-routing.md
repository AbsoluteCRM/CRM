# Crews & routing

A **crew** is a team, usually one truck, that works a route. A crew can be a
single worker. `crew_members` is the crew's **default** roster.
`route_members` is who is actually on the truck that day. A **route** is one
crew's ordered list of **stops** (visits) on one date. An external optimizer
builds routes and stops from a day's visits; see
[ADR 0006](../decisions/0006-external-route-optimizer.md).

Standard columns are described in the [README](../README.md#conventions).

## Enums

| Enum                  | Values                                                        |
| --------------------- | ------------------------------------------------------------- |
| `route_status`        | `draft`, `optimized`, `published`, `in_progress`, `completed` |
| `optimization_status` | `queued`, `running`, `succeeded`, `failed`                    |

`draft` and `optimized` routes are visible to office staff only. Workers see
a route once it's `published`, and a published route is locked against
re-optimization unless someone first moves it back to `draft`.

## `crews`

| Column                   | Type                    | Null | Default   | Notes                                       |
| ------------------------ | ----------------------- | ---- | --------- | ------------------------------------------- |
| `name`                   | `text`                  | no   |           | Unique per org among non-archived rows      |
| `color`                  | `text`                  | yes  |           | `#rrggbb`                                   |
| `vehicle`                | `text`                  | yes  |           | Truck name or plate                         |
| `default_start_location` | `geography(Point,4326)` | yes  |           | Yard or shop. Falls back to the org address |
| `default_end_location`   | `geography(Point,4326)` | yes  |           | Null = return to start                      |
| `default_start_time`     | `time`                  | no   | `'08:00'` | Local time                                  |
| `max_work_minutes`       | `integer`               | yes  |           | Daily capacity passed to the optimizer      |
| `archived_at`            | `timestamptz`           | yes  |           |                                             |

## `crew_members`

Has no `id` column.

| Column            | Type      | Null | Default | Notes                                                             |
| ----------------- | --------- | ---- | ------- | ----------------------------------------------------------------- |
| `organization_id` | `uuid`    | no   |         |                                                                   |
| `crew_id`         | `uuid`    | no   |         | Composite FK → `crews`, on delete cascade. PK part                |
| `member_id`       | `uuid`    | no   |         | Composite FK → `organization_members`, on delete cascade. PK part |
| `is_lead`         | `boolean` | no   | `false` | Partial unique: one lead per crew                                 |

Index `(organization_id, member_id)`. A worker may belong to more than one
crew's default roster.

## `routes`

| Column                | Type                    | Null | Default   | Notes                                                  |
| --------------------- | ----------------------- | ---- | --------- | ------------------------------------------------------ |
| `crew_id`             | `uuid`                  | no   |           | Composite FK → `crews`, on delete restrict             |
| `route_date`          | `date`                  | no   |           | Org timezone                                           |
| `status`              | `route_status`          | no   | `'draft'` |                                                        |
| `start_location`      | `geography(Point,4326)` | yes  |           | Copied from the crew default. Editable per day         |
| `end_location`        | `geography(Point,4326)` | yes  |           |                                                        |
| `planned_start`       | `timestamptz`           | yes  |           |                                                        |
| `planned_end`         | `timestamptz`           | yes  |           | From the optimizer                                     |
| `total_distance_m`    | `integer`               | yes  |           |                                                        |
| `total_duration_s`    | `integer`               | yes  |           | Drive time plus time on site                           |
| `polyline`            | `text`                  | yes  |           | Encoded polyline for drawing the map                   |
| `optimization_run_id` | `uuid`                  | yes  |           | Composite FK → `optimization_runs`, on delete set null |
| `published_at`        | `timestamptz`           | yes  |           |                                                        |

`unique (crew_id, route_date)`. Index `(organization_id, route_date)`.

## `route_members`

The actual people on a route that day. It's seeded from `crew_members` when
the route is created and can be edited (for sick days or swaps). Workers' scope comes from this table (through `worker_*` RPCs). Has no `id`
column.

| Column            | Type   | Null | Default | Notes                                                                          |
| ----------------- | ------ | ---- | ------- | ------------------------------------------------------------------------------ |
| `organization_id` | `uuid` | no   |         |                                                                                |
| `route_id`        | `uuid` | no   |         | Composite FK → `routes`, on delete cascade. PK part                            |
| `member_id`       | `uuid` | no   |         | Composite FK → `organization_members`, on delete cascade. PK part              |
| `route_date`      | `date` | no   |         | Copied from the route (composite FK `(organization_id, route_id, route_date)`) |

`unique (organization_id, member_id, route_date)` rejects placing a member on two
routes on the same date (a real constraint, so concurrent bookings can't both pass).

## `route_stops`

A visit's position on a route. **This row is the visit's crew assignment.**

| Column              | Type          | Null | Default | Notes                                                                                                              |
| ------------------- | ------------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `route_id`          | `uuid`        | no   |         | Composite FK → `routes`, on delete cascade                                                                         |
| `visit_id`          | `uuid`        | no   |         | Composite FK → `visits`, on delete cascade. **Unique**                                                             |
| `sequence`          | `integer`     | no   |         | 1-based. `unique (route_id, sequence) deferrable initially deferred`, so stops can be reordered in one transaction |
| `planned_arrival`   | `timestamptz` | yes  |         |                                                                                                                    |
| `planned_departure` | `timestamptz` | yes  |         |                                                                                                                    |
| `travel_distance_m` | `integer`     | yes  |         | From the previous stop (or from the start location)                                                                |
| `travel_duration_s` | `integer`     | yes  |         |                                                                                                                    |
| `is_locked`         | `boolean`     | no   | `false` | The dispatcher pinned this stop's crew and position; the optimizer keeps it                                        |

A trigger requires `visits.scheduled_date = routes.route_date`. If a visit is
rescheduled to another date, its stop is deleted.

## `optimization_runs`

An audit trail of each call to the optimizer. One run can cover every crew
for a date, and assign visits across crews.

| Column                 | Type                  | Null | Default    | Notes                                           |
| ---------------------- | --------------------- | ---- | ---------- | ----------------------------------------------- |
| `route_date`           | `date`                | no   |            |                                                 |
| `status`               | `optimization_status` | no   | `'queued'` |                                                 |
| `provider`             | `text`                | no   |            | `google_route_optimization`, `mapbox`, `vroom`… |
| `requested_by`         | `uuid`                | yes  |            | FK → `auth.users`                               |
| `crew_ids`             | `uuid[]`              | no   |            | Crews included                                  |
| `error`                | `text`                | yes  |            |                                                 |
| `unassigned_visit_ids` | `uuid[]`              | no   | `'{}'`     | Visits the solver couldn't fit                  |
| `started_at`           | `timestamptz`         | yes  |            |                                                 |
| `finished_at`          | `timestamptz`         | yes  |            |                                                 |

Index `(organization_id, route_date desc)`. Office staff can read, insert,
and update runs.

## `optimization_run_payloads`

The raw solver request and response, one row per run. It's a separate table
instead of revoked columns on `optimization_runs`, because a column-level
REVOKE breaks `select *`, which supabase-js issues by default ([ADR 0009](../decisions/0009-supabase-js-data-access.md)). RLS is
enabled with **no policies**, so it's service role only. PK
`(organization_id, run_id)`, a composite FK to `optimization_runs`, on
delete cascade.

| Column     | Type    | Null |
| ---------- | ------- | ---- |
| `request`  | `jsonb` | yes  |
| `response` | `jsonb` | yes  |

## Optimization flow

1. A dispatcher picks a date and crews. The server inserts an
   `optimization_runs` row (`queued`).
2. The server collects inputs: that date's `visits` with status `scheduled`
   (with location, window, and duration), `routes` and `crews` (start/end,
   capacity), and locked `route_stops`.
3. The external solver returns an ordered set of stops per crew.
4. In one transaction, the server upserts `routes` (`optimized`), replaces
   the unlocked `route_stops`, and marks the run `succeeded`.
5. The dispatcher reviews the result and publishes it
   (`published`, `published_at`).

## Behaviour (as built)

Migration `routing`.

**Keys**:

- `routes`: `unique (organization_id, crew_id, route_date)`, and
  `unique (organization_id, id, route_date)` as the FK target that carries the
  date to `route_members`
- `route_stops`:
  - `unique (organization_id, visit_id)`: a visit is on at most one route
  - `unique (organization_id, route_id, sequence) deferrable initially deferred`
- `route_members`: PK `(organization_id, route_id, member_id)`, and
  `unique (organization_id, member_id, route_date)`

**Triggers**:

| Table               | Trigger                 | Does                                                                                                                                                                    |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes`            | before insert           | Copies start and end location and `planned_start` (route date + crew start time, org timezone) from the crew                                                            |
| `routes`            | after insert            | Seeds `route_members` from active `crew_members`; anyone already routed that day is skipped (`on conflict do nothing`)                                                  |
| `routes`            | before update of status | Stamps `published_at` when the route is published                                                                                                                       |
| `route_members`     | before insert           | Copies `route_date` from the route (the composite FK proves it)                                                                                                         |
| `route_stops`       | before insert/update    | The visit's `scheduled_date` must equal `route_date` (`23514`); the visit row is locked on every write (a concurrent reschedule can deadlock with it: retry on `40P01`) |
| `visits`            | after update of date    | A rescheduled visit's stop on the old date is deleted                                                                                                                   |
| `optimization_runs` | before insert/update    | `crew_ids` and `unassigned_visit_ids` may only name this organization's crews and visits (`23503`)                                                                      |

Routes' `crew_id` and `route_date` aren't updatable through the API: build a
new route instead of moving one.

`reset_job_schedule()` (a `security definer` function with an office-role
check) never deletes a visit that has a route stop.

## Worker access

Workers have no table policies on routes, stops, visits, jobs, properties, or
clients. They read and act through `worker_*` RPCs
([ADR 0011](../decisions/0011-worker-rpcs.md)):

| Function                                                                | Does                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker_my_routes(date)`                                                | The caller's published, in-progress, or completed routes on a date, across organizations                                                          |
| `worker_route_stops(route_id)`                                          | Stops with crew-safe columns (address, access notes, client name and phone, instructions, the window, status; price only if `workers_see_prices`) |
| `worker_start_visit` / `worker_join_visit`                              | The first worker starts a scheduled visit; other rostered workers join to open their own time entry                                               |
| `worker_complete_visit` / `worker_mark_no_show`                         | Records the caller, stamps server times, and closes every open time entry                                                                         |
| `worker_add_attachment`, `worker_clock_in` / `_out`, `worker_my_shifts` | Photos for their visits, and shifts with server-stamped times                                                                                     |

Scope comes from `private.worker_routes()` and `private.worker_visits()`: the
caller's active membership on `route_members` of a route office staff have
published. Actions need a published or in-progress route; completed routes
and billed visits are read-only. Draft and optimized routes are invisible to
workers.
