# Invoicing & payments

Standard columns are described in the [README](../README.md#conventions).
Payments go straight to each contractor's own Stripe account through Stripe
Connect; see [ADR 0008](../decisions/0008-stripe-connect.md).

## Enums

| Enum             | Values                                                             |
| ---------------- | ------------------------------------------------------------------ |
| `invoice_status` | `draft`, `sent`, `partially_paid`, `paid`, `void`                  |
| `payment_method` | `cash`, `cheque`, `etransfer`, `card`, `ach`, `other`              |
| `payment_status` | `pending`, `succeeded`, `failed`, `refunded`, `partially_refunded` |

"Overdue" isn't a stored status. It's derived as
`status in ('sent','partially_paid') and due_date < current_date`.

Once an invoice leaves `draft`, its lines, taxes, and totals are frozen
(trigger). To correct it, void it and issue a new one.

## How invoices are created

- **Per-visit** (`jobs.billing_mode = 'per_visit'`): when a visit is
  completed, the app creates a draft invoice, or appends to the client's
  open draft if the org batches that way. It copies the job's
  `job_line_items` into `invoice_line_items` with `visit_id` set.
- **Periodic** (`billing_mode = 'periodic'`): at period end, a pg_cron job
  groups each client's completed, not-yet-invoiced visits for the period
  (`period_start` … `period_end`) into one draft invoice, one set of lines
  per visit.
- Ad-hoc lines (extras, materials, fees) are added to drafts with
  `visit_id = null`.
- Each billed visit gets a row in [`invoice_visits`](#invoice_visits), whose
  partial unique index guarantees a visit is never billed twice.

## `invoices`

| Column               | Type             | Null | Default   | Notes                                                              |
| -------------------- | ---------------- | ---- | --------- | ------------------------------------------------------------------ |
| `number`             | `text`           | no   |           | `INV-1001`, set by trigger. `unique (organization_id, number)`     |
| `client_id`          | `uuid`           | no   |           | Composite FK → `clients`, on delete restrict                       |
| `status`             | `invoice_status` | no   | `'draft'` |                                                                    |
| `issue_date`         | `date`           | yes  |           | Set when sent                                                      |
| `due_date`           | `date`           | yes  |           | Check `>= issue_date`                                              |
| `period_start`       | `date`           | yes  |           | For periodic invoices                                              |
| `period_end`         | `date`           | yes  |           | Check: both period columns set or both null, and `>= period_start` |
| `subtotal_cents`     | `bigint`         | no   | `0`       | Trigger-maintained from lines                                      |
| `tax_cents`          | `bigint`         | no   | `0`       | Trigger-maintained from line taxes                                 |
| `total_cents`        | `bigint`         | no   | —         | Generated: `subtotal_cents + tax_cents`                            |
| `amount_paid_cents`  | `bigint`         | no   | `0`       | Trigger-maintained from succeeded payments minus refunds           |
| `balance_cents`      | `bigint`         | no   | —         | Generated: `subtotal_cents + tax_cents - amount_paid_cents`        |
| `message`            | `text`           | yes  |           | Client-facing                                                      |
| `terms`              | `text`           | yes  |           |                                                                    |
| `internal_notes`     | `text`           | yes  |           |                                                                    |
| `sent_at`            | `timestamptz`    | yes  |           |                                                                    |
| `paid_at`            | `timestamptz`    | yes  |           |                                                                    |
| `voided_at`          | `timestamptz`    | yes  |           |                                                                    |
| `void_reason`        | `text`           | yes  |           |                                                                    |
| `stripe_invoice_id`  | `text`           | yes  |           | Unique. Set if Stripe Invoicing is used                            |
| `payment_link_token` | `text`           | yes  |           | Unique. Random token for the public "pay this invoice" page        |
| `created_by`         | `uuid`           | yes  |           | FK → `auth.users`                                                  |

Indexes: `unique (organization_id, id)`, `(organization_id, status, due_date)`,
`(organization_id, client_id, issue_date desc)`.

A payments trigger updates `status` automatically: `sent` → `partially_paid`
→ `paid` as `amount_paid_cents` changes.

## `invoice_line_items`

| Column             | Type            | Null | Default | Notes                                                                        |
| ------------------ | --------------- | ---- | ------- | ---------------------------------------------------------------------------- |
| `invoice_id`       | `uuid`          | no   |         | Composite FK → `invoices`, on delete cascade                                 |
| `job_id`           | `uuid`          | yes  |         | Composite FK → `jobs`, on delete set null                                    |
| `visit_id`         | `uuid`          | yes  |         | Set on lines that bill a visit. FK `(invoice_id, visit_id) → invoice_visits` |
| `service_id`       | `uuid`          | yes  |         | Composite FK → `services`, on delete set null                                |
| `position`         | `integer`       | no   |         |                                                                              |
| `description`      | `text`          | no   |         | Visit lines prefix the date: "Jun 3 – Weekly mowing"                         |
| `quantity`         | `numeric(10,2)` | no   | `1`     | Check `<> 0`. Negative quantities are allowed for discounts                  |
| `unit_price_cents` | `bigint`        | no   |         |                                                                              |
| `amount_cents`     | `bigint`        | no   | —       | Generated: `round(quantity * unit_price_cents)`                              |

A visit produces **several** lines (one per `job_line_items` row), so
`visit_id` can't be unique here. The "bill each visit once" rule lives in
`invoice_visits` instead.

## `invoice_visits`

Records which visits an invoice bills. It gives the rule "a visit is billed
on at most one live invoice" a real unique constraint. Has no `id` column.

| Column            | Type      | Null | Default | Notes                                                 |
| ----------------- | --------- | ---- | ------- | ----------------------------------------------------- |
| `organization_id` | `uuid`    | no   |         |                                                       |
| `invoice_id`      | `uuid`    | no   |         | Composite FK → `invoices`, on delete cascade. PK part |
| `visit_id`        | `uuid`    | no   |         | Composite FK → `visits`, on delete restrict. PK part  |
| `is_void`         | `boolean` | no   | `false` | Set by trigger when the invoice is voided             |

- **`unique (visit_id) where not is_void`**: at most one live invoice per
  visit, which blocks double billing.
- Voiding an invoice flips `is_void`, which frees its visits for re-billing.
  The voided invoice's lines stay intact for history.
- A visit is "not yet invoiced" when it has no `invoice_visits` row where
  `not is_void`.
- Index `(organization_id, visit_id)`.

## `invoice_line_item_taxes`

The source for tax-remittance reports (e.g. GST/HST collected per period).
Has no `id` column.

| Column            | Type           | Null | Default | Notes                                                           |
| ----------------- | -------------- | ---- | ------- | --------------------------------------------------------------- |
| `organization_id` | `uuid`         | no   |         |                                                                 |
| `line_item_id`    | `uuid`         | no   |         | Composite FK → `invoice_line_items`, on delete cascade. PK part |
| `tax_rate_id`     | `uuid`         | no   |         | Composite FK → `tax_rates`, on delete restrict. PK part         |
| `percentage`      | `numeric(7,4)` | no   |         | Snapshot                                                        |
| `amount_cents`    | `bigint`       | no   |         | Snapshot                                                        |

Index `(organization_id, tax_rate_id)`.

## `payments`

A payment applies to exactly one invoice. Because batched invoices are
monthly, this keeps v1 simple. If a client pays several invoices with one
cheque, it's recorded as several payment rows that share a `reference`.

| Column                     | Type             | Null | Default       | Notes                                                               |
| -------------------------- | ---------------- | ---- | ------------- | ------------------------------------------------------------------- |
| `invoice_id`               | `uuid`           | no   |               | Composite FK → `invoices`, on delete restrict                       |
| `client_id`                | `uuid`           | no   |               | Composite FK → `clients`. Must match the invoice's client (trigger) |
| `method`                   | `payment_method` | no   |               |                                                                     |
| `status`                   | `payment_status` | no   | `'succeeded'` | Manual payments start `succeeded`. Stripe payments start `pending`  |
| `amount_cents`             | `bigint`         | no   |               | Check `> 0`                                                         |
| `refunded_cents`           | `bigint`         | no   | `0`           | Check `between 0 and amount_cents`                                  |
| `received_at`              | `timestamptz`    | no   | `now()`       |                                                                     |
| `reference`                | `text`           | yes  |               | Cheque number, e-transfer reference                                 |
| `notes`                    | `text`           | yes  |               |                                                                     |
| `stripe_payment_intent_id` | `text`           | yes  |               | Unique                                                              |
| `stripe_charge_id`         | `text`           | yes  |               |                                                                     |
| `recorded_by`              | `uuid`           | yes  |               | FK → `auth.users`. Null for Stripe webhooks                         |

Index `(organization_id, invoice_id)`, `(organization_id, received_at desc)`.
The `after insert/update/delete` trigger recalculates the invoice's
`amount_paid_cents` as the sum of `amount_cents - refunded_cents` over
payments with status `succeeded`, `partially_refunded`, or `refunded`.

## `stripe_events`

Webhook idempotency and a debugging log. It has **no RLS policies**: only
the service role reads or writes it. No standard columns.

| Column         | Type          | Null | Default | Notes                                            |
| -------------- | ------------- | ---- | ------- | ------------------------------------------------ |
| `id`           | `text`        | no   |         | PK: the Stripe event id (`evt_…`)                |
| `account_id`   | `text`        | yes  |         | Connected account (`acct_…`) the event came from |
| `type`         | `text`        | no   |         |                                                  |
| `payload`      | `jsonb`       | no   |         |                                                  |
| `received_at`  | `timestamptz` | no   | `now()` |                                                  |
| `processed_at` | `timestamptz` | yes  |         |                                                  |
| `error`        | `text`        | yes  |         |                                                  |
