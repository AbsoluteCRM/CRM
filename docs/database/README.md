# AbsoluteCRM database

AbsoluteCRM is a multi-tenant CRM for contractor businesses (landscapers,
snow removal, cleaning crews, and similar trades). The database runs on
**Supabase Postgres 17** (project `skygtamcakhoirlrqlnq`).

This folder is the design record for the schema:

| Doc                      | What it covers                                          |
| ------------------------ | ------------------------------------------------------- |
| [erd.md](erd.md)         | Mermaid entity-relationship diagrams, by domain         |
| [tables/](tables/)       | Per-table reference: columns, constraints, indexes, RLS |
| [decisions/](decisions/) | Architecture decision records (ADRs) and their reasons  |
| [rls.md](rls.md)         | Roles and the row-level security model                  |

## Domains

| #   | Domain               | Tables                                                                                                        | Reference                                   |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | Tenancy & identity   | organizations, profiles, organization_members, organization_invitations, member_pay_rates, document_sequences | [tenancy.md](tables/tenancy.md)             |
| 2   | Clients & properties | clients, client_contacts, properties, client_portal_users, geocode_cache                                      | [clients.md](tables/clients.md)             |
| 3   | Catalog & tax        | services, tax_rates, service_default_taxes                                                                    | [catalog-tax.md](tables/catalog-tax.md)     |
| 4   | Quotes               | quotes, quote_line_items, quote_line_item_taxes                                                               | [quotes.md](tables/quotes.md)               |
| 5   | Jobs & visits        | jobs, job_line_items, visits, attachments                                                                     | [jobs-visits.md](tables/jobs-visits.md)     |
| 6   | Crews & routing      | crews, crew_members, routes, route_members, route_stops, optimization_runs                                    | [crews-routing.md](tables/crews-routing.md) |
| 7   | Invoicing & payments | invoices, invoice_line_items, invoice_visits, invoice_line_item_taxes, payments, stripe_events                | [billing.md](tables/billing.md)             |
| 8   | Time tracking        | shifts, visit_time_entries                                                                                    | [time.md](tables/time.md)                   |
| 9   | Requests             | requests, request_submission_log                                                                              | [requests.md](tables/requests.md)           |
| 10  | Service areas        | service_regions, service_areas, service_area_rotations (and the derived `properties.service_area_id`)         | [service-areas.md](tables/service-areas.md) |

The core business flow is:

```
Client ─┬─ Property ──┐
        └─ Contact    │
                      ▼
Quote ──(approve)──▶ Job ──(RRULE)──▶ Visits ──(optimizer)──▶ Route stops (per crew, per day)
                      │                  │
                      │                  └─(completed)──▶ Invoice lines ──▶ Invoice ──▶ Payments
                      └─ Job line items (per-visit price)
Workers ── Shifts (clock in/out) + Visit time entries ──▶ labor cost (× pay rate)
```

## Conventions

These rules apply to every table unless its reference doc says otherwise.

- **Naming**: snake_case, plural table names, singular `*_id` foreign keys.
  App tables live in `public`. Helper functions live in the `private` schema,
  which PostgREST does not expose.
- **Primary keys**: `id uuid not null default private.uuid_generate_v7()`.
  These are time-ordered, so inserts don't fragment the index, and they're
  safe to put in URLs. See [ADR 0003](decisions/0003-uuidv7-ids.md).
- **Tenancy**: every tenant-owned table has `organization_id uuid not null`.
  Parent tables declare `unique (organization_id, id)`, and child tables
  reference them with **composite foreign keys**
  `(organization_id, parent_id) → parent (organization_id, id)`. The database
  therefore rejects a row that points at another tenant's data. See
  [ADR 0002](decisions/0002-multi-tenancy-composite-fks-rls.md).
- **Standard columns**: tables list only their domain columns. Unless noted,
  every table also has:

  | Column            | Type          | Notes                                            |
  | ----------------- | ------------- | ------------------------------------------------ |
  | `id`              | `uuid`        | PK, `private.uuid_generate_v7()`                 |
  | `organization_id` | `uuid`        | FK → `organizations`, not null (tenant tables)   |
  | `created_at`      | `timestamptz` | not null, default `now()`                        |
  | `updated_at`      | `timestamptz` | not null, default `now()`, `moddatetime` trigger |

- **Indexes**: every foreign key column is indexed. On tenant tables,
  `organization_id` is the leading column of composite indexes, and those
  indexes also serve RLS.
