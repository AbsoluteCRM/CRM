# Tenancy & identity

Covers organizations (tenants), the people in them, and supporting data.
Standard columns (`id`, `organization_id`, `created_at`, `updated_at`) are
described in the [README](../README.md#conventions) and are not repeated here.

## Enums

| Enum            | Values                                   |
| --------------- | ---------------------------------------- |
| `org_role`      | `owner`, `admin`, `dispatcher`, `worker` |
| `member_status` | `invited`, `active`, `disabled`          |
| `document_kind` | `quote`, `job`, `invoice`                |

## `organizations`

A contractor business, and the tenant boundary. There's no
`organization_id` column; `id` is the tenant id.

| Column                          | Type      | Null | Default              | Notes                                                                                                                                           |
| ------------------------------- | --------- | ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                          | `text`    | no   |                      |                                                                                                                                                 |
| `slug`                          | `citext`  | no   |                      | Unique. Used in URLs                                                                                                                            |
| `timezone`                      | `text`    | no   | `'America/Edmonton'` | IANA name. Defines day boundaries for visits and routes. Validated by a trigger against `pg_timezone_names` (a CHECK constraint can't query it) |
| `currency`                      | `char(3)` | no   | `'CAD'`              | ISO 4217                                                                                                                                        |
| `country`                       | `char(2)` | no   | `'CA'`               | ISO 3166-1 alpha-2                                                                                                                              |
| `email`                         | `citext`  | yes  |                      |                                                                                                                                                 |
| `phone`                         | `text`    | yes  |                      |                                                                                                                                                 |
| `address_line1` … `postal_code` | `text`    | yes  |                      | Same address columns as [properties](clients.md#properties)                                                                                     |
| `logo_path`                     | `text`    | yes  |                      | Storage path in the `org-files` bucket                                                                                                          |
| `settings`                      | `jsonb`   | no   | `'{}'`               | See settings keys below                                                                                                                         |
| `stripe_account_id`             | `text`    | yes  |                      | Stripe Connect account (`acct_…`). Unique                                                                                                       |
| `created_by`                    | `uuid`    | yes  |                      | FK → `auth.users` on delete set null                                                                                                            |

`settings` keys (validated in the app; defaults apply when a key is absent):

| Key                                              | Type    | Default              | Meaning                                         |
| ------------------------------------------------ | ------- | -------------------- | ----------------------------------------------- |
| `workers_see_prices`                             | boolean | `false`              | Workers can read job and visit line-item prices |
| `visit_horizon_weeks`                            | integer | `8`                  | How far ahead recurring visits are materialized |
| `default_payment_terms_days`                     | integer | `30`                 | Invoice due date = issue date + N days          |
| `invoice_prefix` / `quote_prefix` / `job_prefix` | text    | `INV-` / `Q-` / `J-` | Prefixes for document numbers                   |

**On create**: organizations are created only through the
`public.create_organization(name, slug, timezone)` RPC. It inserts the org
and makes the caller its `owner` member. There's no direct insert policy.
Deleting an organization is service-role only.

## `profiles`

One row per auth user, holding personal data that isn't tied to any org.
There's no `organization_id` column, because a user can belong to several
orgs and can also be a portal user.

| Column        | Type   | Null | Default | Notes                                                   |
| ------------- | ------ | ---- | ------- | ------------------------------------------------------- |
| `id`          | `uuid` | no   |         | PK, FK → `auth.users(id)` on delete cascade. No default |
| `full_name`   | `text` | yes  |         |                                                         |
| `phone`       | `text` | yes  |         |                                                         |
| `avatar_path` | `text` | yes  |         |                                                         |

A `security definer` trigger on `auth.users` (after insert) creates the
profile from `raw_user_meta_data`.

## `organization_members`

A staff member of an organization (owner, office staff, or field worker).
This is the employee record: time, pay, and crews all hang off it. `user_id`
is **nullable**, so crew members who never log in can still be rostered and
have time tracked.

| Column          | Type                    | Null | Default    | Notes                                |
| --------------- | ----------------------- | ---- | ---------- | ------------------------------------ |
| `user_id`       | `uuid`                  | yes  |            | FK → `auth.users` on delete set null |
| `role`          | `org_role`              | no   | `'worker'` |                                      |
| `status`        | `member_status`         | no   | `'active'` |                                      |
| `display_name`  | `text`                  | no   |            | Shown on schedules and routes        |
| `email`         | `citext`                | yes  |            |                                      |
| `phone`         | `text`                  | yes  |            |                                      |
| `color`         | `text`                  | yes  |            | Calendar colour, `#rrggbb` (check)   |
| `home_location` | `geography(Point,4326)` | yes  |            | Optional per-worker route start      |

Constraints and indexes:

- `unique (organization_id, id)` (target for composite FKs)
- `unique (organization_id, user_id)`, so a user is a member of an org at most once
- index `(user_id, organization_id) include (role, status)`, which the RLS helpers use on every query
- Trigger: an org must always keep ≥ 1 active `owner`. The last owner can't be demoted, disabled, or deleted.

## `organization_invitations`

A pending invitation for someone to join as staff. Accepting it creates or
links the `organization_members` row.

| Column        | Type          | Null | Default                     | Notes                                                |
| ------------- | ------------- | ---- | --------------------------- | ---------------------------------------------------- |
| `email`       | `citext`      | no   |                             |                                                      |
| `role`        | `org_role`    | no   | `'worker'`                  | Can't be `owner`                                     |
| `member_id`   | `uuid`        | yes  |                             | Composite FK. Links to an existing login-less member |
| `token_hash`  | `text`        | no   |                             | SHA-256 of the emailed token. Unique                 |
| `invited_by`  | `uuid`        | yes  |                             | FK → `auth.users`                                    |
| `expires_at`  | `timestamptz` | no   | `now() + interval '7 days'` |                                                      |
| `accepted_at` | `timestamptz` | yes  |                             |                                                      |

Partial unique index: `(organization_id, email) where accepted_at is null`.
Invitations are accepted via the `public.accept_invitation(token)` RPC.

## `member_pay_rates`

Effective-dated hourly rates. The rate in force on date D is the row with the
greatest `effective_from <= D`.

| Column              | Type     | Null | Default | Notes                                                   |
| ------------------- | -------- | ---- | ------- | ------------------------------------------------------- |
| `member_id`         | `uuid`   | no   |         | Composite FK → `organization_members` on delete cascade |
| `hourly_rate_cents` | `bigint` | no   |         | Check `>= 0`                                            |
| `effective_from`    | `date`   | no   |         |                                                         |
| `notes`             | `text`   | yes  |         |                                                         |

`unique (member_id, effective_from)`. RLS: owner/admin only.

## `document_sequences`

Per-organization counters for human-facing document numbers. Has no `id`
column.

| Column            | Type            | Null | Default | Notes   |
| ----------------- | --------------- | ---- | ------- | ------- |
| `organization_id` | `uuid`          | no   |         | PK part |
| `kind`            | `document_kind` | no   |         | PK part |
| `next_value`      | `bigint`        | no   | `1001`  |         |

`private.next_document_number(org uuid, kind document_kind) returns text`
upserts the counter (`insert … on conflict do update set next_value =
next_value + 1 returning`), which creates it lazily at 1001 and row-locks it
until the caller commits, and prepends the org's prefix. `before insert`
triggers on
`quotes`, `jobs`, and `invoices` call it when `number` is null. There's no
direct access through the API.
