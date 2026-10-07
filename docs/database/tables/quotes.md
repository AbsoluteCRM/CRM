# Quotes

A quote is a priced proposal sent to a client, optionally for one of their
properties. An approved quote is converted into a [job](jobs-visits.md#jobs),
which copies its counted lines (non-optional lines plus the optional lines
the client selected) into `job_line_items`.

**The database owns the arithmetic.** Line amounts are generated columns.
Tax rows snapshot their rate and compute their own amount. Quote totals are
recalculated by triggers. The app never writes amounts or totals.

Standard columns are described in the [README](../README.md#conventions).
Migration: `20260929200746_quotes`.

## Enums

| Enum           | Values                                                          |
| -------------- | --------------------------------------------------------------- |
| `quote_status` | `draft`, `sent`, `approved`, `declined`, `expired`, `converted` |

Allowed transitions (enforced by the `status_transition` trigger; anything
else raises `23514`):

```
draft → sent → approved → converted
        sent → declined | expired
        sent → draft          (pull back to edit; clears sent_at)
```

Moving to `sent` stamps `sent_at`. Moving to `approved` stamps `approved_at`
and `approved_by_user_id` (the caller).

## `quotes`

| Column                | Type           | Null | Default      | Notes                                                                                        |
| --------------------- | -------------- | ---- | ------------ | -------------------------------------------------------------------------------------------- |
| `number`              | `text`         | no   |              | `Q-1001`, set by the `assign_number` trigger. `unique (organization_id, number)`             |
| `client_id`           | `uuid`         | no   |              | Composite FK → `clients`, on delete restrict                                                 |
| `property_id`         | `uuid`         | yes  |              | FK `(organization_id, client_id, property_id) → properties`, so it must belong to the client |
| `status`              | `quote_status` | no   | `'draft'`    |                                                                                              |
| `title`               | `text`         | no   |              |                                                                                              |
| `message`             | `text`         | yes  |              | Client-facing note                                                                           |
| `internal_notes`      | `text`         | yes  |              | Never returned by portal RPCs                                                                |
| `valid_until`         | `date`         | yes  |              | The `expire-quotes` cron job expires sent quotes past this date (org-local)                  |
| `subtotal_cents`      | `bigint`       | no   | `0`          | Trigger-maintained: sum of **counted** line amounts                                          |
| `tax_cents`           | `bigint`       | no   | `0`          | Trigger-maintained: sum of counted lines' taxes                                              |
| `total_cents`         | `bigint`       | no   | —            | Generated: `subtotal_cents + tax_cents`                                                      |
| `sent_at`             | `timestamptz`  | yes  |              | Set by trigger                                                                               |
| `approved_at`         | `timestamptz`  | yes  |              | Set by trigger                                                                               |
| `approved_by_user_id` | `uuid`         | yes  |              | FK → `auth.users`: the portal user or staff who approved                                     |
| `declined_reason`     | `text`         | yes  |              |                                                                                              |
| `created_by`          | `uuid`         | yes  | `auth.uid()` | FK → `auth.users`                                                                            |

Indexes: `unique (organization_id, id)`,
`(organization_id, status, created_at desc)`,
`(organization_id, client_id, property_id)` (covers both FKs), and one each
on `approved_by_user_id` and `created_by`.

Only `draft` quotes can be deleted (RLS). The conversion link lives on
`jobs.quote_id` (unique), so quotes and jobs don't reference each other in
a cycle.

This migration also added `unique (organization_id, client_id, id)` on
`properties`, the FK target that proves "property belongs to client". Jobs
reuse it.

## `quote_line_items`

| Column             | Type            | Null | Default | Notes                                                        |
| ------------------ | --------------- | ---- | ------- | ------------------------------------------------------------ |
| `quote_id`         | `uuid`          | no   |         | Composite FK → `quotes`, on delete cascade                   |
| `service_id`       | `uuid`          | yes  |         | Composite FK → `services`, `on delete set null (service_id)` |
| `position`         | `integer`       | no   |         | Display order                                                |
| `description`      | `text`          | no   |         |                                                              |
| `quantity`         | `numeric(10,2)` | no   | `1`     | Check `> 0`                                                  |
| `unit_price_cents` | `bigint`        | no   |         | Check `>= 0`                                                 |
| `amount_cents`     | `bigint`        | no   | —       | Generated: `round(quantity * unit_price_cents)::bigint`      |
| `is_optional`      | `boolean`       | no   | `false` | An add-on the client can choose                              |
| `is_selected`      | `boolean`       | no   | `false` | For optional lines: whether the client chose it              |

A line is **counted** toward totals when `not is_optional or is_selected`.

- **Frozen after draft**: lines can be inserted, updated, or deleted only
  while the quote is `draft`. The single exception is `approve_quote`
  changing `is_selected` on a `sent` quote.
- Changing `quantity` or `unit_price_cents` recomputes the line's tax rows.

Indexes: `(organization_id, quote_id, position)`,
`(organization_id, service_id)`.

## `quote_line_item_taxes`

Has no `id` column. PK: `(organization_id, line_item_id, tax_rate_id)`.

| Column            | Type           | Null | Default | Notes                                                       |
| ----------------- | -------------- | ---- | ------- | ----------------------------------------------------------- |
| `organization_id` | `uuid`         | no   |         |                                                             |
| `line_item_id`    | `uuid`         | no   |         | Composite FK → `quote_line_items`, on delete cascade        |
| `tax_rate_id`     | `uuid`         | no   |         | Composite FK → `tax_rates`, on delete restrict              |
| `percentage`      | `numeric(7,4)` | no   |         | **Set by trigger**: a snapshot of the rate                  |
| `amount_cents`    | `bigint`       | no   |         | **Set by trigger**: `round(line amount × percentage / 100)` |

The app inserts only `(organization_id, line_item_id, tax_rate_id)`.
Inserting a tax for a `tax_exempt` client raises `23514`. Tax rows are also
frozen after draft.

Once any quote tax references a `tax_rates` row, that rate's `percentage` can
no longer be edited (`55000`). The invoices migration extends this check to
invoice taxes.

## RLS

Office staff (owner/admin/dispatcher) only, on all three tables. Workers and
other orgs see nothing. `subtotal_cents`, `tax_cents`, `number`, `sent_at`, and
`approved_*` aren't writable through the API: line and tax changes re-total the
quote once per statement (transition-table triggers that lock the quote row).
A sent quote's client, property, title, and message are fixed; send it back to
draft to change them. The `expire-quotes` cron runs hourly.

## Portal RPCs

All are `security definer`, limited to `private.portal_clients()`, and
exclude `draft` quotes and internal columns.

| Function                                                                  | Purpose                                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `portal_my_quotes()`                                                      | The caller's quotes: number, status, title, message, totals, dates                              |
| `portal_quote_lines(quote_id)`                                            | Lines with amount and tax per line, `is_optional`, `is_selected`                                |
| `approve_quote(quote_id, selected_optional_line_ids uuid[] default '{}')` | `sent` → `approved`. Sets `is_selected` on optional lines. Rejects expired quotes. Returns void |
| `decline_quote(quote_id, reason text default null)`                       | `sent` → `declined`. Returns void                                                               |

Errors: `P0002` quote not found or not yours, `55000` wrong status or
expired, `42501` not signed in.

## Scheduled jobs

`expire-quotes` (pg_cron, `15 7 * * *` UTC) moves `sent` quotes whose
`valid_until` is before the org-local date to `expired`.
