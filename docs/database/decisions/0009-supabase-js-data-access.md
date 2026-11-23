# 0009. App data access goes through supabase-js, under RLS

- **Status**: Accepted (2026-10-05)
- **Date**: 2026-10-05
- **Supersedes**: [0007](0007-prisma-and-rls.md). Also replaces the Prisma
  bullet in [0001](0001-supabase-sql-source-of-truth.md).

## Context

The app was scaffolded with Prisma, and ADR 0007 planned to keep it by
wrapping every user request in `withRls()`. Neither part earned its place:

- The schema is hand-written SQL (ADR 0001). Prisma's schema language and
  migrations went unused, and `schema.prisma` was only a generated mirror.
- Prisma connects as `postgres`, which **bypasses RLS**. Keeping RLS
  meaningful meant a transaction plus two `set` statements on every request.
- `withRls()` was never built, and the Prisma client was never generated.
  Nothing in `src/` queried through Prisma.
- Much of the write logic already lives in SQL: 16 `public` functions
  callable as RPCs, plus `private` helpers and triggers.

## Decision

- **Request path.** User requests use the per-request Supabase server client
  (`src/lib/supabase/server.ts`), which carries the user's session, so RLS is
  the access control and every policy applies as written. Procedures get it
  as `ctx.supabase`, added to the tRPC context in
  `src/integrations/trpc/init.ts`. That context work is pending: the
  `TRPCContext` and `protectedProcedure` code is on the unmerged
  `feature/trpc-auth` branch, and org scoping is built on top of it.
- **Multi-step or transactional writes** are SQL functions called with
  `.rpc()` and tested with pgTAP. PostgREST can't run a transaction across
  several calls, so this is a rule, not a preference. New app-callable
  functions:
  - live in `public`, because `private` isn't exposed by PostgREST;
  - `revoke execute … from public, anon`, and grant to `authenticated`.
    Supabase also grants `service_role` execute on every `public` function by
    default (verified on the project), so revoke it explicitly where it
    should be denied;
  - default to `security invoker`. A `security definer` function needs an
    explicit `auth.uid()` or membership check and an entry in the accepted
    advisor findings in [rls.md](../rls.md#accepted-advisor-findings).

  Of the 16 existing `public` RPCs, 13 are `security definer` (the ones the
  accepted-advisor row lists: `create_organization`, `accept_invitation`,
  `approve_quote`, `decline_quote`, and the nine `portal_*` functions) and 3
  are `security invoker` (`generate_visits`, `reset_job_schedule`,
  `create_invoice_for_visits`). `rls_auto_enable` is a Supabase-managed
  event-trigger function, not an RPC.

- **Types** come from `pnpm db:types` (the Supabase CLI) into
  `src/types/database.ts`, committed. The file mirrors the Supabase project,
  so before generating, the project's migrations must equal `main`'s plus the
  branch's plus other open PRs'. If they don't, stop and tell the user. After
  merging `main`, regenerate instead of hand-merging the file.
- **Service role.** Clients built with `SUPABASE_SERVICE_ROLE_KEY` live only
  in `src/server/trusted/`: webhooks, cron, the optimizer write-back, and
  public token pages. [ADR 0015](0015-r2-image-uploads.md) extends this boundary
  to the standalone `upload-image` Edge Function, whose service-role client
  only reads fixed Vault configuration after user-scoped authorization.
- **No direct Postgres connection** until a feature needs one. That feature
  adds it with its own ADR.

## Consequences

- Every request makes an HTTP call to PostgREST instead of using a direct
  connection. That is fine at this scale.
- Complex reads and reports become views or functions, because PostgREST's
  query builder is limited for joins and aggregates.
- The active-org filter is still required. RLS admits every org the user
  belongs to, so org-owned queries and inserts must also scope to the active
  org.
- A column-level `REVOKE` breaks `select('*')`, which supabase-js issues by
  default. Prefer a separate table (see `optimization_run_payloads`).
- `bigint` cents columns arrive as JS `number`, which is exact below 2^53
  (see [ADR 0004](0004-money-integer-cents.md)).
- In service-role code `auth.uid()` is null, so trusted code must not call
  user-scoped RPCs.
- The Supabase project ref is hard-coded in the `db:types` script. A Supabase
  branch would need `--project-id` overridden.
- Enforcement: an eslint rule should ban `SUPABASE_SERVICE_ROLE_KEY` outside
  `src/server/trusted/`. It is added with the first trusted client.
- Until the remote is reconciled with the migrations, `db:types` must not be
  run, and the types file doesn't exist yet.
  (Update 2026-10-07: the remote was rebaselined to match the migrations
  ([ADR 0010](0010-pre-launch-rebaseline.md)), the types file exists, and the
  Supabase clients are typed with `Database`. `generate_visits`, `reset_job_schedule`,
  and `create_invoice_for_visits` are now `security definer` with explicit
  role checks, because invoker needed column grants the API withholds.)
