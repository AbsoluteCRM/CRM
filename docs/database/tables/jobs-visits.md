# Jobs & visits

A **job** is an agreement to do work at a property. It is either one-off or
recurring (iCal RRULE). A **visit** is one concrete trip to the property on a
given day. Visits are what crews get routed to, what workers complete, and
what invoices bill. Recurring jobs **materialize** visits a rolling N weeks
ahead (see [ADR 0005](../decisions/0005-rrule-materialized-visits.md)).

Standard columns are described in the [README](../README.md#conventions).

## Enums

| Enum               | Values                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `job_kind`         | `one_off`, `recurring`                                                                    |
| `job_status`       | `active`, `on_hold`, `completed`, `cancelled`                                             |
| `job_billing_mode` | `per_visit`, `periodic`                                                                   |
| `billing_period`   | `monthly` (more may be added)                                                             |
| `visit_status`     | `unscheduled`, `scheduled`, `in_progress`, `completed`, `skipped`, `cancelled`, `no_show` |

## `jobs`

| Column                   | Type               | Null | Default       | Notes                                                                                                                  |
| ------------------------ | ------------------ | ---- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `number`                 | `text`             | no   |               | `J-1001`, set by trigger. `unique (organization_id, number)`                                                           |
| `client_id`              | `uuid`             | no   |               | Composite FK → `clients`, on delete restrict                                                                           |
| `property_id`            | `uuid`             | no   |               | Composite FK → `properties`, on delete restrict. Must belong to client                                                 |
| `quote_id`               | `uuid`             | yes  |               | Composite FK → `quotes`, on delete set null. **Unique**                                                                |
| `kind`                   | `job_kind`         | no   | `'one_off'`   |                                                                                                                        |
| `status`                 | `job_status`       | no   | `'active'`    |                                                                                                                        |
| `title`                  | `text`             | no   |               |                                                                                                                        |
| `instructions`           | `text`             | yes  |               | Shown to workers on every visit                                                                                        |
| `internal_notes`         | `text`             | yes  |               |                                                                                                                        |
| `billing_mode`           | `job_billing_mode` | no   | `'per_visit'` | `per_visit`: invoice each completed visit. `periodic`: batch per period                                                |
| `billing_period`         | `billing_period`   | yes  |               | Required when `billing_mode = 'periodic'` (check)                                                                      |
| `rrule`                  | `text`             | yes  |               | RFC 5545 RRULE, **without** DTSTART, e.g. `FREQ=WEEKLY;INTERVAL=1;BYDAY=TU`. Required iff `kind = 'recurring'` (check) |
| `start_date`             | `date`             | no   |               | DTSTART (in org timezone). For one-off jobs, the target date                                                           |
| `end_date`               | `date`             | yes  |               | Last date visits may be generated. Check `>= start_date`                                                               |
| `window_start`           | `time`             | yes  |               | Customer arrival window start, local time. Null (with `window_minutes`) = anytime                                      |
| `window_minutes`         | `integer`          | yes  |               | Window length, 1 to 1440. Lets a window run past midnight (22:00 for 360)                                              |
| `visit_duration_minutes` | `integer`          | no   | `60`          | Check `> 0`. Copied to each visit                                                                                      |
| `preferred_crew_id`      | `uuid`             | yes  |               | Composite FK → `crews`, on delete set null. A hint to the optimizer                                                    |
| `generated_through`      | `date`             | yes  |               | Materialization watermark: visits exist up to this date                                                                |
| `created_by`             | `uuid`             | yes  |               | FK → `auth.users`                                                                                                      |

Indexes:

- `unique (organization_id, id)`
- `(organization_id, status)`, `(organization_id, client_id)`, `(organization_id, property_id)`
- `(organization_id, generated_through) where kind = 'recurring' and status = 'active'`, for the nightly generator

## `job_line_items`

The price of **one visit**, and the template for invoice lines. Periodic
billing bills each completed visit in the period at these lines, grouped on
one invoice.

| Column             | Type            | Null | Default | Notes                                           |
| ------------------ | --------------- | ---- | ------- | ----------------------------------------------- |
| `job_id`           | `uuid`          | no   |         | Composite FK → `jobs`, on delete cascade        |
| `service_id`       | `uuid`          | yes  |         | Composite FK → `services`, on delete set null   |
| `position`         | `integer`       | no   |         |                                                 |
| `description`      | `text`          | no   |         |                                                 |
| `quantity`         | `numeric(10,2)` | no   | `1`     | Check `> 0`                                     |
| `unit_price_cents` | `bigint`        | no   |         | Check `>= 0`                                    |
| `amount_cents`     | `bigint`        | no   | —       | Generated: `round(quantity * unit_price_cents)` |

Workers don't read this table directly; `worker_route_stops` returns a visit price
only when `organizations.settings.workers_see_prices` is true.

## `job_line_item_taxes`

Which tax rates apply to a job line (replaces the old `tax_rate_ids uuid[]`,
which couldn't have a foreign key). Has no `id` column. PK
`(organization_id, line_item_id, tax_rate_id)`; composite FKs to
`job_line_items` (cascade) and `tax_rates` (restrict). Invoices snapshot the
rate when they are created. `guard_tax_rate_usable` rejects archived rates for
API inserts.

## `visits`

| Column                   | Type           | Null | Default       | Notes                                                                                    |
| ------------------------ | -------------- | ---- | ------------- | ---------------------------------------------------------------------------------------- |
| `job_id`                 | `uuid`         | no   |               | Composite FK → `jobs`, on delete cascade                                                 |
| `property_id`            | `uuid`         | no   |               | Composite FK → `properties`. Copied from the job so routing needs no join                |
| `occurrence_date`        | `date`         | yes  |               | The RRULE date this visit came from. Null for manually added visits                      |
| `status`                 | `visit_status` | no   | `'scheduled'` |                                                                                          |
| `scheduled_date`         | `date`         | yes  |               | Day it will happen (org timezone). Null only when `unscheduled` (check)                  |
| `window_start`           | `timestamptz`  | yes  |               | Arrival window, resolved to instants in the org timezone                                 |
| `window_end`             | `timestamptz`  | yes  |               | Check `> window_start`                                                                   |
| `duration_minutes`       | `integer`      | no   |               | Check `> 0`. Expected time on site, fed to the optimizer                                 |
| `is_exception`           | `boolean`      | no   | `false`       | Set when a person moves or edits a generated visit. Regeneration never touches it        |
| `instructions`           | `text`         | yes  |               | Visit-specific additions to the job instructions                                         |
| `actual_start`           | `timestamptz`  | yes  |               | Set when the crew starts                                                                 |
| `actual_end`             | `timestamptz`  | yes  |               | Check `>= actual_start`, and requires `actual_start` (constraint `visits_actuals_check`) |
| `completed_by_member_id` | `uuid`         | yes  |               | Composite FK → `organization_members`                                                    |
| `completion_notes`       | `text`         | yes  |               |                                                                                          |

Constraints and indexes:

- `unique (organization_id, id)`
- `unique (job_id, occurrence_date)`: makes generation idempotent (`insert … on conflict do nothing`)
- `(organization_id, scheduled_date, status)`: the dispatch board and optimizer input
- `(organization_id, job_id)`, `(organization_id, property_id)`

A visit's crew comes from its row in
[`route_stops`](crews-routing.md#route_stops). A visit without a stop is
unassigned.

### Visit generation

1. An app-side generator (the `rrule` npm package) expands `jobs.rrule` from
   `start_date` up to `min(end_date, today + visit_horizon_weeks)` in the org
   timezone.
2. For each date after `generated_through`, it inserts a visit with
   `occurrence_date = scheduled_date = date` and resolves the window. On
   conflict it does nothing.
3. It then sets `jobs.generated_through`.
4. **Triggers**: pg_cron runs nightly through a Supabase Edge Function or app
   endpoint (via `pg_net`). It also runs whenever a job is created or its
   rrule or dates change.
5. **Editing a rule**: future visits that are `scheduled`, non-exception, and
   not on a published route are deleted, the watermark is reset, and the
   visits are regenerated.

## `attachments`

Photos and files attached to a record. Files live in the Supabase Storage
bucket `org-files` at `{organization_id}/{table}/{record_id}/{uuid}.{ext}`,
and storage RLS checks the first path segment against the user's
memberships.

| Column              | Type      | Null | Default | Notes                                          |
| ------------------- | --------- | ---- | ------- | ---------------------------------------------- |
| `storage_path`      | `text`    | no   |         | Unique                                         |
| `mime_type`         | `text`    | no   |         |                                                |
| `size_bytes`        | `bigint`  | no   |         |                                                |
| `caption`           | `text`    | yes  |         |                                                |
| `uploaded_by`       | `uuid`    | yes  |         | FK → `auth.users`                              |
| `client_id`         | `uuid`    | yes  |         | Composite FK → `clients`, on delete cascade    |
| `property_id`       | `uuid`    | yes  |         | Composite FK → `properties`, on delete cascade |
| `job_id`            | `uuid`    | yes  |         | Composite FK → `jobs`, on delete cascade       |
| `visit_id`          | `uuid`    | yes  |         | Composite FK → `visits`, on delete cascade     |
| `quote_id`          | `uuid`    | yes  |         | Composite FK → `quotes`, on delete cascade     |
| `is_client_visible` | `boolean` | no   | `false` | Shown in the portal (e.g. before/after photos) |

Check: `num_nonnulls(client_id, property_id, job_id, visit_id, quote_id) = 1`.
Each owner FK gets an `(organization_id, x_id)` index. `storage_path` must start with `{organization_id}/` (check).

## Behaviour (as built)

Migrations `20260929201255_jobs_visits` and
`20260929201447_fix_visit_actuals_check`.

**Jobs**

- `number` is set by the `assign_number` trigger (`J-1001`).
- FK `(organization_id, client_id, property_id) → properties`, so the
  property must belong to the client.
- `unique (organization_id, quote_id)`: a quote converts into at most one
  job.
- Checks:
  - `kind = 'recurring'` if and only if `rrule` is set
  - the rrule has `FREQ=` and no `DTSTART`
  - `periodic` billing requires `billing_period`
  - `window_start` and `window_minutes` are both set or both null
- **From a quote** (after insert, when `quote_id` is set): the quote must be
  `approved` and for the same client. It moves to `converted`, and its
  counted lines are copied into `job_line_items`, with their `job_line_item_taxes` taken
  from the quote line taxes. Otherwise `23514`.
- **One-off jobs** (after insert, `kind = 'one_off'`): the single visit is
  created on `start_date` and `generated_through = start_date`.
- **Property change**: `unscheduled` and `scheduled` visits move with the job.

**Visits**

- Before insert: `property_id` is always copied from the job, and
  `duration_minutes` defaults to the job's.
- Before update:
  - A visit with a live invoice (`invoice_visits` row, not void) can't change
    `status`, `scheduled_date`, `property_id`, or `duration_minutes` (`55000`).
  - `in_progress` stamps `actual_start`.
  - `completed` stamps both actuals when they're unset.
  - For generated visits (`occurrence_date` set), changing the date, window,
    or duration, or moving to `skipped`, `cancelled`, or `unscheduled`, sets
    `is_exception = true`.

**Generation RPCs** (`security definer`: office staff, checked against the job's
organization, or trusted code with no `auth.uid()`):

| Function                                              | Does                                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate_visits(job_id, dates date[], through date)` | Inserts one visit per date within `[start_date, end_date]` and `(generated_through, through]`. Windows are resolved in the org timezone. `on conflict do nothing`. Advances `generated_through` and returns the count |
| `reset_job_schedule(job_id, from date default today)` | Deletes generated, non-exception, `scheduled` visits on or after `from`. Rewinds `generated_through` to `from - 1` and returns the count. The routing migration also keeps routed visits                              |

The nightly job that calls the app-side RRULE expander (pg_cron plus
`pg_net`) is **not scheduled yet**. It's added once the endpoint exists.

**Storage**: private bucket `org-files`, paths
`{org}/{clients|properties|jobs|visits|quotes}/{parent id}/{file}` (enforced on
`attachments.storage_path` by a check). Policies on `storage.objects`:

- **Read and upload**: office staff in their org's folder, and workers under
  `{org}/visits/{visit_id}/` for visits on their routes (upload only while the
  route is published or in progress).
- **Update and delete**: office staff only.

**RLS**: office staff only on `jobs`, `job_line_items`, `job_line_item_taxes`,
`visits`, and `attachments`. Workers act through `worker_*` RPCs.

**Portal RPCs**:

- `portal_my_jobs()`
- `portal_my_visits(from date default null, to date default null)`: excludes
  `cancelled` visits, and returns `completed_at` (`actual_end`) and
  `completion_notes`
