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
| `is_active`              | `boolean`               | no   | `true`    |                                             |
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
the route is created and can be edited (for sick days or swaps). **Workers
see visits through this table.** Has no `id` column.

| Column            | Type   | Null | Default | Notes                                                             |
| ----------------- | ------ | ---- | ------- | ----------------------------------------------------------------- |
| `organization_id` | `uuid` | no   |         |                                                                   |
| `route_id`        | `uuid` | no   |         | Composite FK → `routes`, on delete cascade. PK part               |
| `member_id`       | `uuid` | no   |         | Composite FK → `organization_members`, on delete cascade. PK part |

Index `(organization_id, member_id, route_id)`, which the worker RLS uses.
A trigger rejects placing a member on two routes on the same date.

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

Migration `20260929201854_routing`.

**Keys**:

- `routes`: `unique (organization_id, crew_id, route_date)`
- `route_stops`:
  - `unique (organization_id, visit_id)`: a visit is on at most one route
  - `unique (organization_id, route_id, sequence) deferrable initially deferred`
- `route_members`: PK `(organization_id, route_id, member_id)`

**Triggers**:

| Table           | Trigger                 | Does                                                                                                                                                                                       |
| --------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `routes`        | before insert           | Copies start and end location and `planned_start` (route date + crew start time, org timezone) from the crew                                                                               |
| `routes`        | after insert            | Seeds `route_members` from active `crew_members`, skipping anyone already routed that day                                                                                                  |
| `routes`        | before update of status | Stamps `published_at` when the route is published                                                                                                                                          |
| `route_members` | before insert/update    | Rejects a member already on another route that date (`23P01`)                                                                                                                              |
| `route_stops`   | before insert/update    | The visit's `scheduled_date` must equal `route_date` (`23514`)                                                                                                                             |
| `visits`        | after update of date    | A rescheduled visit's stop on the old date is deleted                                                                                                                                      |
| `visits`        | before update           | **Workers** may change only `status` (to `in_progress`, `completed`, or `no_show`), actual times, `completion_notes`, and `completed_by_member_id` (only to themselves). Otherwise `42501` |

`reset_job_schedule()` was redefined here so it never deletes a visit that
has a route stop.

## Worker access

A worker's scope is derived from routes, never stored. These `private`
helpers are uncorrelated, `security definer`, and return `setof uuid`:

| Helper                   | Returns                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `worker_route_ids()`     | Routes where the caller is in `route_members` and the status is `published`, `in_progress`, or `completed` |
| `worker_visit_ids()`     | Visits with a stop on those routes                                                                         |
| `worker_job_ids()`       | Those visits' jobs                                                                                         |
| `worker_property_ids()`  | Those visits' properties                                                                                   |
| `worker_client_ids()`    | Those jobs' clients                                                                                        |
| `worker_price_org_ids()` | Orgs where the caller is a worker and `settings.workers_see_prices` is true                                |

This migration **replaced** the office-only select policies on `visits`,
`jobs`, `job_line_items`, `properties`, `clients`, `client_contacts`, and
`attachments` (plus the update policy on `visits` and the insert policy on
`attachments`). Each is now a single `office OR worker-scope` policy, so
there are never two permissive policies for one action. Draft and optimized
routes are invisible to workers.
