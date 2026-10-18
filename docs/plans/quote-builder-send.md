# Plan: Quote builder and send

- **Slug / branch**: `quote-builder-send` / `feat/quote-builder-send`
- **Tier**: full (migration, RLS, tRPC, public token route, email)
- **Status**: approved
- **Confidence**: ~90%. Choices rest on the user's answers below. Still assumed: the items in Assumptions marked "no".

## Original request

> I would now like to start building the request update flow. Currently we can read requests sent by clients so I am trying to ideat how the flow should work from here. The admin should be able build a quote for the request but there should be a flow for sending the quote and communications with the client.

## Goal

From a request, an owner, admin or dispatcher builds a quote (with revisions), previews it, and sends it to the client by email through Resend. The client opens a magic link (no login) to view the quote and approve or decline it. Request status follows the quote status. The message thread, reminders and the client portal are out of scope.

## Decisions

| #   | Question               | Answer                                                                                                                                          |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | PR scope               | Builder and send only (phases 1 and 2).                                                                                                         |
| Q2  | Email                  | Resend. User supplies `RESEND_API_KEY` and a verified sending domain; per-org reply-to.                                                         |
| Q3  | Revisions              | One request has many quotes. Quotes get `request_id` and `revision`. Sending a new revision supersedes (expires) the previously sent one.       |
| Q4  | Contingent quotes      | Free-text `conditions` on the quote, shown to the client. Plus a "needs info" note on the request (site visit, square footage, property count). |
| Q5  | Client access          | Magic link, no login. View, approve and decline. Token is per quote, stored hashed, expires with `valid_until`.                                 |
| Q6  | Thread                 | Per request, but deferred. This PR has no thread; the quote's client-facing message is the only text sent.                                      |
| Q7  | Who                    | Owner, admin, dispatcher only.                                                                                                                  |
| Q9  | Request with no client | `Build quote` creates a client from the request's contact details (and property if given) in one atomic step, then links it to the request.     |
| Q8  | Client changes         | Clients cannot request changes in the app. Only approve or decline; changes happen verbally.                                                    |

Agent defaults (the user may veto):

- **D1**: Sending is the only way to issue a token. Pull-back-to-draft revokes it. A resend rotates it.
- **D2**: Approve and decline by token run as service-role code in `src/server/trusted/` calling a SQL function, because the caller has no session (ADR 0009 exception, trusted code only).
- **D3**: Request status is recomputed from all revisions by `sync_request_status` (see Schema), not set per event.

## Open questions

- none (`quotes.request_id` is nullable so quotes can exist without a request).

## Assumptions

| Assumption                                                                                                         | User-confirmed? |
| ------------------------------------------------------------------------------------------------------------------ | --------------- |
| The existing `status_transition` trigger on quotes stays as is; supersede uses the existing `sent → expired` edge. | no              |
| `requests.status` is writable by owner, admin, dispatcher (per docs/database/tables/requests.md RLS).              | no              |
| Existing `approve_quote` / `decline_quote` RPCs require `auth.uid()`, so token flows need a new function.          | no              |
| Resend is called from the server only; the key never reaches the client.                                           | yes (Q2)        |

## Design refs

- Mock: none, UI proposed below.
- Screens: new `docs/requests/ui.md` sections: request detail, quote builder, send dialog, public quote page.

## Layers touched

- [x] Migration
- [x] RLS policies / pgTAP tests
- [x] `docs/database`
- [x] Types
- [x] Middleware (org scope on new procedures)
- [x] tRPC procedures
- [x] Routes / loaders
- [x] UI components
- [x] Stories
- [x] Tests
- [x] Sentry
- [x] Design record

Security-gated paths touched: migrations, tRPC, server-only code (`src/server/trusted/`), routes (public token route), env (`src/env.ts`, `.env.example`), `rls.md`. The `security` agent gates the merge.

## Changes

### Schema

Migration `quote_request_link_and_send_tokens`:

