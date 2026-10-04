# Time tracking

Time is tracked at two levels:

- **Shifts** are the payroll hours: clock-in to clock-out for the workday.
- **Visit time entries** are job costing: time on site per visit, per
  worker.

Drive and idle time is the shift time not covered by visit entries. Labor
cost = hours × the member's hourly rate in effect on that day (see
[`member_pay_rates`](tenancy.md#member_pay_rates)). Payroll runs outside the
app; the app only exports hours and cost.

Standard columns are described in the [README](../README.md#conventions).

## Enums

| Enum          | Values                  |
| ------------- | ----------------------- |
| `time_source` | `app`, `manual`, `auto` |

`auto` means the system created the entry, e.g. from visit start and finish
buttons.

## `shifts`

| Column          | Type          | Null | Default | Notes                                                                |
| --------------- | ------------- | ---- | ------- | -------------------------------------------------------------------- |
| `member_id`     | `uuid`        | no   |         | Composite FK → `organization_members`, on delete restrict            |
| `route_id`      | `uuid`        | yes  |         | Composite FK → `routes`, on delete set null. The day's route, if any |
| `clock_in`      | `timestamptz` | no   |         |                                                                      |
| `clock_out`     | `timestamptz` | yes  |         | Null while on shift. Check `> clock_in`                              |
| `break_minutes` | `integer`     | no   | `0`     | Check `>= 0`                                                         |
| `source`        | `time_source` | no   | `'app'` |                                                                      |
| `notes`         | `text`        | yes  |         |                                                                      |
| `approved_by`   | `uuid`        | yes  |         | FK → `auth.users`                                                    |
| `approved_at`   | `timestamptz` | yes  |         | An approved shift is locked for workers                              |

Constraints and indexes:

- **Exclusion constraint** (btree_gist):
  `exclude using gist (member_id with =, tstzrange(clock_in, clock_out, '[)') with &&)`.
  A member can't have overlapping shifts. An open shift (`clock_out` null)
  extends to infinity, which also means a member can have at most one open
  shift.
- `(organization_id, clock_in desc)`, `(organization_id, member_id, clock_in desc)`

## `visit_time_entries`

| Column       | Type          | Null | Default | Notes                                                     |
| ------------ | ------------- | ---- | ------- | --------------------------------------------------------- |
| `visit_id`   | `uuid`        | no   |         | Composite FK → `visits`, on delete cascade                |
| `member_id`  | `uuid`        | no   |         | Composite FK → `organization_members`, on delete restrict |
| `started_at` | `timestamptz` | no   |         |                                                           |
| `ended_at`   | `timestamptz` | yes  |         | Check `> started_at`                                      |
| `source`     | `time_source` | no   | `'app'` |                                                           |

Constraints and indexes:

- Exclusion: `(member_id with =, tstzrange(started_at, ended_at, '[)') with &&)`,
  so a worker can't be on two visits at once.
- `(organization_id, visit_id)`, `(organization_id, member_id, started_at desc)`

When a crew taps "Start visit", the app inserts one entry per
`route_members` member and sets `visits.actual_start`. "Finish" closes the
open entries and sets `actual_end`.

## Reporting (views, not tables)

- `public.labor_cost_report` (`security_invoker` view). The pay rates' RLS
  limits it to owner/admin. For each shift, hours
  = `(clock_out - clock_in) - break_minutes`, multiplied by the rate in
  effect on `clock_in::date` (org timezone).
- Job costing: `visit_time_entries` hours × rate, summed per job and compared
  against invoiced revenue.

## Behaviour (as built)

Migration `20260929202750_time_tracking`. Tested in
`supabase/tests/time_tracking_test.sql`.

**Constraints**:

- `shifts_no_overlap` and `visit_time_entries_no_overlap` are GiST exclusion
  constraints on `(member_id, tstzrange(start, end, '[)'))`. An open entry
  extends to infinity, so it also means at most one open shift or visit
  entry per person (`23P01`).
- Breaks must be shorter than the shift, and an approved shift must be
  closed (`23514`).
- `route_id` uses `on delete set null (route_id)`.

**RLS** (via the new uncorrelated helper `private.my_member_ids()`):

| Actor        | shifts                                                                                                                  | visit_time_entries                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| office staff | S I U D                                                                                                                 | S I U D                                                                         |
| worker       | S own. I own, unapproved only. U own only while `clock_out is null` and unapproved, and the result must stay unapproved | S own. I own, only on `worker_visit_ids()`. U own only while `ended_at is null` |

**`public.labor_cost_report`** (a `security_invoker` view): one row per
closed shift, with these columns:

- `work_date` (org-local)
- `hours` = (clock_out − clock_in − break), to 2 decimal places
- `hourly_rate_cents` (the rate in effect on `work_date`)
- `labor_cost_cents`

Because it runs as the invoker, a worker sees their own hours with a null
rate, and owner/admin see everything. `anon` has no grant.
