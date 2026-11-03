# Access control & RLS

Every table in `public` has RLS enabled. Access comes only from the policies
below; there's no "allow all" policy anywhere. The `anon` role has no access
to any table or function. Public pages, such as the pay-invoice link, go
through server code or `security definer` RPCs.

## Who is who

| Actor            | How they're identified                                          |
| ---------------- | --------------------------------------------------------------- |
| **owner**        | `organization_members.role = 'owner'`, `status = 'active'`      |
| **admin**        | `role = 'admin'`                                                |
| **dispatcher**   | `role = 'dispatcher'`                                           |
| **worker**       | `role = 'worker'`                                               |
| **portal user**  | Has a row in `client_portal_users`. May also be staff elsewhere |
| **service role** | Server-side code (webhooks, cron, optimizer). Bypasses RLS      |

A single auth user can be staff in several orgs and a portal user for
several clients. Every check is per organization.

## Three layers

1. **Row policies (RLS)** decide which rows a role sees. Only office staff
   (owner, admin, dispatcher), plus owner/admin for money, have table
   policies on domain data.
2. **Column privileges** decide which columns the API can write. `authenticated`
   has `SELECT` and `DELETE` on tables (filtered by RLS) and per-column
   `INSERT` and `UPDATE`. Never writable through the API: `id`,
   `organization_id` after insert, attribution columns (`created_by`,
   `recorded_by`, `approved_by`, `uploaded_by`), `number`, totals and other
   derived columns, status stamps, `organizations.slug`/`currency`/
   `stripe_account_id`, `organization_members.user_id`, and every `stripe_*`
   id. Triggers and `security definer` functions write them. `anon` and
   `PUBLIC` have no table or function access unless granted.
3. **RPCs** serve the two audiences RLS can't (it is row-only, and staff,
   workers, and portal users are all the `authenticated` role): `worker_*`
   for crew ([ADR 0011](decisions/0011-worker-rpcs.md)) and `portal_*` for
   clients. They return only safe columns.

## Helper functions

These live in the `private` schema (not exposed by PostgREST). Each is
`language sql stable security definer set search_path = ''`, reads
`auth.uid()` internally, and has `EXECUTE` granted to `authenticated` only.

| Function                                            | Returns                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `private.my_org_ids(roles org_role[] default null)` | `setof uuid`: orgs where the caller is an active member (optionally with one of `roles`). Use in policies |
| `private.is_org_member(org uuid)`                   | Caller is an active member of `org`, in any role                                                          |
| `private.has_org_role(org uuid, roles org_role[])`  | Caller is an active member of `org` with one of `roles`                                                   |
| `private.my_member_id(org uuid)`                    | The caller's `organization_members.id` in `org`, or null                                                  |
| `private.portal_clients()`                          | `(organization_id, client_id)` pairs the caller has portal access to (archived clients excluded)          |
| `private.worker_routes()` / `worker_visits()`       | The caller's rostered routes (published, in progress, or completed) and the visits on them                |

Tenant policies use the array form:

```sql
using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
```

The array subquery doesn't reference the row, so Postgres runs it once per
statement (an InitPlan) and turns the result into an **index condition** on
`organization_id`. The `organization_id in (select …)` form is only a hashed
per-row filter and scans every tenant's rows. Policies also never reference a
row column inside a helper call, which would re-run it per row.

Shorthand used below:

- **staff** = `my_org_ids()`
- **office** = `my_org_ids('{owner,admin,dispatcher}')`
- **admin** = `my_org_ids('{owner,admin}')`

## Policy matrix

S = select, I = insert, U = update, D = delete. "—" means no table access.

