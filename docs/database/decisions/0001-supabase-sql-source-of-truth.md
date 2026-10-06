# 0001. Supabase SQL migrations are the schema source of truth

- **Status**: Accepted (the Prisma bullet is superseded by [0009](0009-supabase-js-data-access.md))
- **Date**: 2026-09-29

## Context

The app was scaffolded with Prisma (`prisma migrate`, `schema.prisma`). The
database is Supabase, and it relies on features Prisma's schema language
can't express: RLS policies, `security definer` functions, triggers on
`auth.users`, storage policies, PostGIS types, exclusion constraints, and
generated columns.

The first 7 tables were created in the Supabase dashboard, with no migration
history.

## Decision

- Hand-written SQL in `supabase/migrations/<timestamp>_<name>.sql` is the
  only way the schema changes.
- Migrations are applied to the remote project through the Supabase MCP
  `apply_migration` tool under the same name, so
  `supabase_migrations.schema_migrations` matches the repo. There is no
  local Supabase stack for now.
- `prisma/schema.prisma` is **generated** by `prisma db pull`. `prisma
migrate` and `prisma db push` are not used.
- The dashboard tables are dropped and rebuilt by the first migration.

## Consequences

- RLS, functions, and triggers sit next to the tables they protect, and
  they're reviewable in git.
- Prisma marks PostGIS columns as `Unsupported`. We add generated
  `latitude`/`longitude` columns, and use raw SQL for spatial queries.
- There's no sandbox: every migration hits the shared project. Advisors and
  pgTAP tests run after each one. Adding a local stack later (the `supabase`
  CLI and Docker in `devenv.nix`) needs no schema changes.