- **Join tables** (those without an `id`, e.g. `service_default_taxes`,
  `crew_members`) use a composite primary key that **starts with
  `organization_id`**, e.g. `(organization_id, crew_id, member_id)`. The PK
  then also indexes the first composite FK, and each further FK gets its own
  `(organization_id, x_id)` index.
- **Money**: integer cents in `bigint` columns named `*_cents`. Each
  organization has one currency (`organizations.currency`). Percentages are
  `numeric(7,4)`, and quantities are `numeric(10,2)`. See
  [ADR 0004](decisions/0004-money-integer-cents.md).
- **Time**: all instants are `timestamptz`. Calendar days (a visit's day, a
  route's day) are `date`, interpreted in `organizations.timezone`.
- **Soft delete**: only `clients`, `properties`, `services`, and `crews` get
  `archived_at timestamptz`, because historical documents reference them.
  Other rows are hard-deleted or moved to a terminal status.
- **Statuses**: Postgres enums, documented with each table.
- **Document numbers**: quotes, jobs, and invoices get a per-organization,
  gap-free, human-facing `number` (`Q-1001`, `J-1001`, `INV-1001`) from
  `private.next_document_number(org, kind)`.
- **Geo**: points are `location geography(Point, 4326)` with a GiST index.
  Stored generated `latitude` / `longitude` columns exist so clients that
  can't read PostGIS types, such as the generated TypeScript types, still see
  usable fields. Points are geocoded on save with `geocode_source` and
  `geocode_accuracy`, through a provider chain and service-role-only
  `geocode_cache` ([ADR 0013](decisions/0013-geocoding-chain-and-cache.md)).
  Service area and region polygons are `geometry(MultiPolygon, 4326)`, read
  and written only as GeoJSON through RPCs
  ([ADR 0012](decisions/0012-service-areas.md)).
- **Extensions** (installed in schema `extensions`, except `pg_cron`): `postgis`,
  `btree_gist`, `btree_gin`, `moddatetime`, `pg_trgm`, `pgcrypto`, `pgtap`,
  `pg_cron`. There is no `citext`: emails are `text` with a
  `check (email = lower(email))`.
- **Policies**: write tenant policies as
  `organization_id = any (array(select private.my_org_ids('{…}')))`. The
  planner turns that into an index condition; the `in (select …)` form is a
  per-row hashed filter. One permissive policy per table and action.
- **Column privileges**: `authenticated` gets `SELECT` and `DELETE` (filtered by
  RLS) and per-column `INSERT` and `UPDATE`. `organization_id` (after insert),
  `id`, `created_by`-style attribution columns, `number`, totals, status
  stamps, and `stripe_*` ids are never updatable through the API; triggers and
  `security definer` functions write them. `anon` has no table or function
  access. Functions are not executable by `PUBLIC` unless granted.
- **Triggers and helpers** always filter child lookups by `organization_id`
  (the leading column of every composite index) and recompute totals once per
  statement with transition tables. Line, tax, and total/paid recomputations
  lock the parent quote or invoice. Other cross-row guards (payment vs invoice
  status, billing a visit, routing a stop) read their parent without a lock, a
  known gap that main shares.
- **Workers** have no table policies on domain data. They use `worker_*` RPCs
  that return crew-safe columns ([ADR 0011](decisions/0011-worker-rpcs.md)).

## Toolchain and workflow

The SQL migrations are the source of truth, and the app reads and writes
through supabase-js under RLS, with TypeScript types generated from the
database. See [ADR 0001](decisions/0001-supabase-sql-source-of-truth.md) and
[ADR 0009](decisions/0009-supabase-js-data-access.md).

```
supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql   ← hand-written DDL, RLS, functions
supabase/tests/*.sql                               ← pgTAP tests
src/types/database.ts                              ← generated by `pnpm db:types`; never edit by hand
```

`src/types/database.ts` is committed. Regenerate it after every schema change.

To change the schema:

1. Write a new file `supabase/migrations/<timestamp>_<name>.sql`. Never edit
   a migration that has already been applied.
2. Apply it to the Supabase project with the Supabase MCP `apply_migration`
   tool, using **the same name**. The tool assigns its own version timestamp,
   so then rename the local file to `<assigned version>_<name>.sql`. That
   keeps the remote migration history matching the repo. In a feature PR,
   apply only after the plan is approved, and follow the extra rules in
   [the feature workflow](../process/feature-workflow.md#schema).
3. Run the Supabase advisors (security + performance). Fix any new warnings,
   such as a missing RLS policy, an unindexed FK, or a mutable `search_path`.
4. Run the pgTAP tests in `supabase/tests/` (each file runs inside
   `begin … rollback`).
5. Regenerate the types. First compare the project's migrations with
   `supabase/migrations/` on `main` plus your branch (and other open PRs);
   if they differ, stop and tell the user. Then run `pnpm db:types` inside
   `devenv shell`, and `pnpm exec tsc --noEmit`.
6. Update the matching doc in `docs/database/tables/` and, when a decision
   changed, add an ADR.

**Rebaseline (ADR 0010)**: the 14 original migrations were replaced by the baseline files
below, and the remote was reset and rebuilt from them. Files are named
`_NN_<name>.sql` until applied, then renamed to the version `apply_migration`
assigned. Before running `pnpm db:types`, compare `list_migrations` with
`supabase/migrations/`.

**Demo data**: `supabase/seed.sql` is idempotent and creates two demo orgs
owned by the first auth user: `absolute-demo` (a full Edmonton landscaping
company) and a small `northside-demo` for checking tenant isolation.
`supabase/seed/teardown.sql` removes them. See [seed.md](seed.md) for what it
creates and how to run it after the migrations are applied. The
`absolute-demo` org also contains a Calgary region, four service areas
(including unassigned and overlapping areas), and Calgary properties both
inside and outside those areas.

## Migration plan

Domains are migrated one at a time, in FK-dependency order
(`jobs.preferred_crew_id` needs `crews`, and `shifts.route_id` needs
`routes`). Advisors and pgTAP tests run after each. Once the rebaseline
lands, an applied migration is never edited; fixes go in a new migration.

| #   | Migration                   | Status  | Creates                                                                                                                                          |
| --- | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `foundation`                | applied | Extensions, `private` schema, default privileges, `uuid_generate_v7`                                                                             |
| 2   | `tenancy_identity`          | applied | organizations, profiles, members, invitations, pay rates, document_sequences, RLS helpers, org RPCs, `my_memberships`                            |
| 3   | `clients_properties`        | applied | clients, client_contacts, properties, client_portal_users, `portal_clients()`                                                                    |
| 4   | `catalog_tax`               | applied | services, tax_rates (insert-only percentage, `archived_at`), service_default_taxes                                                               |
| 5   | `crews`                     | applied | crews, crew_members                                                                                                                              |
| 6   | `quotes`                    | applied | quotes and their lines and taxes, statement-level totals, quote RPCs, hourly `expire-quotes` cron                                                |
| 7   | `jobs_visits`               | applied | jobs (`window_start` + `window_minutes`), job lines and `job_line_item_taxes`, visits, attachments, `org-files` bucket                           |
| 8   | `routing`                   | applied | routes, route_members (`unique (member, date)`), route_stops, optimization_runs, `reset_job_schedule`                                            |
| 9   | `invoices_payments`         | applied | invoices, lines, invoice_visits, taxes, payments, stripe_events, per-org invoice cron, portal RPCs                                               |
| 10  | `time_tracking`             | applied | shifts, visit_time_entries, labor_cost_report                                                                                                    |
| 11  | `worker_api`                | applied | `worker_*` RPCs, worker storage policies ([ADR 0011](decisions/0011-worker-rpcs.md))                                                             |
| 12  | `review_fixes`              | applied | Office-checked definer `generate_visits`/`reset_job_schedule`, `worker_join_visit`, owner-row invitation guard, safer invoice creation and terms |
| 13  | `followup_hardening`        | applied | Payment and invoice-visit guards lock their parent, void-invoice payment freeze, route-stop date lock, optimization-run ref check                |
| 14  | `pending_payment_fix`       | applied | Pending payments may still settle after their invoice is voided                                                                                  |
| 15  | `route_stop_guard_lock_fix` | applied | Route-stop date guard locks the visit only on insert or visit change (avoids a deadlock)                                                         |
| 16  | `void_payment_refund_fix`   | applied | On a void invoice, settled payments can still be refunded                                                                                        |
| 17  | `route_stop_race_fix`       | applied | Stop-date guard locks the visit on every write again; reschedule unroute uses NOT EXISTS (security review)                                       |
| —   | `geocoding`                 | pending | `geocode_cache` (service role only), `properties.geocode_accuracy` ([ADR 0013](decisions/0013-geocoding-chain-and-cache.md))                     |

## Out of scope (for now)

- Charging organizations for their AbsoluteCRM subscription
- Payroll processing (the schema only exports hours × rate)
- Inventory and materials tracking
- A generic audit log table
- SMS and email message log
- Multi-currency (one currency per organization)
