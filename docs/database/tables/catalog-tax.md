# Catalog & tax

Standard columns are described in the [README](../README.md#conventions).

## Enums

| Enum           | Values                                                      |
| -------------- | ----------------------------------------------------------- |
| `service_unit` | `each`, `hour`, `visit`, `sqft`, `linear_ft`, `yard`, `bag` |

## `services`

The org's price list. Quote, job, and invoice lines copy `description` and
price from a service when the line is created, so later price changes never
rewrite history.

| Column                     | Type           | Null | Default  | Notes                                     |
| -------------------------- | -------------- | ---- | -------- | ----------------------------------------- |
| `name`                     | `text`         | no   |          | Unique per org among non-archived rows    |
| `description`              | `text`         | yes  |          | Default line description                  |
| `unit`                     | `service_unit` | no   | `'each'` |                                           |
| `default_price_cents`      | `bigint`       | no   | `0`      | Check `>= 0`                              |
| `default_duration_minutes` | `integer`      | yes  |          | Check `> 0`. Seeds the visit duration     |
| `is_active`                | `boolean`      | no   | `true`   | Inactive services are hidden from pickers |
| `archived_at`              | `timestamptz`  | yes  |          |                                           |

Indexes: `unique (organization_id, id)`,
`unique (organization_id, lower(name)) where archived_at is null`.

## `tax_rates`

Named, stackable tax rates, e.g. "GST 5%" plus "PST BC 7%", or "HST ON 13%".
All rates are simple (non-compound) percentages of the line amount, which
covers every Canadian province today.

| Column                | Type           | Null | Default | Notes                                      |
| --------------------- | -------------- | ---- | ------- | ------------------------------------------ |
| `name`                | `text`         | no   |         | "GST", "HST ON"                            |
| `percentage`          | `numeric(7,4)` | no   |         | `5.0000` means 5%. Check `0 <= x <= 100`   |
| `registration_number` | `text`         | yes  |         | Printed on invoices, e.g. a GST/HST number |
| `is_active`           | `boolean`      | no   | `true`  |                                            |

A rate's percentage is **never edited once used**. To change a rate, add a
new one and deactivate the old one. Documents snapshot the rate anyway (see
`*_line_item_taxes.percentage`).

## `service_default_taxes`

The taxes that apply by default when a service is added to a line. Has no
`id` column.

| Column            | Type   | Null | Default | Notes                                                  |
| ----------------- | ------ | ---- | ------- | ------------------------------------------------------ |
| `organization_id` | `uuid` | no   |         |                                                        |
| `service_id`      | `uuid` | no   |         | Composite FK → `services`, on delete cascade. PK part  |
| `tax_rate_id`     | `uuid` | no   |         | Composite FK → `tax_rates`, on delete cascade. PK part |

Index `(organization_id, tax_rate_id)`.

## How tax is calculated

For each line: `amount_cents = round(quantity × unit_price_cents)`. Then, for
each applied rate: `tax_cents = round(amount_cents × percentage / 100)`,
using round half away from zero. Taxes are calculated **per line, per rate**,
then summed. The totals on quotes and invoices are maintained by triggers
from these rows, so they always match the lines. Tax-exempt clients get no
tax rows.
