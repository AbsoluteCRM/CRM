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
| `email`                                                            | `text`          | yes  |                | Primary billing email                                                 |
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
- GIN `(organization_id, display_name gin_trgm_ops)` for fuzzy search within an org (needs `btree_gin`)
- `unique (organization_id, stripe_customer_id)`

## `client_contacts`

| Column              | Type      | Null | Default | Notes                                       |
| ------------------- | --------- | ---- | ------- | ------------------------------------------- |
| `client_id`         | `uuid`    | no   |         | Composite FK → `clients`, on delete cascade |
| `name`              | `text`    | no   |         |                                             |
| `role`              | `text`    | yes  |         | "Property manager", "Spouse"…               |
| `email`             | `text`    | yes  |         |                                             |
| `phone`             | `text`    | yes  |         |                                             |
| `is_primary`        | `boolean` | no   | `false` | Partial unique: one primary per client      |
| `receives_invoices` | `boolean` | no   | `false` | CC'd on invoice emails                      |

## `properties`

A service location. Its geocoded point is what routing works from.

| Column             | Type                    | Null | Default | Notes                                                                                                                                                                                   |
| ------------------ | ----------------------- | ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client_id`        | `uuid`                  | no   |         | Composite FK → `clients`, on delete restrict                                                                                                                                            |
| `name`             | `text`                  | yes  |         | "Main house", "Lot 4"                                                                                                                                                                   |
| `address_line1`    | `text`                  | no   |         |                                                                                                                                                                                         |
| `address_line2`    | `text`                  | yes  |         |                                                                                                                                                                                         |
| `city`             | `text`                  | no   |         |                                                                                                                                                                                         |
| `region`           | `text`                  | yes  |         | Province or state                                                                                                                                                                       |
| `postal_code`      | `text`                  | yes  |         |                                                                                                                                                                                         |
| `country`          | `text`                  | no   | `'CA'`  |                                                                                                                                                                                         |
| `location`         | `geography(Point,4326)` | yes  |         | Null until geocoded. Visits can't be routed without it                                                                                                                                  |
| `latitude`         | `double precision`      | —    |         | `generated always as (st_y(location::geometry)) stored`                                                                                                                                 |
| `longitude`        | `double precision`      | —    |         | `generated always as (st_x(location::geometry)) stored`                                                                                                                                 |
| `geocoded_at`      | `timestamptz`           | yes  |         |                                                                                                                                                                                         |
| `geocode_source`   | `text`                  | yes  |         | `maptiler`, `nominatim`, `manual` (a dropped pin). Older rows may say `google` or `mapbox`                                                                                              |
| `geocode_accuracy` | `text`                  | yes  |         | Check: `rooftop`, `street`, `postal`, `locality`, `unknown`. `locality`/`unknown` are low confidence. Null when not geocoded                                                            |
| `access_notes`     | `text`                  | yes  |         | Gate codes, dogs, parking. Returned to rostered workers by `worker_route_stops`                                                                                                         |
| `lot_size_sqft`    | `integer`               | yes  |         | Check `> 0`. Useful for quoting                                                                                                                                                         |
| `service_area_id`  | `uuid`                  | yes  |         | Derived: the winning live service area covering `location` (composite FK → `service_areas`, on delete set null). Not writable through the API; see [service-areas.md](service-areas.md) |
| `archived_at`      | `timestamptz`           | yes  |         |                                                                                                                                                                                         |

Indexes:

- `unique (organization_id, id)`
- `(organization_id, client_id)`
- GiST `(organization_id, location)` (needs `btree_gist`)
- GiST `(organization_id, (location::geometry))`, for planar `ST_Covers` against service area polygons
- `(organization_id, service_area_id)`

### Geocoding

The app geocodes on the server when a property is saved
(`clients.properties.create` / `update`), and the point is stored, so
nothing calls a provider at query time ([ADR 0013](../decisions/0013-geocoding-chain-and-cache.md)).

- **When**: on create, when the address fields that move the point change
  (`address_line1`, `city`, `region`, `postal_code`, `country`; not
  `address_line2`), and on any save of a row that has no point yet and
  isn't a manual pin.
- **Never blocks a save**: if every provider fails, the property saves with
  `location`, `geocoded_at`, `geocode_source`, and `geocode_accuracy` null.
  When the address changed, a stale point is cleared.
- **Manual pin** (`clients.properties.setLocation`): `geocode_source =
'manual'`, `geocode_accuracy = 'rooftop'`. It is never overwritten
  unless the address changes. The backfill script never touches it.
- **Low confidence**: `locality` and `unknown` results are stored but the
  procedures report `location_status = 'low_confidence'` (`missing` when
  there's no point, else `ok`).
- **Backfill**: `pnpm geocode:backfill` (dry run by default; `--apply`,
  `--org`, `--limit`, `--chain`, `--interval-ms`,
  `--include-low-confidence`).

## `geocode_cache`

Shared geocoder results, so the same address is looked up once across all
orgs. It holds **no tenant id and no address text**: the key is the SHA-256
of the normalized address. RLS is enabled with **no policies**, and
`authenticated`/`anon` have no grants, so it's service role only (read and
written by `src/server/trusted/geocode-cache.ts`). Only trusted accuracies
(`rooftop`, `street`, `postal`) are cached.

| Column                    | Type               | Null | Default | Notes                                       |
| ------------------------- | ------------------ | ---- | ------- | ------------------------------------------- |
| `normalized_address_hash` | `text`             | no   |         | PK. Check: 64 lowercase hex chars           |
| `provider`                | `text`             | no   |         | `maptiler`, `nominatim`                     |
| `lon`                     | `double precision` | no   |         | Check −180..180                             |
| `lat`                     | `double precision` | no   |         | Check −90..90                               |
| `accuracy`                | `text`             | no   |         | Same check as `properties.geocode_accuracy` |
| `fetched_at`              | `timestamptz`      | no   | `now()` |                                             |

No standard columns (`id`, `organization_id`, timestamps): it's a global
lookup table.

## `client_portal_users`

Links an auth user to a client for the customer portal. One login can see
several clients (e.g., a property manager hired by two HOAs), and one client
can have several logins.

| Column      | Type   | Null | Default | Notes                                       |
| ----------- | ------ | ---- | ------- | ------------------------------------------- |
| `client_id` | `uuid` | no   |         | Composite FK → `clients`, on delete cascade |
| `user_id`   | `uuid` | no   |         | FK → `auth.users`, on delete cascade        |

PK `(organization_id, client_id, user_id)` (no `id` column). Index `(user_id)`, which
`private.portal_clients()` uses. Only owner/admin/dispatcher can create
these rows, normally by sending a portal invite.

## Portal RPCs

Portal users have no policies on `clients`, `client_contacts`, or
`properties`, because those tables hold internal columns (see
[rls.md](../rls.md)). They read through:

- `public.portal_my_clients()`: client id, org name, display name, email,
  and phone for each linked, non-archived client
- `public.portal_my_properties()`: address and access notes for those
  clients' non-archived properties
