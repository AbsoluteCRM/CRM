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

| Column                          | Type    | Null | Default              | Notes                                                                                                                                           |
| ------------------------------- | ------- | ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                          | `text`  | no   |                      |                                                                                                                                                 |
| `slug`                          | `text`  | no   |                      | Unique. Used in URLs                                                                                                                            |
| `timezone`                      | `text`  | no   | `'America/Edmonton'` | IANA name. Defines day boundaries for visits and routes. Validated by a trigger against `pg_timezone_names` (a CHECK constraint can't query it) |
| `currency`                      | `text`  | no   | `'CAD'`              | ISO 4217                                                                                                                                        |
| `country`                       | `text`  | no   | `'CA'`               | ISO 3166-1 alpha-2                                                                                                                              |
| `email`                         | `text`  | yes  |                      |                                                                                                                                                 |
| `phone`                         | `text`  | yes  |                      |                                                                                                                                                 |
| `address_line1` … `postal_code` | `text`  | yes  |                      | Same address columns as [properties](clients.md#properties)                                                                                     |
| `logo_path`                     | `text`  | yes  |                      | Legacy `org-files` path or complete public HTTPS logo URL                                                                                       |
| `settings`                      | `jsonb` | no   | `'{}'`               | See settings keys below                                                                                                                         |
| `stripe_account_id`             | `text`  | yes  |                      | Stripe Connect account (`acct_…`). Unique                                                                                                       |
| `created_by`                    | `uuid`  | yes  |                      | FK → `auth.users` on delete set null                                                                                                            |

`settings` keys (validated in the app, except `default_payment_terms_days`, which falls back to 30 when not a whole number; defaults apply when a key is absent):

| Key                                              | Type    | Default               | Meaning                                                                                      |
| ------------------------------------------------ | ------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `workers_see_prices`                             | boolean | `false`               | `worker_route_stops` returns the job price to workers                                        |
| `visit_horizon_weeks`                            | integer | `8`                   | How far ahead recurring visits are materialized                                              |
| `default_payment_terms_days`                     | integer | `30`                  | Invoice due date = issue date + N days                                                       |
| `invoice_prefix` / `quote_prefix` / `job_prefix` | text    | `INV-` / `Q-` / `J-`  | Prefixes for document numbers                                                                |
| `brand_color`                                    | text    | `#2f7350`             | `#rrggbb`. Colour theme of the signed-in app: a preset's colour, or any colour to derive one |
| `business_hours`                                 | object  | Every day 08:00–17:00 | `{ mon…sun: { closed, open, close } }`, `HH:MM` times                                        |
| `service_areas`                                  | text[]  | `[]`                  | Up to 50 labels (≤ 80 chars) shown on the request page                                       |
| `online_requests`                                | object  | see below             | Public request page (`/portal/$orgSlug`) settings                                            |

`online_requests` keys. They are read and written through `src/integrations/settings/schema.ts`, which applies defaults key by key, so one bad or missing key never hides the rest. `src/server/trusted/portal.ts` is the only reader for anonymous visitors, and it returns an allow-list of fields:

| Key                                                                  | Type    | Default                                  | Meaning                                                                                                                        |
| -------------------------------------------------------------------- | ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`                                                            | boolean | `true`                                   | Off hides services on the page, and `portal.submit` returns `FORBIDDEN` before writing                                         |
| `tagline` / `mission` / `about`                                      | text    | `null`                                   | Page copy (≤ 140 / 600 / 2000 chars)                                                                                           |
| `show_prices` / `show_hours` / `show_service_areas` / `show_contact` | boolean | `true`                                   | Off removes that data from the public payload, not just the UI                                                                 |
| `palette`                                                            | object  | Forest (`#11301f`, `#e7ecdf`, `#c6ef6a`) | `{ primary, secondary, accent }`, each `#rrggbb`. Request page colours: top bar and buttons, intro and footer tint, highlights |
| `embed.enabled`                                                      | boolean | `true`                                   | Off: other sites can't frame `?embed=true` (CSP `frame-ancestors 'self'`)                                                      |
| `embed.style`                                                        | text    | `inline`                                 | `inline` (iframe snippet) or `button` (link snippet)                                                                           |
| `embed.height`                                                       | integer | `900`                                    | Iframe height in px, 400–2000                                                                                                  |
| `embed.button_label`                                                 | text    | `Request a quote`                        | Button snippet text (≤ 40 chars)                                                                                               |
| `embed.compact`                                                      | boolean | `false`                                  | The embedded view shows only services and the form                                                                             |
| `embed.allowed_origins`                                              | text[]  | `[]`                                     | Origins allowed to frame the form (`https://…`, max 20). Empty allows any site. Enforced by `src/start.ts`                     |

The company logo is `logo_path`: a complete public HTTPS URL from R2, or a legacy image under `org-files/<org id>/branding/`. Owners/admins manage the reference through `settings.setLogo`; public URLs display directly and legacy paths use short-lived signed URLs.

**On create**: organizations are created only through the
`public.create_organization(name, slug, timezone, currency, country)` RPC. It inserts the org
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

| Column                   | Type                    | Null | Default          | Notes                                                     |
| ------------------------ | ----------------------- | ---- | ---------------- | --------------------------------------------------------- |
| `user_id`                | `uuid`                  | yes  |                  | FK → `auth.users` on delete set null                      |
| `role`                   | `org_role`              | no   | `'worker'`       |                                                           |
| `status`                 | `member_status`         | no   | `'active'`       |                                                           |
| `display_name`           | `text`                  | no   |                  | Shown on schedules and routes                             |
| `email`                  | `text`                  | yes  |                  |                                                           |
| `phone`                  | `text`                  | yes  |                  |                                                           |
| `color`                  | `text`                  | yes  |                  | Calendar colour, `#rrggbb` (check)                        |
| `home_location`          | `geography(Point,4326)` | yes  |                  | Optional per-worker route start                           |
| `work_days`              | `smallint[]`            | no   | `{1,2,3,4,5}`    | Regular work days, ISO weekdays (1 = Monday … 7 = Sunday) |
| `work_start`, `work_end` | `time`                  | no   | `08:00`, `17:00` | Regular daily hours; start before end                     |

Constraints and indexes:

- `unique (organization_id, id)` (target for composite FKs)
- `unique (organization_id, user_id)`, so a user is a member of an org at most once
- index `(user_id, organization_id) include (role, status)`, which the RLS helpers use on every query
- Triggers:
  - `ensure_org_has_owner`: an org must always keep ≥ 1 active `owner`. The
    check locks the organization row first, so two concurrent demotions can't
    both pass.
  - `guard_member_change`: through the API, only owners can add, change, or
    remove an owner row (any column, including status) or grant `owner`, and
    nobody can change their own role or status (`42501`).
- `user_id` is not writable through the API (not in the insert or update
  grants). A login is attached only by `accept_invitation()` (which refuses an
  invitation that names an owner row) and `create_organization()`.
- `my_memberships()` returns the caller's memberships in every status; table
  policies show only active ones.

## `organization_invitations`

A pending invitation for someone to join as staff. Accepting it creates or
links the `organization_members` row.

| Column        | Type          | Null | Default                     | Notes                                                |
| ------------- | ------------- | ---- | --------------------------- | ---------------------------------------------------- |
| `email`       | `text`        | no   |                             |                                                      |
| `role`        | `org_role`    | no   | `'worker'`                  | Can't be `owner`                                     |
| `member_id`   | `uuid`        | yes  |                             | Composite FK. Links to an existing login-less member |
| `token_hash`  | `text`        | no   |                             | SHA-256 of the invite token. Unique                  |
| `invited_by`  | `uuid`        | yes  |                             | FK → `auth.users`                                    |
| `expires_at`  | `timestamptz` | no   | `now() + interval '7 days'` |                                                      |
| `accepted_at` | `timestamptz` | yes  |                             |                                                      |

Partial unique index: `(organization_id, email) where accepted_at is null`.
Invitations are accepted via the `public.accept_invitation(token)` RPC.
`teams.invite` verifies owner/admin membership in the selected organization,
then inserts through the caller's Supabase client (RLS still applies). It generates
32 random bytes server-side and stores only their SHA-256 token hash, with a
seven-day expiry. A pending-email conflict rotates the existing row's token,
role and expiry. The server emails a fixed-origin acceptance URL with Resend;
if sending cannot be confirmed, the saved invite remains usable via copy link.
Only the latest generated link works.

`teams.acceptInvite` requires authentication but no prior team membership. It
passes only the token to `accept_invitation` with caller credentials and returns
the accepted organization ID. The RPC validates expiry, single use and invited
email, and creates/links membership and consumes the invitation atomically.
GETs, auth forms and confirmation callbacks never accept an invitation.

## `member_pay_rates`

Effective-dated hourly rates. The rate in force on date D is the row with the
greatest `effective_from <= D`.

| Column              | Type     | Null | Default | Notes                                                   |
| ------------------- | -------- | ---- | ------- | ------------------------------------------------------- |
| `member_id`         | `uuid`   | no   |         | Composite FK → `organization_members` on delete cascade |
| `hourly_rate_cents` | `bigint` | no   |         | Check `>= 0`                                            |
| `effective_from`    | `date`   | no   |         |                                                         |
| `notes`             | `text`   | yes  |         |                                                         |

`unique (organization_id, member_id, effective_from)`. RLS: owner/admin only.

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

## `time_off`

Sick days, vacation and personal time (`20261029190000_team_availability`).
Only `approved` rows make someone unavailable; the Team → Availability board
combines them with each member's `work_days` and the company's
`settings.business_hours` (a closed day is closed for everyone).

| Column                                            | Type              | Notes                                                           |
| ------------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| `member_id`                                       | `uuid`            | Composite FK → `organization_members`, cascade                  |
| `kind`                                            | `time_off_kind`   | `sick`, `vacation`, `personal`                                  |
| `start_date`, `end_date`                          | `date`            | Inclusive; at most 366 days                                     |
| `note`, `review_note`                             | `text`            | ≤ 500 chars                                                     |
| `status`                                          | `time_off_status` | `pending` → `approved` / `declined`; `cancelled` withdraws it   |
| `requested_by_member_id`, `reviewed_by_member_id` | `uuid`            | Who asked and who reviewed (set null if that member is removed) |
| `reviewed_at`                                     | `timestamptz`     | Set when approved or declined                                   |

RLS: office staff (owner, admin, dispatcher) read the company's time off;
everyone reads their own. There are no write grants; every change goes
through these `security definer` functions (executable by `authenticated`):

| Function                                          | Who               | Does                                                                    |
| ------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| `request_time_off(org, kind, start, end, note)`   | Any active member | Pending request for yourself. No past dates                             |
| `record_time_off(member, kind, start, end, note)` | Owner, admin      | Approved time off for anyone in the company                             |
| `review_time_off(id, approve, note)`              | Owner, admin      | Pending → approved / declined. Not your own request (`42501`)           |
| `cancel_time_off(id)`                             | Member or manager | Members cancel their own pending request; managers cancel anything open |

Overlapping pending or approved time off for the same member is refused
(`55000`). Owners and admins edit `work_days`, `work_start` and `work_end`
through the existing member update policy.

### Company logo references

`organizations.logo_path` contains either a legacy relative path in the private
`org-files` bucket (`{organizationId}/branding/...`) or the complete public HTTPS
URL returned by `upload-image`, including its version query. Settings and the
public request portal sign legacy paths and return public URLs directly.
Owners/admins may set or clear their organization's reference. New uploads use
`company_logos/{organizationId}/logo.jpg|png|webp`; no new logos go to `org-files`.
Replacing or removing a legacy reference cleans up that legacy file only after
the reference update succeeds. Clearing a public reference does not delete the
R2 object or revoke a previously shared URL.
