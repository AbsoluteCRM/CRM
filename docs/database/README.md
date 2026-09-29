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
| 2   | Clients & properties | clients, client_contacts, properties, client_portal_users                                                     | [clients.md](tables/clients.md)             |
| 3   | Catalog & tax        | services, tax_rates, service_default_taxes                                                                    | [catalog-tax.md](tables/catalog-tax.md)     |
| 4   | Quotes               | quotes, quote_line_items, quote_line_item_taxes                                                               | [quotes.md](tables/quotes.md)               |
| 5   | Jobs & visits        | jobs, job_line_items, visits, attachments                                                                     | [jobs-visits.md](tables/jobs-visits.md)     |
| 6   | Crews & routing      | crews, crew_members, routes, route_members, route_stops, optimization_runs                                    | [crews-routing.md](tables/crews-routing.md) |
| 7   | Invoicing & payments | invoices, invoice_line_items, invoice_visits, invoice_line_item_taxes, payments, stripe_events                | [billing.md](tables/billing.md)             |
| 8   | Time tracking        | shifts, visit_time_entries                                                                                    | [time.md](tables/time.md)                   |

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
- **Geo**: `location geography(Point, 4326)` with a GiST index. Stored
  generated `latitude` / `longitude` columns exist so Prisma, which can't map
  PostGIS types, still sees usable fields.
- **Extensions** (installed in schema `extensions`): `postgis`, `btree_gist`,
  `citext`, `moddatetime`, `pg_trgm`, `pg_cron`, `pgtap`.

## Toolchain and workflow

The SQL migrations are the source of truth, and Prisma is a generated,
read-only mirror of them. See
[ADR 0001](decisions/0001-supabase-sql-source-of-truth.md).

```
supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql   ← hand-written DDL, RLS, functions
supabase/tests/*.sql                               ← pgTAP tests
prisma/schema.prisma                               ← generated by `prisma db pull`; never edit models by hand
src/generated/prisma/                              ← generated client
```

To change the schema:

1. Write a new file `supabase/migrations/<timestamp>_<name>.sql`. Never edit
   a migration that has already been applied.
2. Apply it to the Supabase project with the Supabase MCP `apply_migration`
   tool, using **the same name**, so the remote migration history matches the
   repo.
3. Run the Supabase advisors (security + performance). Fix any new warnings,
   such as a missing RLS policy, an unindexed FK, or a mutable `search_path`.
4. Run the pgTAP tests in `supabase/tests/` (each file runs inside
   `begin … rollback`).
5. Regenerate the client: `pnpm exec dotenv -e .env.local -- prisma db pull`
   then `pnpm db:generate`, then `pnpm exec tsc --noEmit`.
6. Update the matching doc in `docs/database/tables/` and, when a decision
   changed, add an ADR.

Do **not** use `prisma migrate` or `prisma db push` against this database.

## Migration plan

Domains are migrated one at a time, in FK-dependency order
(`jobs.preferred_crew_id` needs `crews`, and `shifts.route_id` needs
`routes`). Advisors and pgTAP tests run after each. Once a migration is
applied it is never edited; fixes go in a new migration.

| #   | Migration                           | Status              | Creates                                                                                             |
| --- | ----------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `drop_legacy_tables`                | ✅ `20260929195153` | Drops the 7 dashboard-made tables and their enums                                                   |
| 2   | `foundation`                        | ✅ `20260929195309` | Extensions, `private` schema, `uuid_generate_v7`                                                    |
| 3   | `tenancy_identity`                  | ✅ `20260929195514` | organizations, profiles, members, invitations, pay rates, document_sequences, RLS helpers, org RPCs |
| 3a  | `fix_accept_invitation_email_match` | ✅ `20260929195738` | Case-insensitive invite email match (see the citext gotcha in [rls.md](rls.md))                     |
| 4   | `clients_properties`                | ✅ `20260929200046` | clients, client_contacts, properties, client_portal_users                                           |
| 5   | `catalog_tax`                       | ✅ `20260929200302` | services, tax_rates, service_default_taxes                                                          |
| 6   | `crews`                             | ✅ `20260929200304` | crews, crew_members                                                                                 |
| 7   | `quotes`                            | ✅ `20260929200746` | quotes and their lines and taxes, quote RPCs                                                        |
| 8   | `jobs_visits`                       | ✅ `20260929201255` | jobs, job_line_items, visits, attachments, `org-files` bucket and policies                          |
| 8a  | `fix_visit_actuals_check`           | ✅ `20260929201447` | Allow `actual_end = actual_start` (visit completed after the fact)                                  |
| 9   | `routing`                           | ✅ `20260929201854` | routes, route_members, route_stops, optimization_runs, worker helpers                               |
| 10  | `invoices_payments`                 | ✅ `20260929202454` | invoices, lines, invoice_visits, taxes, payments, stripe_events                                     |
| 11  | `time_tracking`                     | ✅ `20260929202750` | shifts, visit_time_entries, labor_cost_report                                                       |

`private.worker_visit_ids()` depends on routing, so the worker read policies
on clients, properties, jobs, and visits are added in migration 9.

## Out of scope (for now)

- Charging organizations for their AbsoluteCRM subscription
- Payroll processing (the schema only exports hours × rate)
- Inventory and materials tracking
- A generic audit log table
- SMS and email message log
- Multi-currency (one currency per organization)
