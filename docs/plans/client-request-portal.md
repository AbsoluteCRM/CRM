# Plan: Client request portal

- **Slug / branch**: `client-request-portal` / `feat/client-request-portal`
- **Tier**: full (schema, anonymous write path, tRPC, UI)
- **Status**: approved
- **Confidence**: 95%. Scope, access, fields, write path, spam control and
  internal wiring rest on user answers. The assumptions below are minor agent
  defaults the user may veto at approval; none changes the architecture.

## Original request

> Following along with the internal Services page - i now need to build out the external services page. This page will service as the request portal for clients to send requests to an organization. It should display each service and when pressed open a modal to fill out information required for a request as per the requests table.

## Goal

A public page at `/portal/$orgSlug` lists the organization's non-archived
services. Pressing a service opens a modal that collects the visitor's
details and submits a real `requests` row. The internal Requests page reads
those rows.

## Decisions

| #   | Question        | Answer                                                                         |
| --- | --------------- | ------------------------------------------------------------------------------ |
| Q1  | DB scope        | Add a `requests` migration and tRPC submit (full vertical slice)               |
| Q2  | Access          | Public per-org URL `/portal/$orgSlug`, no login, prospect fields               |
| Q3  | Fields          | Name, email, phone, address, notes, preferred frequency (photos skipped, Q6)   |
| Q4  | Services shown  | All non-archived services of the org                                           |
| Q5  | Anonymous write | Trusted service-role procedure in `src/server/trusted`; validates slug+service |
| Q6  | Photos          | Skipped in this PR                                                             |
| Q7  | Anti-spam       | Honeypot field plus per-IP and per-org rate limit in the database              |
| Q8  | Internal page   | Also make the internal Requests list read real rows                            |
| Q9  | Client matching | None. Prospect fields only; staff links a client later                         |

## Open questions

None.

## Assumptions

| Assumption                                                                                                            | User-confirmed? |
| --------------------------------------------------------------------------------------------------------------------- | --------------- |
| Status enum `request_status` = `submitted, reviewing, estimated, approved, rejected, scheduled, converted` (the mock) | no              |
| Internal page wiring covers list, detail and status changes only. Quotes, scheduling and job conversion stay mock     | no              |
| Public page shows name, description, unit, default price and frequencies, never internal fields                       | no              |
| Rate limit: 5 submissions per IP per hour, 50 per org per hour                                                        | no              |

## Design refs

- Mock: `src/routes/_authed/requests.tsx` (`NewRequestModal`), `src/routes/_authed/services.tsx` card styling
- Screens: `docs/requests/ui.md` (new) with screenshots

## Layers touched

- [x] Migration, [x] RLS and pgTAP, [x] `docs/database`, [x] Types,
- [x] Middleware (public org lookup), [x] tRPC, [x] Routes, [x] UI,
- [x] Stories, [x] Tests, [x] Sentry, [x] Design record

Security-gated paths touched: migration, tRPC, `src/server/trusted`, service
client, routes, `rls.md`. The `security` agent gates the merge.

## Changes

### Schema

Migration `requests`:

- `create type request_status` (values above); `create type request_source as enum ('web_form','phone','email','client_portal')`.
- `requests`: `id uuid pk default private.uuid_generate_v7()`,
  `organization_id` FK cascade, `client_id uuid null` (composite FK to
  `clients (organization_id, id)`), `service_id uuid not null` (composite FK to
  `services (organization_id, id)`), `contact_name text not null`,
  `contact_email text not null check (= lower)`, `contact_phone text`,
  `address text not null`, `preferred_frequency service_frequency not null`,
  `notes text`, `status request_status not null default 'submitted'`,
  `source request_source not null default 'web_form'`, `submitted_at`,
  `created_at`, `updated_at`, `unique (organization_id, id)`. Length checks on
  text columns. Indexes: `(organization_id, status, submitted_at desc)`,
  `(organization_id, service_id)`, `(organization_id, client_id)`.
- `private.request_submission_log (id, organization_id, ip_hash text, created_at)`
  for rate limiting; `ip_hash` is HMAC-SHA256 of the IP keyed by a server-only
  secret (`PORTAL_IP_HMAC_KEY`, added to `src/env.ts` and `.env.example`).
  Rows older than 24 h are deleted on each submit. RLS on, no policies, no
  grants to `anon` or `authenticated`.
- `public.submit_request(...)`: `security invoker`, `set search_path = ''`,
  execute revoked from `public`, `anon`, `authenticated`; granted to
  `service_role` only. Not security-definer, so ADR 0009's definer rules do not
  apply. It resolves the slug, checks the service belongs to the org, is not
  archived and offers the chosen frequency (`= any(services.frequencies)`),
  checks both rate limits (per-IP 5/h, per-org 50/h) under a per-org advisory
  lock, inserts the log and request rows, and returns the id.