| Table(s)                                                                    | owner/admin                                 | dispatcher                   | worker                           | portal user                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| organizations                                                               | S U                                         | S                            | S                                | `portal_my_clients()` (org name)                                  |
| organization_members                                                        | S I U D                                     | S                            | S                                | —                                                                 |
| organization_invitations                                                    | S I U D                                     | —                            | —                                | —                                                                 |
| member_pay_rates                                                            | S I U D                                     | —                            | —                                | —                                                                 |
| profiles                                                                    | own row                                     | own row                      | own row                          | own row                                                           |
| clients, client_contacts, properties                                        | S I U D                                     | S I U D                      | — (`worker_route_stops`)         | `portal_*` RPCs                                                   |
| client_portal_users                                                         | S I D                                       | S I D                        | —                                | —                                                                 |
| services                                                                    | S I U D                                     | S                            | S                                | —                                                                 |
| tax_rates, service_default_taxes                                            | S I U D                                     | S                            | —                                | —                                                                 |
| quotes, quote_line_items, quote_line_item_taxes                             | S I U D (no `status` writes)                | S I U D (no `status` writes) | —                                | `portal_*` RPCs; approve/decline; magic link via `portal_token_*` |
| quote_share_tokens                                                          | S (not `token_hash`)                        | S (not `token_hash`)         | —                                | `portal_token_*` (service role only)                              |
| jobs, job_line_items, job_line_item_taxes                                   | S I U D                                     | S I U D                      | — (`worker_route_stops`)         | `portal_my_jobs`                                                  |
| visits                                                                      | S I U D                                     | S I U D                      | — (`worker_*_visit` RPCs)        | `portal_my_visits`                                                |
| attachments                                                                 | S I U D                                     | S I U D                      | — (`worker_add_attachment`)      | signed URLs, `is_client_visible` only                             |
| crews, crew_members                                                         | S I U D                                     | S I U D                      | S                                | —                                                                 |
| service_regions, service_areas, service_area_rotations                      | S I U D (polygons only via `upsert_*` RPCs) | S                            | S                                | —                                                                 |
| routes, route_members, route_stops                                          | S I U D                                     | S I U D                      | — (`worker_my_routes`/`_stops`)  | —                                                                 |
| optimization_runs                                                           | S I                                         | S I                          | —                                | —                                                                 |
| optimization_run_payloads, stripe_events, document_sequences, geocode_cache | — (service role only)                       | —                            | —                                | —                                                                 |
| invoices, invoice_line_items, invoice_visits, invoice_line_item_taxes       | S I U D (D only for drafts)                 | S                            | —                                | `portal_*` RPCs, non-draft only                                   |
| payments                                                                    | S I U                                       | S                            | —                                | `portal_my_payments`                                              |
| shifts, visit_time_entries                                                  | S I U D                                     | S I U D                      | — (`worker_clock_*`, visit RPCs) | —                                                                 |

Notes:

- **Role escalation.** `guard_member_change` (a trigger on
  `organization_members`) lets only owners add, change, or remove an owner row
  (any column, including status) or grant `owner`, and stops anyone changing
  their own role or status. `ensure_org_has_owner` locks the organization row
  and keeps at least one active owner. `user_id` isn't writable through the
  API at all: logins are attached only by `accept_invitation()` and
  `create_organization()`.
- **Derived money.** Invoice and quote totals, `amount_paid_cents`, tax
  snapshots, and `paid_at`/`sent_at`/`approved_at` are written by triggers.
  Admins change an invoice's `status` only to issue or void it; the trigger
  derives `sent`/`partially_paid`/`paid`. A payment with a Stripe id can't be
  edited through the API (only its notes).
- **Worker scope** (RPCs): routes the caller is on that office staff
  published. Published and in-progress routes are actionable; completed ones
  are read-only; a visit with a live invoice can't change status, date,
  property, or duration for anyone. Prices appear only when
  `organizations.settings.workers_see_prices` is true.
- **Portal reads and writes** go through RPCs. Portal users have no direct
  insert, update, or delete on any table, and no select policy on domain
  tables, so internal columns such as `notes` and `internal_notes` never
  reach them.
- **Memberships in every status** (invited, disabled) come from the
  `my_memberships()` RPC; table policies show only active memberships.

- **Requests** (`requests`): owner/admin/dispatcher may select, and update only
  `status` and `client_id`. There is no insert policy: anonymous visitors submit
  only through the service-role `submit_request` function (called by the public
  portal procedure), which rate-limits per IP and per org. `get_portal` and
  `submit_request` are executable by `service_role` only. `request_submission_log`
  has RLS on, no policies, and no grants to `anon` or `authenticated`. Workers and
  portal users have no access. See [tables/requests.md](tables/requests.md).

- **Service areas** ([tables/service-areas.md](tables/service-areas.md)):
  all staff read; owner/admin write. `service_areas.boundary` and the
  `service_regions` geometry have no column grant: `upsert_service_area` and
  `upsert_service_region` (security invoker) normalize GeoJSON and call
  `private.save_service_area` / `private.save_service_region`, which are
  `security definer` and re-check `has_org_role(org, '{owner,admin}')`.
  `properties.service_area_id` is derived by triggers and has no grant.

