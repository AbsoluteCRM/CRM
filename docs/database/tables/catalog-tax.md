# Catalog & tax

Standard columns are described in the [README](../README.md#conventions).

## Enums

| Enum                           | Values                                                         |
| ------------------------------ | -------------------------------------------------------------- |
| `service_unit`                 | `monthly`, `hour`, `visit`, `sqft`, `linear_ft`, `yard`, `bag` |
| `service_frequency`            | `one_time`, `weekly`, `biweekly`, `monthly`                    |
| `service_precipitation_type`   | `none`, `rain`, `snow`, `any`                                  |
| `service_precipitation_action` | `none`, `schedule`, `reschedule`                               |

`monthly` is displayed as “per month”. It replaces the former `each` pricing
unit (displayed as “per job”), including existing and archived services and
the database default. This is a pricing unit only: it does not create a
subscription or change the service's visit frequencies. The Services form
continues to initially select `visit` for new services.

## `services`

The org's price list. Quote, job, and invoice lines copy `description` and
price from a service when the line is created, so later price changes never
rewrite history.

| Column                     | Type                           | Null | Default        | Notes                                                                                      |
| -------------------------- | ------------------------------ | ---- | -------------- | ------------------------------------------------------------------------------------------ |
| `name`                     | `text`                         | no   |                | Unique per org among non-archived rows                                                     |
| `description`              | `text`                         | yes  |                | Default line description                                                                   |
| `unit`                     | `service_unit`                 | no   | `'monthly'`    |                                                                                            |
| `default_price_cents`      | `bigint`                       | no   | `0`            | Check `>= 0`                                                                               |
| `default_duration_minutes` | `integer`                      | yes  |                | Check `> 0`. Seeds the visit duration                                                      |
| `archived_at`              | `timestamptz`                  | yes  |                | Archived services are hidden from pickers (not enforced by the database on new lines)      |
| `season_start_month`       | `smallint`                     | yes  |                | 1-12. First month offered. Null (with the end month) = year-round                          |
| `season_end_month`         | `smallint`                     | yes  |                | 1-12. A start after the end wraps over new year (11 to 3 = Nov-Mar). Both set or both null |
| `color`                    | `text`                         | no   | `'#7fb547'`    | Hex `#rrggbb`. Shown on the services page                                                  |
| `equipment`                | `text[]`                       | no   | `'{}'`         | Equipment the service needs                                                                |
| `frequencies`              | `service_frequency[]`          | no   | `'{one_time}'` | Visit frequencies offered. At least one                                                    |
| `precipitation_type`       | `service_precipitation_type`   | no   | `'none'`       | Precipitation relevant to this service; `any` means rain or snow                           |
| `precipitation_action`     | `service_precipitation_action` | no   | `'none'`       | Suggested admin action for a future weather recommendation                                 |

Precipitation settings are one optional rule per service. Both fields must be
`none`, or the type must be `rain`, `snow`, or `any` and the action must be
`schedule` or `reschedule`. Existing services default to `none`/`none`.
Owner/admin service create and update permissions apply to these columns.
These preferences do not currently generate flags or change schedules.

Future WeatherAPI integration can map separate rain/snow indicators and
probabilities to these business preferences. Daily forecast fields include
`daily_will_it_rain`, `daily_will_it_snow`, `daily_chance_of_rain`, and
`daily_chance_of_snow`; hourly equivalents omit `daily_`. Precipitation and
snowfall amounts use different units (`totalprecip_mm` and `totalsnow_cm`, or
hourly `precip_mm` and `snow_cm`). No thresholds or provider response data are
stored here. See [WeatherAPI forecast documentation](https://www.weatherapi.com/docs/forecast-api/).

Indexes: `unique (organization_id, id)`,
`unique (organization_id, lower(name)) where archived_at is null`.

## `tax_rates`

Named, stackable tax rates, e.g. "GST 5%" plus "PST BC 7%", or "HST ON 13%".
All rates are simple (non-compound) percentages of the line amount, which
covers every Canadian province today.

| Column                | Type           | Null | Default | Notes                                               |
| --------------------- | -------------- | ---- | ------- | --------------------------------------------------- |
| `name`                | `text`         | no   |         | "GST", "HST ON"                                     |
| `percentage`          | `numeric(7,4)` | no   |         | `5.0000` means 5%. Check `0 <= x <= 100`            |
| `registration_number` | `text`         | yes  |         | Printed on invoices, e.g. a GST/HST number          |
| `archived_at`         | `timestamptz`  | yes  |         | Archived rates can't be newly attached to documents |

A rate's percentage is **insert-only**: the API grants no update on it, so
documents can never change underneath. To change a rate, add a new one and
archive the old one. `private.guard_tax_rate_usable()` rejects archived rates on
new `service_default_taxes`, quote, job, and invoice tax rows. Documents snapshot the rate anyway (see
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
