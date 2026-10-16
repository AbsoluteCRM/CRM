# Requests

Inbound service requests from the public portal (`/portal/$orgSlug`). See
[the plan](../../plans/client-request-portal.md).

## `requests`

| Column                                             | Type             | Null          | Default       | Notes                                                                       |
| -------------------------------------------------- | ---------------- | ------------- | ------------- | --------------------------------------------------------------------------- |
| `id`                                               | `uuid`           | no            | uuid v7       | PK                                                                          |
| `organization_id`                                  | `uuid`           | no            |               | FK to `organizations`, cascade                                              |
| `client_id`                                        | `uuid`           | yes           |               | Composite FK to `clients`, set null on delete. Staff link it later          |
| `service_id`                                       | `uuid`           | no            |               | Composite FK to `services`, restrict                                        |
| `contact_name` / `contact_email` / `contact_phone` | `text`           | no / no / yes |               | Prospect details. Email is lower-cased                                      |
| `address`                                          | `text`           | no            |               | Service address as typed                                                    |
| `notes`                                            | `text`           | yes           |               | Up to 4000 characters                                                       |
| `status`                                           | `request_status` | no            | `'submitted'` | `submitted, reviewing, estimated, approved, rejected, scheduled, converted` |
| `source`                                           | `request_source` | no            | `'web_form'`  | `web_form, phone, email, client_portal`                                     |
| `submitted_at`, `created_at`, `updated_at`         | `timestamptz`    | no            | `now()`       |                                                                             |

Indexes: `(organization_id, status, submitted_at desc)`,
`(organization_id, service_id)`, `(organization_id, client_id)`.

**RLS**: owners, admins and dispatchers can select and update (only `status`
and `client_id` are grantable). Workers have no policy. There is no insert
policy: rows are created only by `submit_request`.

## `request_submission_log`

One row per accepted public submission, used for rate limiting (5 per IP and
50 per organization per hour). `ip_hash` is an HMAC-SHA256 of the visitor IP
computed by the server with `PORTAL_IP_HMAC_KEY`, so raw IPs are never stored.
Rows older than 24 hours are deleted on each submit. RLS is on with no
policies and no grants to `anon` or `authenticated`.

## Functions

Both are `security invoker`, have an empty `search_path`, and are executable by
`service_role` only. The public portal reaches them through trusted server
code (`src/server/trusted/portal.ts`).

- `get_portal(p_slug)`: organization name and non-archived services
  (whitelisted columns: name, description, unit, price, duration, color,
  frequencies, season months).
- `submit_request(...)`: checks the slug, that the service belongs to the
  organization and is not archived, applies the rate limits, then inserts.
  Raises `portal_not_found`, `portal_invalid_service` or
  `portal_rate_limited`.
