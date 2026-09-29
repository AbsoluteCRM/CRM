# Clients & properties

A **client** is who pays: a homeowner or a company. A **property** is where
the work happens, and one client can have many (a property manager with 20
sites is one client with 20 properties). **Contacts** are the people to call
or email. **Portal users** are logins that can see a client's quotes,
invoices, and visits.

Standard columns are described in the [README](../README.md#conventions).

## Enums

| Enum            | Values                       |
| --------------- | ---------------------------- |
| `client_kind`   | `individual`, `company`      |
| `client_status` | `lead`, `active`, `inactive` |

## `clients`

| Column                                                             | Type            | Null | Default        | Notes                                                                 |
| ------------------------------------------------------------------ | --------------- | ---- | -------------- | --------------------------------------------------------------------- |
| `kind`                                                             | `client_kind`   | no   | `'individual'` |                                                                       |
| `status`                                                           | `client_status` | no   | `'active'`     | `lead` = prospect, not yet quoted or approved                         |
| `display_name`                                                     | `text`          | no   |                | What lists and invoices show. The app derives it from name or company |
| `first_name`                                                       | `text`          | yes  |                |                                                                       |
| `last_name`                                                        | `text`          | yes  |                |                                                                       |
| `company_name`                                                     | `text`          | yes  |                | Check: required when `kind = 'company'`                               |
| `email`                                                            | `citext`        | yes  |                | Primary billing email                                                 |
| `phone`                                                            | `text`          | yes  |                |                                                                       |
| `billing_address_line1` … `billing_postal_code`, `billing_country` | `text`          | yes  |                | Null means use the primary property's address                         |
| `lead_source`                                                      | `text`          | yes  |                | Free text: referral, Google, door hanger…                             |
| `tags`                                                             | `text[]`        | no   | `'{}'`         |                                                                       |
| `notes`                                                            | `text`          | yes  |                | Internal only; never shown in the portal                              |
| `tax_exempt`                                                       | `boolean`       | no   | `false`        | Skips all tax on this client's invoices                               |
| `stripe_customer_id`                                               | `text`          | yes  |                | `cus_…` on the org's connected account                                |
| `archived_at`                                                      | `timestamptz`   | yes  |                | Soft delete                                                           |

Indexes:

- `unique (organization_id, id)`
- `(organization_id, status) where archived_at is null`
- GIN `display_name gin_trgm_ops` for fuzzy search
- `unique (organization_id, stripe_customer_id)`

## `client_contacts`

| Column              | Type      | Null | Default | Notes                                       |
| ------------------- | --------- | ---- | ------- | ------------------------------------------- |
| `client_id`         | `uuid`    | no   |         | Composite FK → `clients`, on delete cascade |
| `name`              | `text`    | no   |         |                                             |
| `role`              | `text`    | yes  |         | "Property manager", "Spouse"…               |
| `email`             | `citext`  | yes  |         |                                             |
| `phone`             | `text`    | yes  |         |                                             |
| `is_primary`        | `boolean` | no   | `false` | Partial unique: one primary per client      |
| `receives_invoices` | `boolean` | no   | `false` | CC'd on invoice emails                      |

## `properties`

A service location. Its geocoded point is what routing works from.

| Column           | Type                    | Null | Default | Notes                                                   |
| ---------------- | ----------------------- | ---- | ------- | ------------------------------------------------------- |
| `client_id`      | `uuid`                  | no   |         | Composite FK → `clients`, on delete restrict            |
| `name`           | `text`                  | yes  |         | "Main house", "Lot 4"                                   |
| `address_line1`  | `text`                  | no   |         |                                                         |
| `address_line2`  | `text`                  | yes  |         |                                                         |
| `city`           | `text`                  | no   |         |                                                         |
| `region`         | `text`                  | yes  |         | Province or state                                       |
| `postal_code`    | `text`                  | yes  |         |                                                         |
| `country`        | `char(2)`               | no   | `'CA'`  |                                                         |
| `location`       | `geography(Point,4326)` | yes  |         | Null until geocoded. Visits can't be routed without it  |
| `latitude`       | `double precision`      | —    |         | `generated always as (st_y(location::geometry)) stored` |
| `longitude`      | `double precision`      | —    |         | `generated always as (st_x(location::geometry)) stored` |
| `geocoded_at`    | `timestamptz`           | yes  |         |                                                         |
| `geocode_source` | `text`                  | yes  |         | `google`, `mapbox`, `manual` (a dragged pin)            |
| `access_notes`   | `text`                  | yes  |         | Gate codes, dogs, parking. Visible to rostered workers  |
| `lot_size_sqft`  | `integer`               | yes  |         | Check `> 0`. Useful for quoting                         |
| `archived_at`    | `timestamptz`           | yes  |         |                                                         |

Indexes:

- `unique (organization_id, id)`
- `(organization_id, client_id)`
- GiST `(location)`

## `client_portal_users`

Links an auth user to a client for the customer portal. One login can see
several clients (e.g., a property manager hired by two HOAs), and one client
can have several logins.

| Column      | Type   | Null | Default | Notes                                       |
| ----------- | ------ | ---- | ------- | ------------------------------------------- |
| `client_id` | `uuid` | no   |         | Composite FK → `clients`, on delete cascade |
| `user_id`   | `uuid` | no   |         | FK → `auth.users`, on delete cascade        |

`unique (client_id, user_id)`. Index `(user_id)`, which
`private.portal_client_ids()` uses. Only owner/admin/dispatcher can create
these rows, normally by sending a portal invite.