- RLS on `requests`: select and update for the roles where `can.manageRequests`
  is true (workers get no policy, per rls.md and ADR 0011), scoped by
  `organization_id`; no insert or delete for `authenticated` (inserts go through the function). Grants
  follow ADR 0009; updated-at trigger like other tables.
- Public read: `public.get_portal(p_slug)`, `security invoker`, empty
  `search_path`, `service_role` only; returns org name and non-archived
  services (whitelisted columns).

### Middleware

- `publicPortalProcedure` in `init.ts`: no auth, no org context. Uses the
  service client from `src/server/trusted/` only inside the two portal
  procedures, and takes the client IP from the platform's trusted header only (`X-Real-IP`
  set by the proxy, which overwrites client-supplied values; the deploy
  target's header is confirmed in commit 2). If absent, the submit is rejected,
  never bucketed as shared. Also adds `Sentry.trpcMiddleware` to the base
  procedure.

### Procedures

| Procedure            | Input                                                                                                                         | Output             | Roles allowed        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------- |
| `portal.get`         | `{ orgSlug }`                                                                                                                 | org name, services | public               |
| `portal.submit`      | `{ orgSlug, serviceId, name, email, phone?, address, frequency, notes?, website }` (`website` is the honeypot, must be empty) | `{ id }`           | public, rate-limited |
| `requests.list`      | none (filters `organization_id = ctx.organizationId`)                                                                         | rows               | `manageRequests`     |
| `requests.setStatus` | `{ id, status }` (filters `id` and `organization_id = ctx.organizationId`)                                                    | row                | `manageRequests`     |

### Routes and UI

| Route               | Screen                               | States                                                                                |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `/portal/$orgSlug`  | Service cards grid, request modal    | loading, unknown org (404), no services, populated, submitting, rate-limited, success |
| `/_authed/requests` | Real list and detail; status updates | loading, empty, error, populated                                                      |

The portal route sits outside `_authed`, has no app chrome, and uses the
existing UI primitives. The modal validates with zod on client and server.

### Acceptance criteria

1. An anonymous visitor sees only non-archived services of the slug's org.
2. Submitting creates one `requests` row with status `submitted`, in the right org.
3. A service from another org, an archived service, an unknown slug, a filled honeypot, and the 6th submission from an IP in an hour are all rejected without a row.
4. The 6th submission from one IP in an hour and the 51st into one org from distinct IPs are rejected; a frequency the service does not offer is rejected.
5. `anon` and `authenticated` cannot insert into or select from `request_submission_log`, and cannot call the functions.
6. A multi-org staff user with org A active never sees or changes org B rows; workers cannot select or update `requests`.
7. Internal Requests page lists the new row and `setStatus` persists.

## Commits

1. `Add requests table, submit function and RLS` (main agent: remote migration, types)
2. `Add portal and requests tRPC routers with tests` (implementer)
3. `Add public portal page and request modal` (implementer)
4. `Wire internal requests list to real rows` (implementer)
5. `Add stories, docs and design record` (implementer)

## Unhappy paths

- Invalid or empty fields: rejected by zod and by table checks.
- Rate limit hit: `TOO_MANY_REQUESTS`, the modal shows a retry message.
- Service archived between page load and submit: `BAD_REQUEST`, modal asks to reload.
- Function fails midway: single transaction, nothing persists.
- Unknown slug: 404 with the same response shape for missing and disabled orgs.

## Out of scope

Photos, client matching, email notifications, CAPTCHA, quotes and job
conversion for real rows, custom domains, org branding on the portal.

## Dependencies not to add

No new packages.

## Verify command

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

Workflow Definition of done, plus: pgTAP or procedure tests for cross-tenant,
anon denial and rate limit; the portal submit verified in the running app and
the row visible on the internal page.

## Audit log

### Round 1 (general-purpose fallback; `plan-auditor` unavailable, pinned model missing): needs-changes

7 blocking findings (definer rules, worker PII via RLS, active-org scope, IP trust/keyed hash/org-cap test, confidence vs assumptions, frequency validation, FK indexes), all resolved in this revision. Awaiting user approval; a re-audit was not run.

## Scope-change log

- 2026-10-16 (user): Removed the preferred-frequency field. Services already
  define their frequencies, so the modal no longer asks and `requests` has no
  `preferred_frequency` column. Migration `portal_drop_frequency` drops it and
  replaces `submit_request` (no frequency argument, so the frequency
  validation in AC 4 no longer applies). Portal cards now match the internal
  services page: icon tile, availability badge, price, duration, frequency
  badges and the season bar, so `get_portal` also returns the season months
  and duration.
