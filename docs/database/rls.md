# Access control & RLS

Every table in `public` has RLS enabled. Access comes only from the policies
below; there's no "allow all" policy anywhere. The `anon` role has no access
to any table. Public pages, such as the pay-invoice link, go through server
code or `security definer` RPCs.

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

## Helper functions

These live in the `private` schema (not exposed by PostgREST). Each is
`language sql stable security definer set search_path = ''`, reads
`auth.uid()` internally, and has `EXECUTE` revoked from `public` and `anon`
but granted to `authenticated`.

| Function                                            | Returns                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `private.my_org_ids(roles org_role[] default null)` | `setof uuid`: orgs where the caller is an active member (optionally with one of `roles`). **Use this in policies** |
| `private.is_org_member(org uuid)`                   | Caller is an active member of `org`, in any role                                                                   |
| `private.has_org_role(org uuid, roles org_role[])`  | Caller is an active member of `org` with one of `roles`                                                            |
| `private.my_member_id(org uuid)`                    | The caller's `organization_members.id` in `org`, or null                                                           |
| `private.portal_client_ids()`                       | `setof uuid`: clients the caller has portal access to                                                              |
| `private.worker_visit_ids(org uuid)`                | `setof uuid`: visits on **published** routes the caller is rostered on (`route_members`)                           |
| `private.workers_see_prices(org uuid)`              | `organizations.settings->>'workers_see_prices'`                                                                    |

Tenant policies use the uncorrelated set form:

```sql
using (organization_id in (select private.my_org_ids('{owner,admin}')))
```

The subquery doesn't reference the row, so Postgres runs it once per
statement (an InitPlan) and hash-probes it for each row. A form like
`(select private.has_org_role(organization_id, …))` references the row, so
it would re-run per row. The boolean helpers are for RPCs and triggers,
which check one org at a time. Everything relies on the index
`organization_members (user_id, organization_id) include (role, status)`.

Shorthand used below:

- **staff** = `my_org_ids()`
- **office** = `my_org_ids('{owner,admin,dispatcher}')`
- **admin** = `my_org_ids('{owner,admin}')`

> **Gotcha: citext in `search_path = ''` functions.** citext's
> case-insensitive operators live in the `extensions` schema. Inside a
> function with an empty search path, `=` on two citext values falls back to
> case-sensitive `text` comparison. Compare `lower(a::text) = lower(b::text)`
> explicitly (see migration `fix_accept_invitation_email_match`).

## Policy matrix

S = select, I = insert, U = update, D = delete. "—" means no access.

| Table(s)                                                              | owner/admin                 | dispatcher | worker                                                                      | portal user                                               |
| --------------------------------------------------------------------- | --------------------------- | ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| organizations                                                         | S U                         | S          | S                                                                           | via `portal_my_clients()` (org name only)                 |
| organization_members                                                  | S I U D                     | S          | S                                                                           | —                                                         |
| organization_invitations                                              | S I U D                     | —          | —                                                                           | —                                                         |
| member_pay_rates                                                      | S I U D                     | —          | —                                                                           | —                                                         |
| clients, client_contacts                                              | S I U D                     | S I U D    | S, only clients with a visit in `worker_visit_ids`                          | via `portal_my_clients()`                                 |
| properties                                                            | S I U D                     | S I U D    | S, only properties with a visit in `worker_visit_ids`                       | via `portal_my_properties()`                              |
| client_portal_users                                                   | S I U D                     | S I U D    | —                                                                           | S own rows                                                |
| services                                                              | S I U D                     | S          | S                                                                           | —                                                         |
| tax_rates, service_default_taxes                                      | S I U D                     | S          | —                                                                           | —                                                         |
| quotes, quote_line_items, quote_line_item_taxes                       | S I U D                     | S I U D    | —                                                                           | via `portal_*` RPCs, non-draft only; approve/decline RPCs |
| jobs                                                                  | S I U D                     | S I U D    | S, jobs of visits in `worker_visit_ids`                                     | via `portal_*` RPCs                                       |
| job_line_items                                                        | S I U D                     | S I U D    | S, only if `workers_see_prices`                                             | —                                                         |
| visits                                                                | S I U D                     | S I U D    | S; U status/notes/actuals on `worker_visit_ids` (trigger restricts columns) | via `portal_*` RPCs (upcoming and completed)              |
| attachments                                                           | S I U D                     | S I U D    | S; I on their visits                                                        | signed URLs for `is_client_visible` only                  |
| crews, crew_members                                                   | S I U D                     | S I U D    | S                                                                           | —                                                         |
| routes, route_members, route_stops                                    | S I U D                     | S I U D    | S, their published routes                                                   | —                                                         |
| optimization_runs                                                     | S I U                       | S I U      | —                                                                           | —                                                         |
| invoices, invoice_line_items, invoice_visits, invoice_line_item_taxes | S I U D (D only for drafts) | S          | —                                                                           | via `portal_*` RPCs, non-draft only                       |
| payments                                                              | S I U                       | S          | —                                                                           | via `portal_*` RPCs                                       |
| stripe_events                                                         | —                           | —          | —                                                                           | —                                                         |
| shifts, visit_time_entries                                            | S I U D                     | S I U D    | S I own. U own while open and unapproved                                    | —                                                         |
| document_sequences                                                    | —                           | —          | —                                                                           | —                                                         |

Notes:

- **Column-level restrictions** are enforced with triggers or grants rather
  than RLS, which is row-only:
  - Workers updating `visits` may change only `status`, `actual_start`,
    `actual_end`, `completion_notes`, and `completed_by_member_id`.
  - `optimization_runs.request`/`response` are revoked from `authenticated`.
  - Dispatchers can't update `organizations`. Only admins can change
    `settings`.
- **Portal reads go through RPCs, not table policies.** RLS is row-only, and
  staff and portal users are both the `authenticated` role, so a portal
  select policy on `clients` would also expose internal columns (`notes`,
  `lead_source`, `internal_notes` on quotes and invoices, …). Portal users
  therefore get no policies on domain tables. `security definer` functions
  named `portal_*` return client-safe columns for
  `private.portal_client_ids()` only.
- **Portal writes**: `approve_quote`, `decline_quote`, and payments (Stripe
  Checkout) go through RPCs or server code. Portal users have no direct
  insert, update, or delete on any table.
- **Role escalation**: a trigger on `organization_members` blocks non-owners
  from granting `owner` and blocks anyone from changing their own role.

## Storage

Bucket `org-files` (private). Object paths start with `{organization_id}/`.

- Staff: select and insert when `private.is_org_member((storage.foldername(name))[1]::uuid)`.
  Delete requires office.
- Portal users: read files only through signed URLs issued by server code,
  and only for `attachments.is_client_visible`.

## Prisma and RLS

Prisma connects as `postgres`, which **bypasses RLS**. User-facing server
code must go through `withRls()`. See
[ADR 0007](decisions/0007-prisma-and-rls.md).
