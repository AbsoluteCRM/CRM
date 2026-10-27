# Quotes

A quote is a priced proposal sent to a client, optionally for one of their
properties. An approved quote is converted into a [job](jobs-visits.md#jobs),
which copies its counted lines (non-optional lines plus the optional lines
the client selected) into `job_line_items`.

**The database owns the arithmetic.** Line amounts are generated columns.
Tax rows snapshot their rate and compute their own amount. Quote totals are
recalculated by triggers. The app never writes amounts or totals.

Standard columns are described in the [README](../README.md#conventions).
Migration: `quotes`.

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

| Column                | Type           | Null | Default      | Notes                                                                                         |
| --------------------- | -------------- | ---- | ------------ | --------------------------------------------------------------------------------------------- |
| `number`              | `text`         | no   |              | `Q-1001`, set by the `assign_number` trigger. `unique (organization_id, number)`              |
| `client_id`           | `uuid`         | no   |              | Composite FK → `clients`, on delete restrict                                                  |
| `property_id`         | `uuid`         | yes  |              | FK `(organization_id, client_id, property_id) → properties`, so it must belong to the client  |
| `status`              | `quote_status` | no   | `'draft'`    |                                                                                               |
| `title`               | `text`         | no   |              |                                                                                               |
| `message`             | `text`         | yes  |              | Client-facing note                                                                            |
| `internal_notes`      | `text`         | yes  |              | Never returned by portal RPCs                                                                 |
| `request_id`          | `uuid`         | yes  |              | Composite FK → `requests`, restrict. Set only by `create_quote_draft`                         |
| `revision`            | `integer`      | yes  |              | 1, 2, … per request. Null exactly when `request_id` is null                                   |
| `conditions`          | `text`         | yes  |              | Client-facing terms, e.g. "price subject to a site visit". Up to 4000 characters              |
| `valid_until`         | `date`         | yes  |              | Required to send. The `expire-quotes` cron job expires sent quotes past this date (org-local) |
| `subtotal_cents`      | `bigint`       | no   | `0`          | Trigger-maintained: sum of **counted** line amounts                                           |
| `tax_cents`           | `bigint`       | no   | `0`          | Trigger-maintained: sum of counted lines' taxes                                               |
| `total_cents`         | `bigint`       | no   | —            | Generated: `subtotal_cents + tax_cents`                                                       |
| `sent_at`             | `timestamptz`  | yes  |              | Set by trigger                                                                                |
| `approved_at`         | `timestamptz`  | yes  |              | Set by trigger                                                                                |
| `approved_by_user_id` | `uuid`         | yes  |              | FK → `auth.users`: the portal user or staff who approved                                      |
| `declined_reason`     | `text`         | yes  |              |                                                                                               |
| `created_by`          | `uuid`         | yes  | `auth.uid()` | FK → `auth.users`                                                                             |

Indexes: `unique (organization_id, id)`, `unique (organization_id, request_id, revision)`
(also serves the request FK),
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

| Column               | Type                | Null | Default    | Notes                                                              |
| -------------------- | ------------------- | ---- | ---------- | ------------------------------------------------------------------ |
| `quote_id`           | `uuid`              | no   |            | Composite FK → `quotes`, on delete cascade                         |
| `service_id`         | `uuid`              | yes  |            | Composite FK → `services`, `on delete set null (service_id)`       |
| `position`           | `integer`           | no   |            | Display order                                                      |
| `description`        | `text`              | no   |            |                                                                    |
| `quantity`           | `numeric(10,2)`     | no   | `1`        | Check `> 0`                                                        |
| `unit_price_cents`   | `bigint`            | no   |            | Check `>= 0`                                                       |
| `amount_cents`       | `bigint`            | no   | —          | Generated: `round(quantity * unit_price_cents)::bigint`            |
| `is_optional`        | `boolean`           | no   | `false`    | An add-on the client can choose                                    |
| `is_selected`        | `boolean`           | no   | `false`    | For optional lines: whether the client chose it                    |
| `frequency`          | `service_frequency` | no   | `one_time` | How often the client is billed for the line                        |
| `season_start_month` | `smallint`          | yes  |            | First active month, 1-12. Null with the end month = year-round     |
| `season_end_month`   | `smallint`          | yes  |            | Last active month, 1-12. A start after the end wraps over new year |

The two month columns are both set or both null (check
`quote_line_items_season_both_or_neither`). They mirror
`services.season_start_month` / `season_end_month`, and a new line seeded from
a service copies the service's first frequency and its season. They freeze with
the rest of the line after draft, copy with a revision, and appear in the
portal JSON as `frequency`, `season_start_month` and `season_end_month`.

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
A sent quote's client, property, title, message, conditions, and `valid_until`
are fixed; pull it back to draft to change them. `request_id` and `revision`
never change.

Direct `UPDATE (is_selected)` is revoked from `authenticated`. Sending clears
all optional selections under the quote lock before the quote becomes sent;
only guarded approval RPCs can subsequently select optional items. The current
customer page does not offer optional selection and approves with an empty
selection, preserving the delivered counted total.

**Status is not writable through the API.** `update (status, declined_reason)`
is revoked from `authenticated`. Every status change goes through a function
(`send_quote`, `pull_back_quote`, `approve_quote`, `decline_quote`, the token
functions below, `private.job_from_quote`, and `private.expire_quotes`), and
each one calls `private.sync_request_status` for the quote's request. `conditions`
is the only new column staff can write directly.

## Revisions and request status

A request can have many quotes. `create_quote_draft(request_id, copy_from_quote_id
default null)` locks the request, allocates the next `revision`, and (when the
request has no client) creates one from the request's contact name, email and
phone. It leaves `property_id` null, because `requests.address` is free text.
With a source quote it copies the message, notes, conditions, lines, and line
taxes (not `valid_until`). Sending a revision expires the request's previously
sent one and revokes its link.

`private.sync_request_status(org, request)` derives the request's status from
all its quotes: any `converted` gives `converted`, else any `approved` gives
`approved`, else any `sent` gives `estimated`, else any quote gives `reviewing`.
It never changes a request that is `rejected` or `scheduled`; staff own those
through `requests.status`. A request with no quotes is left alone.

## Staff functions

`security definer`, empty `search_path`, executable by `authenticated` only
(revoked from `public` and `anon`), and each checks that the caller is an
active owner, admin or dispatcher of the quote's (or request's) org. Anyone
else gets `P0002` (not found).

| Function                                       | Purpose                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `create_quote_draft(request_id, copy_from)`    | New draft revision (see above). Returns the quote id. Refuses a `converted` request (`55000`)                                                          |
| `send_quote(quote_id, token_hash)`             | Draft → sent. Needs `valid_until` today or later, a client email and at least one line (`55000`). Inserts the share token. Returns the token id        |
| `pull_back_quote(quote_id)`                    | Sent → draft. Revokes the live token                                                                                                                   |
| `rotate_quote_token(quote_id, new_token_hash)` | Resend: revokes the live token and inserts a new one with `delivery_attempts + 1`. Locks the quote and token, so concurrent calls leave one live token |

## `quote_messages`

Append-only plain-text conversation for one quote revision. Migration:
`20261027214207_quote_conversation`, applied to the remote project.
Standard `id`, `organization_id`, `created_at` and `updated_at` columns apply.

| Column              | Type             | Notes                                                                                             |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `quote_id`          | `uuid`           | Composite FK `(organization_id, quote_id)` → quotes; delete restrict                              |
| `body`              | `text`           | Nonempty, contains a non-whitespace character, maximum 4000 characters                            |
| `sender_kind`       | `text`           | `staff` or `customer`; assigned by the posting RPC                                                |
| `staff_user_id`     | `uuid`, nullable | Staff caller's `auth.uid()`; FK to auth.users, delete set null. Always null for customer messages |
| `client_message_id` | `uuid`           | Client-generated retry key, unique with organization_id, quote_id and sender_kind                 |

Index `(organization_id, quote_id, created_at desc, id desc)` supports history
and the quote FK; `staff_user_id` is indexed too. Office staff can select under
RLS; authenticated callers cannot directly insert, update or delete. Workers,
portal accounts, nonmembers, `anon` and `PUBLIC` have no table access. The safe
application DTO returns only id, body, sender_kind and created_at; staff are
labelled Team and bearer-link authors Customer.

| Function                                                                 | Access                                      | Behavior                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `post_quote_message(organization_id, quote_id, body, client_message_id)` | authenticated active owner/admin/dispatcher | Checks exact organization and quote, assigns session attribution; service_role cannot execute                                    |
| `portal_token_list_messages(token_hash, before_created_at?, before_id?)` | service_role only                           | Validates bearer token; newest 50, ordered by `(created_at, id)` descending. Cursor fields must both be supplied or both omitted |
| `portal_token_post_message(token_hash, body, client_message_id)`         | service_role only                           | Derives quote and organization from token; writes customer attribution                                                           |

All functions use an empty search_path and explicit grants/revokes. Both
posting paths lock the quote before checking its live token. Posting requires
sent, approved or declined and a token that is not revoked or expired.
Acceptance/decline does not close the chat; original link expiry does. Staff
retain history after expiry, pullback and supersession. Drafts cannot receive
messages. Rotating a token retains the same quote's thread; revisions have
separate threads.

Retrying the same key, body and staff identity returns the original message;
reusing a key with different content or staff identity raises `23505`. Customer
quota is 10 new messages per 60 seconds and 100 per 24 hours, shared by holders
of that quote's link, including after rotation. Quote locking serializes the
check and insert. Duplicate retries do not consume quota; excess raises
`P0001` / `quote_message_rate_limited`. Invalid tokens give the same `P0002`
for reads and writes. No raw tokens or IP addresses are kept in messages.

## `quote_share_tokens`

One row per issued magic link. The server generates a random token and passes
only its SHA-256 hex hash (`token_hash`, checked as 64 lowercase hex characters);
the raw token exists only in the email.

| Column                                     | Type                    | Notes                                                       |
| ------------------------------------------ | ----------------------- | ----------------------------------------------------------- |
| `quote_id`                                 | `uuid`                  | Composite FK → `quotes`, cascade                            |
| `token_hash`                               | `text`                  | Unique                                                      |
| `expires_at`                               | `timestamptz`           | Start of the day after `valid_until`, org-local time        |
| `revoked_at`, `viewed_at`                  | `timestamptz`           | `viewed_at` is stamped on first view                        |
| `delivery_status`                          | `quote_delivery_status` | `pending`, `sent`, `failed`. Set by `record_quote_delivery` |
| `delivery_attempts`                        | `integer`               | Starts at 1; a resend adds 1                                |
| `resend_message_id`, `last_delivery_error` | `text`                  | From the email provider                                     |

A partial unique index allows one live (unrevoked) token per quote. RLS: office
staff can select, with column grants that leave out `token_hash`. Nobody can
insert, update or delete through the API.

## Magic-link functions

For the public quote page (`/q/$token`). `security definer`, executable by
`service_role` only (revoked from `public`, `anon` and `authenticated`), reached
through trusted server code. All of them resolve the token with
`private.resolve_quote_token`: hash matches, not revoked, `expires_at` in the
future, and the quote in an allowed status. Any failure raises `P0002`, the
same error for an unknown, expired, revoked, pulled-back or superseded link.

| Function                                           | Purpose                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `portal_token_get_quote(token_hash)`               | jsonb: quote, totals, org name, client name, lines. Allowed for `sent`, `approved` and `declined`. Stamps `viewed_at` |
| `portal_token_approve(token_hash, selected_ids)`   | `sent` → `approved`, setting `is_selected` on optional lines                                                          |
| `portal_token_decline(token_hash, reason)`         | `sent` → `declined`                                                                                                   |
| `record_quote_delivery(token_id, status, id, err)` | Records the email outcome (`sent` or `failed`) on a live token                                                        |

Internal notes are never returned. The approving user is not recorded
(`approved_by_user_id` stays null for link approvals).

## Portal RPCs

For signed-in portal users. All are `security definer`, limited to
`private.portal_clients()`, and exclude `draft` quotes and internal columns.
`approve_quote` and `decline_quote` also sync the linked request's status.

| Function                                                                  | Purpose                                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `portal_my_quotes()`                                                      | The caller's quotes: number, status, title, message, totals, dates                              |
| `portal_quote_lines(quote_id)`                                            | Lines with amount and tax per line, `is_optional`, `is_selected`                                |
| `approve_quote(quote_id, selected_optional_line_ids uuid[] default '{}')` | `sent` → `approved`. Sets `is_selected` on optional lines. Rejects expired quotes. Returns void |
| `decline_quote(quote_id, reason text default null)`                       | `sent` → `declined`. Returns void                                                               |

Errors: `P0002` quote not found or not yours, `55000` wrong status or
expired, `42501` not signed in.

## Scheduled jobs

`expire-quotes` (pg_cron, `15 * * * *`, hourly so each timezone expires after its
own midnight) calls `private.expire_quotes()`. It moves `sent` quotes whose
`valid_until` is before the org-local date to `expired`, then syncs each linked
request's status.
