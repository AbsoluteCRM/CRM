# 0002. Multi-tenancy with composite FKs and RLS

- **Status**: Accepted
- **Date**: 2026-09-29

## Context

AbsoluteCRM is SaaS: many contractor businesses share one database. A leak
between tenants is the worst failure this product can have. The browser and
mobile apps may query Supabase directly (PostgREST), so tenant isolation
can't live only in server code.

## Decision

- Shared schema, with `organization_id uuid not null` on every tenant-owned
  row.
- **RLS on every table**, with policies built on the `private.*` helper
  functions (see [rls.md](../rls.md)).
- **Composite foreign keys**: parents declare `unique (organization_id, id)`,
  and children reference `(organization_id, parent_id)`. A job in org A
  therefore can't point at a property in org B, even through the service
  role or a bug in server code.
- `organization_id` leads the composite indexes, which serve both the app
  queries and the RLS checks.

## Alternatives considered

- **Schema per tenant**: strong isolation, but migrations fan out N times and
  it doesn't fit PostgREST or Supabase Auth.
- **Plain FKs + RLS only**: simpler, but the service role and Prisma bypass
  RLS, so a cross-tenant reference could be written by mistake.

## Consequences

- Every child table carries a redundant `organization_id`. That costs 16
  bytes per row, and inserts need it. The app always knows the current org,
  so this is cheap.
- One extra unique index per parent table.
