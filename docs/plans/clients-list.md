# Plan: List clients for the active organization

- **Slug / branch**: `clients-list` / `feat/clients-list`
- **Tier**: full (tRPC, auth middleware, per-request Supabase client)
- **Status**: approved (audit skipped by user: plan-auditor model unavailable)
- **Confidence**: 95%; the approach and scope are user-confirmed. Archived-row handling and the auth middleware shape are agent defaults.

## Original request

> Lets build out the fetch for getting all clients associated with the active organization id.

## Goal

A `clients.list` tRPC query returns the non-archived clients of one organization, plus a `useClients()` hook that passes the active organization id from the client context. No page changes; the clients page keeps its mock store.

## Decisions

| #   | Question                  | Answer                                                                            |
| --- | ------------------------- | --------------------------------------------------------------------------------- |
| Q1  | Browser Supabase or tRPC? | tRPC procedure.                                                                   |
| Q2  | Scope                     | Backend only: auth middleware, `clients.list`, `useClients` hook. No page rewire. |

Agent defaults (the user may veto):

- **D1**: The active org is client-only, so the procedure takes `organizationId` (uuid) as input. RLS (`private.my_org_ids`) is the access control; the query also filters `organization_id`.
- **D2**: Exclude archived rows (`archived_at is null`), matching the `clients_org_status_idx` partial index. Order by `display_name`.
- **D3**: Return every column except `stripe_customer_id`, and no `organization_id` filter bypass. Types come from `src/types/database.ts`.
- **D4**: Add `protectedProcedure` with context `{ supabase }` built from `createSupabaseServerClient()`; it rejects with `UNAUTHORIZED` when `supabase.auth.getUser()` has no user. Build on `origin/feature/trpc-auth` if it has the context (only a partial commit found).
- **D5**: Remove the scaffold `todos` router only if nothing else uses it; otherwise leave it.

## Open questions

- None.

## Assumptions

| Assumption                                                             | User-confirmed? |
| ---------------------------------------------------------------------- | --------------- |
| Pagination is not needed yet (return all rows)                         | no              |
| `clients` RLS allows select for owner/admin/dispatcher; workers get [] | no (verify)     |

## Layers touched

- [ ] Migration, RLS, `docs/database`: none (table and policies exist)
- [x] Middleware (`init.ts`: context, `protectedProcedure`)
- [x] tRPC procedures (`clients.list`)
- [x] Hook (`src/integrations/clients/clients.ts`)
- [x] Tests (procedure: unauthenticated, cross-tenant, multi-org, per-role)
- [x] Sentry span around the handler
- Routes/UI/stories/design record: none, no UI changes (say so in the PR)

Security-gated paths touched: tRPC, Supabase client use, `api.trpc.$.tsx`. `security` agent gates the merge.

## Changes

### Middleware

- `createTRPCContext` in `init.ts` returns `{ supabase }` per request; `api.trpc.$.tsx` passes `createContext`.
- `protectedProcedure` checks `auth.getUser()` and narrows ctx to include `user`.

### Procedures

| Procedure      | Input                      | Output             | Roles allowed                      |
| -------------- | -------------------------- | ------------------ | ---------------------------------- |
| `clients.list` | `{ organizationId: uuid }` | `Array<ClientRow>` | Whatever RLS allows (office staff) |

## Commits

1. `docs: plan for listing clients` (main agent)
2. `Add protectedProcedure and clients.list` (implementer)
3. `Add useClients hook and procedure tests` (implementer)

## Unhappy paths

- No session: `UNAUTHORIZED`. Non-member org id: RLS returns `[]`. Malformed id: zod `BAD_REQUEST`. Supabase error: thrown as `INTERNAL_SERVER_ERROR`.

## Out of scope

- Rewiring the clients page, search, pagination, create/update, properties.

## Verify command

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Audit log

_Not yet audited._

## Scope-change log

_None._