- **Route Builder writes** ([tables/crews-routing.md](tables/crews-routing.md#route-builder-functions)):
  `create_route`, `change_route_crew`, `add_route_stop`, `move_route_stop`,
  `reorder_route_stops`, `remove_route_stop` and `delete_route` are
  `security invoker`, so the office-staff policies on `routes`, `route_stops`
  and `route_members` decide access: a worker or another org's user can't see
  the rows, so every function raises `P0002` for them. They add no policy or
  grant. Execute is revoked from `public`, `anon` and `service_role` and
  granted to `authenticated`. They lock the route row first, and refuse to
  change a route that is not `draft` or `optimized` (`55000`); the existing
  triggers don't enforce that lock themselves.

- **Auto-assignment** ([tables/crews-routing.md](tables/crews-routing.md#auto-assignment-generate_draft_routes)):
  `generate_draft_routes(org, date)` is `security invoker`, so the office-staff
  policies on `routes`, `route_stops`, `visits`, `jobs`, `properties`, `crews`
  and the service-area tables decide what it can read and write. It adds no
  policy or grant on tables. It also checks
  `private.has_org_role(org, '{owner,admin,dispatcher}')` first and raises
  `42501` for anyone else, so a worker or non-member gets an error rather than
  an empty result. Execute is revoked from `public`, `anon` and `service_role`
  and granted to `authenticated`. The helper `private.order_stops` is pure
  (no table access) and executable by `authenticated`.

- **Optimizer** ([ADR 0015](decisions/0015-optimizer-integration.md),
  [tables/crews-routing.md](tables/crews-routing.md#route-optimizer)): two
  functions, no new policy and no new table grant.
  - `optimizer_inputs(org, date, route_ids)` is `security invoker` with the
    same explicit `has_org_role` check as `generate_draft_routes`
    (`42501` for workers and non-members). Execute: `authenticated` only.
  - `apply_optimization_results(org, run, routes, unassigned)` is
    `security invoker` and executable by **`service_role` only** (revoked from
    `public`, `anon` and `authenticated`). Called as the service role, RLS is
    bypassed, so the access check is the grant plus the trusted runner
    (`src/server/trusted/optimization-runner.ts`), which confirms the caller
    is an active owner, admin or dispatcher of the organization with the
    service-role client before it calls the function. Inside, every statement
    is scoped to `p_organization_id`; a run or route of another organization
    is `P0002` or skipped as `not_found`. It locks each route row, refuses
    anything not `draft` or `optimized`, and never changes `visit_id`,
    `route_id` or `crew_id`, so the stop-date guard has nothing to re-check.
  - The runner also creates the run (`requested_by` set explicitly: the
    service role has no `auth.uid()`) and writes `optimization_run_payloads`.
    Staff read runs under the existing select policy; they cannot read
    payloads. `routes.optimized_stop_count` has no column grant to
    `authenticated`, so only this function sets it.

## Storage

Bucket `org-files` (private). Object paths are
`{organization_id}/{clients|properties|jobs|visits|quotes}/{parent id}/{file}`,
and `attachments.storage_path` is checked against that layout.

- Office staff: read, upload, update, and delete anything in their org's
  folder.
- Workers: read, and (while the route is published or in progress) upload,
  only under `{org}/visits/{visit_id}/` for visits on their routes.
- Portal users: read files only through signed URLs issued by server code,
  and only for `attachments.is_client_visible`.

## App access and RLS

User requests reach the database through the per-request Supabase server
client, which carries the user's session, so every policy here applies as
written. The service role bypasses RLS, so service-role clients are for
trusted code only (webhooks, cron, the optimizer write-back, public token
pages), in `src/server/trusted/`. RLS admits every org a user belongs to, so
queries and inserts must also scope to the active org. See
[ADR 0009](decisions/0009-supabase-js-data-access.md).

`generate_visits`, `reset_job_schedule`, and `create_invoice_for_visits` are
`security definer`: they check the caller's role in the job or client's org
(office staff; owner/admin for invoices) and treat a missing `auth.uid()` as
trusted code. They are not callable by `anon`.

## Accepted advisor findings

The Supabase advisors report these by design. Don't "fix" them:

| Finding                                                                                                                                                                                                                                                                                                                                    | Why it's intended                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `document_sequences`, `optimization_run_payloads`, `stripe_events`: RLS enabled, no policies                                                                                                                                                                                                                                               | Service role only, or touched only by `private.next_document_number()`                                   |
| `authenticated` can execute `security definer` functions: `create_organization`, `accept_invitation`, `my_memberships`, `approve_quote`, `decline_quote`, `create_quote_draft`, `send_quote`, `pull_back_quote`, `rotate_quote_token`, `create_invoice_for_visits`, `generate_visits`, `reset_job_schedule`, all `portal_*` and `worker_*` | These are the API. Each checks `auth.uid()` and scopes to the caller's orgs or clients                   |
| `public.rls_auto_enable()` executable by `anon`/`authenticated`                                                                                                                                                                                                                                                                            | A Supabase-managed event-trigger function that predates these migrations. It's left alone                |
| `route_members` composite FK `(organization_id, route_id, route_date)` has no covering index                                                                                                                                                                                                                                               | The primary key `(organization_id, route_id, member_id)` covers its `(organization_id, route_id)` prefix |
| `payments` composite FK `(organization_id, client_id, invoice_id)` has no covering index                                                                                                                                                                                                                                                   | Payments are always read by invoice (`payments_invoice_idx`) or by client; the FK is a write-time check  |
| Unused indexes                                                                                                                                                                                                                                                                                                                             | The database is nearly empty. Re-evaluate with real traffic                                              |
| Leaked password protection disabled                                                                                                                                                                                                                                                                                                        | An Auth dashboard setting. Enable it before launch                                                       |
