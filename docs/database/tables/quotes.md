# Quotes

A quote is a priced proposal sent to a client for a property. An approved
quote is converted into a [job](jobs-visits.md#jobs), which copies its
non-optional lines, plus any optional lines the client accepted, into
`job_line_items`.

Standard columns are described in the [README](../README.md#conventions).

## Enums

| Enum           | Values                                                          |
| -------------- | --------------------------------------------------------------- |
| `quote_status` | `draft`, `sent`, `approved`, `declined`, `expired`, `converted` |

Allowed transitions: `draft → sent → approved → converted`,
`sent → declined | expired`, and `sent → draft` (re-edit). A trigger enforces
them.

## `quotes`

| Column                | Type           | Null | Default   | Notes                                                             |
| --------------------- | -------------- | ---- | --------- | ----------------------------------------------------------------- |
| `number`              | `text`         | no   |           | `Q-1001`, set by trigger. `unique (organization_id, number)`      |
| `client_id`           | `uuid`         | no   |           | Composite FK → `clients`, on delete restrict                      |
| `property_id`         | `uuid`         | yes  |           | Composite FK → `properties`. Must belong to `client_id` (trigger) |
| `status`              | `quote_status` | no   | `'draft'` |                                                                   |
| `title`               | `text`         | no   |           |                                                                   |
| `message`             | `text`         | yes  |           | Client-facing note                                                |
| `internal_notes`      | `text`         | yes  |           | Never shown in the portal                                         |
| `valid_until`         | `date`         | yes  |           | A pg_cron job marks expired quotes nightly                        |
| `subtotal_cents`      | `bigint`       | no   | `0`       | Trigger-maintained: sum of non-optional line amounts              |
| `tax_cents`           | `bigint`       | no   | `0`       | Trigger-maintained                                                |
| `total_cents`         | `bigint`       | no   | —         | `generated always as (subtotal_cents + tax_cents) stored`         |
| `sent_at`             | `timestamptz`  | yes  |           |                                                                   |
| `approved_at`         | `timestamptz`  | yes  |           |                                                                   |
| `approved_by_user_id` | `uuid`         | yes  |           | FK → `auth.users`: the portal user or staff who approved          |
| `declined_reason`     | `text`         | yes  |           |                                                                   |
| `created_by`          | `uuid`         | yes  |           | FK → `auth.users`                                                 |

Indexes: `unique (organization_id, id)`,
`(organization_id, status, created_at desc)`,
`(organization_id, client_id)`, `(organization_id, property_id)`.

The conversion link lives on `jobs.quote_id` (unique), so quotes and jobs
don't reference each other in a cycle.

## `quote_line_items`

| Column             | Type            | Null | Default | Notes                                                             |
| ------------------ | --------------- | ---- | ------- | ----------------------------------------------------------------- |
| `quote_id`         | `uuid`          | no   |         | Composite FK → `quotes`, on delete cascade                        |
| `service_id`       | `uuid`          | yes  |         | Composite FK → `services`, on delete set null                     |
| `position`         | `integer`       | no   |         | Display order                                                     |
| `description`      | `text`          | no   |         |                                                                   |
| `quantity`         | `numeric(10,2)` | no   | `1`     | Check `> 0`                                                       |
| `unit_price_cents` | `bigint`        | no   |         | Check `>= 0`                                                      |
| `amount_cents`     | `bigint`        | no   | —       | `generated always as (round(quantity * unit_price_cents)) stored` |
| `is_optional`      | `boolean`       | no   | `false` | Optional add-on the client can accept                             |
| `is_selected`      | `boolean`       | no   | `true`  | For optional lines: whether the client accepted it                |

Lines are editable only while the quote is `draft` (trigger).
Index `(organization_id, quote_id, position)`.

## `quote_line_item_taxes`

Has no `id` column.

| Column            | Type           | Null | Default | Notes                                                         |
| ----------------- | -------------- | ---- | ------- | ------------------------------------------------------------- |
| `organization_id` | `uuid`         | no   |         |                                                               |
| `line_item_id`    | `uuid`         | no   |         | Composite FK → `quote_line_items`, on delete cascade. PK part |
| `tax_rate_id`     | `uuid`         | no   |         | Composite FK → `tax_rates`, on delete restrict. PK part       |
| `percentage`      | `numeric(7,4)` | no   |         | Snapshot of the rate                                          |
| `amount_cents`    | `bigint`       | no   |         | Snapshot of the computed tax                                  |

## Portal RPCs

Portal users can't update quotes directly. They use:

- `public.approve_quote(quote_id uuid, selected_optional_line_ids uuid[])`
- `public.decline_quote(quote_id uuid, reason text)`

Both are `security definer` and check that the quote belongs to one of
`private.portal_client_ids()` and has status `sent`.