- `quotes`: add `request_id uuid` (composite FK `(organization_id, request_id)` to `requests`, on delete restrict), `revision int` (null when `request_id` is null; check `(request_id is null) = (revision is null)`), `conditions text`. `unique (organization_id, request_id, revision)`. Index on `(organization_id, request_id)`.
- Column grants (least privilege, per rls.md "Three layers"): `grant insert (request_id, ...)` and `update (conditions, ...)` on `quotes` for exactly the new staff-writable columns (`request_id`, `conditions`; `revision` is never client-writable), and `update (info_needed)` on `requests` in addition to the existing `status`, `client_id`. Procedures run on the session client; pgTAP verifies them as each role.
- `requests`: add `info_needed text` (internal "needs info" note).
- `quote_share_tokens`: `id`, `organization_id`, `quote_id` (composite FK), `token_hash text unique`, `expires_at`, `revoked_at`, `created_at`, `viewed_at`. Only the SHA-256 hash is stored. RLS enabled with staff select only and no client write path; writes happen through SQL functions.
- `create_quote_draft(request_id, copy_from_quote_id)` (`security definer`, fixed empty `search_path`, explicit owner/admin/dispatcher check for the request's org, revoke/grant as above, granted to `authenticated`; `revision` stays ungranted for direct writes): locks the request row (`for update`), allocates `revision = max(revision)+1`, and, if `requests.client_id` is null, creates the client only from the request's contact details and sets `requests.client_id`, all in one transaction (Q9). `quotes.property_id` stays null: `requests.address` is free text and a property needs `city`, so no property is invented; staff can add one to the client later. Concurrent-create pgTAP test.
- Supersede (`sent → expired` of the prior sent revision for the same request) happens in `send_quote`, in one transaction.
- `valid_until` is required to send: `send_quote` rejects null. `expires_at` is derived from `valid_until` end of day in the org timezone, `not null`. Token functions reject at or after `expires_at`.
- Delivery state (outbox-lite) on `quote_share_tokens`: `delivery_status` (`pending`, `sent`, `failed`), `resend_message_id`, `delivery_attempts`, `last_delivery_error`.
- Functions: `send_quote(quote_id, token_hash)` (security invoker, staff; one transaction: validates `valid_until` and client email, moves to `sent`, supersedes the prior revision, inserts the token with `delivery_status = 'pending'`; the raw token is generated by the server and only its hash reaches the DB). `portal_token_get_quote(token_hash)`, `portal_token_approve(token_hash, selected_optional_line_ids)`, `portal_token_decline(token_hash, reason)`: `security definer` with a fixed `search_path`, granted to `service_role` only and called only by trusted code (tokens are the credential; no RLS path exists for the anonymous caller, and none is added). `send_quote` and `rotate_quote_token` are `security definer` with an explicit active owner/admin/dispatcher check for the caller's org (the `token_hash` insert has no staff insert grant or policy), granted to `authenticated`. Every function has an explicit `revoke execute ... from public, anon, authenticated` before its grant. pgTAP privilege tests assert `anon` cannot execute them.
- `sync_request_status(request_id)`, called at the end of `create_quote_draft`, `send_quote`, `portal_token_approve`, `portal_token_decline`, pull-back, and the `expire-quotes` job (updated to call it). Status is a deterministic function of all revisions: any `approved` quote gives `approved`; else any `sent` gives `estimated`; else any `draft`, or only `declined`/`expired` quotes, gives `reviewing`. A converted quote gives `converted` (`private.job_from_quote` calls `sync_request_status` after the quote transition; pgTAP covers it). Precedence: staff own `rejected` and `scheduled` via the existing `requests.setStatus`; `sync_request_status` never overrides those two, so staff reopen a rejected request by setting it back to `reviewing`. `requests.setStatus` is kept, and its UI hides statuses the quote lifecycle owns (`estimated`, `approved`, `converted`).
- `rotate_quote_token(quote_id, new_token_hash)`: locks the quote row and the current token row, requires quote `sent` and the current token's `delivery_status` in (`pending`, `failed`) or an explicit staff resend, revokes the current token, inserts the new one (`delivery_attempts + 1`), returns nothing. Partial unique index allows one non-revoked token per quote. The Resend idempotency key is the new token row's id. pgTAP: concurrent rotate, and rotate after a crash before status update.
- Revoke `update (status, declined_reason)` on `quotes` from `authenticated`; all quote status changes go through the guarded functions (`send_quote`, a new `pull_back_quote` that also revokes the live token, and the existing/new approve and decline paths). The existing portal `approve_quote` / `decline_quote` RPCs are left as is and also call `sync_request_status`. Update `docs/database/tables/quotes.md` and `rls.md`; pgTAP proves direct staff status updates are denied.
- One active-token predicate shared by every `portal_token_*` function: hash match, `revoked_at is null`, `expires_at > now()`, joined quote `status = 'sent'`, same organization. Any failure returns the same not-found result. pgTAP covers pull-back, supersede, expiry and revoked tokens for get, approve and decline.
- Extend the `quote_before_update` guard to freeze `conditions` and `valid_until` once the quote leaves `draft`; pgTAP tests direct updates as staff.
- pgTAP: cross-tenant, per-role, token expired / revoked / wrong quote, superseded revision cannot be approved.

### Middleware

Reuse the org-scoped procedure and `ctx.supabase` pattern already used by `requests.ts` and `clients.ts`. The public token path uses `src/server/trusted/` only.

### Procedures

| Procedure                          | Input                                                        | Output                  | Roles                    |
| ---------------------------------- | ------------------------------------------------------------ | ----------------------- | ------------------------ |
| `quotes.listForRequest`            | request_id                                                   | quotes with totals      | owner, admin, dispatcher |
| `quotes.get`                       | quote_id                                                     | quote with lines        | owner, admin, dispatcher |
| `quotes.createDraft`               | request_id, copy_from_quote_id? (calls `create_quote_draft`) | quote                   | owner, admin, dispatcher |
| `quotes.update`                    | quote_id, title, message, conditions, valid_until            | quote                   | owner, admin, dispatcher |
| `quotes.upsertLine` / `deleteLine` | line fields (no amounts)                                     | line                    | owner, admin, dispatcher |
| `quotes.send`                      | quote_id                                                     | quote + delivery status | owner, admin, dispatcher |
| `quotes.retryDelivery`             | quote_id (calls `rotate_quote_token`)                        | delivery status         | owner, admin, dispatcher |
| `quotes.pullBack`                  | quote_id                                                     | quote                   | owner, admin, dispatcher |
| `requests.setInfoNeeded`           | request_id, note                                             | request                 | owner, admin, dispatcher |

Token endpoints (not tRPC, server routes under `src/routes/q.$token.*`): view, approve, decline. Token read from the path, hashed, passed to the trusted function. Rate limited by IP in the server handler.

### Routes and UI

| Route                                          | Screen                                                                                 | States                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `/_authed/requests/$requestId`                 | Request detail, quote revisions list, needs-info note, action                          | loading, empty, error, populated                                 |
| `/_authed/requests/$requestId/quotes/$quoteId` | Builder: lines, optional lines, taxes, message, conditions, valid_until, preview, send | loading, error, draft, sent (read-only)                          |
| `/q/$token`                                    | Public quote page: lines, optional selection, approve, decline                         | loading, invalid/expired/revoked, superseded, approved, declined |

### Acceptance criteria

1. Staff can create a draft from a request and edit lines; totals come from the DB.
2. Send commits the quote as `sent` with a token, then emails the client a link through Resend; delivery status is shown and failed delivery can be retried; the request becomes `estimated`.
3. A new revision, once sent, expires the previous sent revision and its link stops working.
4. The link shows the quote without login; approve and decline work once and update request status.
5. Expired, revoked, superseded and unknown tokens show the same generic invalid page and leak nothing.
6. Other roles and other orgs cannot read or write quotes or tokens.

## Commits

1. `Add quote request link and share token schema` (main agent): migration (incl. grants, revokes, `create_quote_draft`), applied to remote, `docs/database`, rls.md, pgTAP, types.
2. `Add quote tRPC procedures` (implementer): procedures and tests.
3. `Add Resend sender and token trusted module` (implementer): env, `src/server/trusted/`, tests with a mocked Resend client.
4. `Add request detail and quote builder UI` (implementer): routes, components, stories.
5. `Add public quote page` (implementer): token routes, page, stories.
6. `Document quote flow design record` (implementer): `docs/requests/ui.md`, shots.

## Unhappy paths

- Send ordering (decided): commit first (quote `sent` + token `pending`), then call Resend with an idempotency key, then record `delivery_status`. On Resend failure the quote stays `sent`, status `failed`, the UI shows "Email not delivered" with a Retry action. Retry calls `rotate_quote_token` (the raw token is not stored, so a resend needs a new one and revokes the old one); the UI warns that the previous link stops working. Staff can also pull back to draft.
- Server crash between commit and email: token stays `pending`; the UI shows "Not yet delivered" with Retry.
- Double click on send or approve: functions are idempotent on status; second call returns the status error.
- Token for a quote pulled back to draft: revoked, shows invalid.
- Approve after `valid_until`: rejected as expired.
- Client has no email: send is blocked with a message. Recipient email is `clients.email`; for a client created from a request it is the request's `contact_email`.
- `valid_until` missing: send is blocked with a message.
- Request with no client: `create_quote_draft` creates one atomically (Q9); a failure rolls back both.
- Two staff edit the same draft: last write wins; sent quotes reject edits.

## Out of scope

Message thread, inbound email, reminders, SMS, client portal accounts, client change requests, PDF export.

## Dependencies not to add

Only `resend`. No email-template library; use plain HTML strings or a small React template already in the repo.

## Verify command

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

Workflow Definition of done, plus: send a real email to a test address through Resend and open the link in a signed-out browser; approve and decline each once.

## Audit log

### Round 1 (`rubber-duck`, since `plan-auditor`'s pinned model was unavailable): needs-changes

| #   | Blocking finding                                    | Resolution                                             |
| --- | --------------------------------------------------- | ------------------------------------------------------ |
| 1   | Revision allocation collides with unique constraint | fixed: `create_quote_draft` allocates under a row lock |
| 2   | Requests with no client cannot be quoted            | fixed: Q9, atomic client creation                      |
| 3   | Missing column grants                               | fixed: explicit grants                                 |
| 4   | Null `valid_until` gives a non-expiring token       | fixed: required to send; `expires_at` not null         |
| 5   | Missing revokes on service-role functions           | fixed: revoke/grant, invoker, pgTAP                    |
| 6   | Email/state ordering unresolved                     | fixed: commit first, delivery status, retry            |

### Round 2 (`rubber-duck`): needs-changes

| #   | Blocking finding                                | Resolution                                                                        |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Invoker `send_quote` cannot insert tokens       | fixed: security definer with explicit role check                                  |
| 2   | Retry rotation not atomic                       | fixed: locked `rotate_quote_token`, one live token index, idempotency key         |
| 3   | Request status sync underspecified              | fixed: `sync_request_status` deterministic over all revisions, also in expiry job |
| 4   | Property cannot be built from free-text address | fixed: client only, property stays null                                           |

- **Non-blocking adopted**: freeze `conditions` and `valid_until` after draft.

### Round 3 (`rubber-duck`): needs-changes

| #   | Blocking finding                               | Resolution                                                    |
| --- | ---------------------------------------------- | ------------------------------------------------------------- |
| 1   | `create_quote_draft` cannot write `revision`   | fixed: security definer with role check                       |
| 2   | Direct staff status update bypasses invariants | fixed: revoke status update grant; `pull_back_quote` function |
| 3   | Read function must reject revoked/superseded   | fixed: one shared active-token predicate                      |

### Round 4 (`rubber-duck`): needs-changes

| #   | Blocking finding                                              | Resolution                                                                                  |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Manual `requests.setStatus` can override quote-derived status | fixed: explicit precedence; staff own `rejected`/`scheduled`; UI hides quote-owned statuses |
| 2   | Quote conversion leaves request `approved`                    | fixed: `job_from_quote` calls `sync_request_status`, maps to `converted`                    |

- Verified clean: revoking `update(status, declined_reason)` does not break triggers, cron, RPCs or job conversion.
- Escalation: this exceeds the 3-round cap, so the plan goes to the user. The round-4 fixes have not been re-audited.

## Scope-change log

- **Commit 1 (migration)**, additions found while building, none changing the approved outcome:
  - `record_quote_delivery(token_id, status, message_id, error)`, service-role only: the trusted server needs a way to write the email outcome that the plan's `delivery_status` implies.
  - `portal_token_get_quote` also serves `approved` and `declined` quotes (still not `expired`, pulled-back or superseded ones), so reopening the link shows the outcome; approve and decline still require `sent`. The plan's "single predicate" is one function, `private.resolve_quote_token`, taking the allowed statuses.
  - `send_quote` also refuses a quote with no lines.
  - `create_quote_draft` refuses a `converted` request and copies message, notes, conditions, lines and taxes (not `valid_until`) when given a source quote.
  - `request_id` has no direct insert grant (the plan's grant list included it); only `create_quote_draft` writes it. `conditions` is the only new direct grant on `quotes`.
  - The `(organization_id, request_id)` index is the unique `(organization_id, request_id, revision)` index, not a separate one.
  - Validated on a scratch Supabase Postgres (all migrations plus the new one) and `supabase/tests/quote_request_link_test.sql`, 48 of 48 passing; the three existing pgTAP files still pass. Concurrent `create_quote_draft` and `rotate_quote_token` rely on row locks and are not exercised by the single-session test.
- **Commit 2 (tRPC procedures)**, done by the main agent (the `implementer` agent's pinned model is unavailable):
  - `quotes.send` and `quotes.retryDelivery` move to commit 3, because they need the Resend sender and token module. Commit 2 ships the other procedures.
  - `quotes.upsertLine` takes `taxRateIds` and replaces the line's taxes (delete, then insert); the database fills percentage and amount.
  - `requests.info_needed` is now in `REQUEST_COLUMNS`. DB error codes map through the new `errors.ts` (`P0002` not found, `55000` conflict).
