# 0007. Prisma queries run under RLS via `withRls()`

- **Status**: Accepted (2026-09-29)
- **Date**: 2026-09-29

## Context

Server code (tRPC procedures) uses Prisma over `DATABASE_URL`, which
connects as `postgres`. That role **bypasses RLS**, so every Prisma query
would depend on remembering `where: { organizationId }`, and the RLS policies
would protect only direct Supabase-JS access.

## Decision

Add a helper in `src/db.ts`:

```ts
withRls(claims, (tx) => tx.client.findMany(...))
```

It runs the callback inside an interactive transaction that first executes:

```sql
select set_config('request.jwt.claims', $claims_json, true);
set local role authenticated;
```

`auth.uid()` then resolves to the caller, and every policy applies exactly
as it does for Supabase-JS. The claims come from the verified Supabase
session in the tRPC context.

The unscoped `prisma` client stays for trusted server work only: Stripe
webhooks, cron, the optimizer write-back, and seeds.

## Consequences

- There's one authorization model (RLS) for every access path.
- Every user request pays for one transaction plus two `set` statements.
- Needs the pooled connection in transaction mode (port 6543), which is
  compatible because the settings are `local` to the transaction.
- A lint rule or code review should flag imports of the raw `prisma` client
  outside `src/server/trusted/`.
