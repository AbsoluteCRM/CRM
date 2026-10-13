# Plan: List crews for the active organization

- **Slug / branch**: `crews-list` / `feat/crews-list`
- **Tier**: full (new tRPC procedure, touches `src/integrations/trpc/**`, a
  security-gated path)
- **Status**: approved (audit skipped by user: plan-auditor model unavailable)
- **Confidence**: 95%; scope and member/lead inclusion are user-confirmed.
  Column selection and the exact response shape are agent defaults the user
  may veto below.

## Original request

> We have created a route for fetching all team members on the teams page. I
> would now like to create a fetch for fetching crews.
>
> (table definitions for `crews` and `crew_members` provided verbatim)

## Goal

A `crews.list` tRPC query returns the non-archived crews of one organization,
each with its default roster (member ids and who's the lead), plus a
`useCrews()` hook that passes the active organization id. No page changes:
the teams page's "Crew builder" tab keeps using `useTenant()`'s mock crew
data, exactly as `clients.list` shipped without touching the clients page.

## Decisions

| #   | Question                                               | Answer                                                                          |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Q1  | Scope: backend only, or also wire into the teams page? | Backend only: `crews.list` tRPC procedure + `useCrews` hook. No UI rewire.      |
| Q2  | Include each crew's roster?                            | Yes: include each crew's members and who's the lead, by joining `crew_members`. |

Agent defaults (the user may veto):

- **D1**: Same shape as `clients.list` — `protectedProcedure`, input
  `{ organizationId: z.uuid() }`, `ctx.supabase` query, errors wrapped as
  `TRPCError` (`INTERNAL_SERVER_ERROR` on a Postgres error), a Sentry span
  named `crews.list`.
- **D2**: Exclude archived rows (`archived_at is null`), matching
  `crews_org_name_idx`'s partial index and the same convention `clients.list`
  used. Order by `name`.
- **D3**: Select every `crews` column except `default_start_location` and
  `default_end_location`. Those are PostGIS `geography` columns with no
  generated lat/lng projection for this table (unlike `properties.location`),
  so `supabase-js` would return them as an opaque value typed `unknown`
  that's not directly usable, and the teams page doesn't need crew depots.
  `max_work_minutes`, `default_start_time`, `color`, and `vehicle` are
  included.
- **D4**: The roster comes back as a nested `crew_members` array via a
  Supabase embedded select (`crews.select('..., crew_members(member_id,
is_lead)')`), each entry `{ member_id, is_lead }`. No join to
  `organization_members` for names — `useTeamMembers` already fetches the
  full roster and the caller can cross-reference by id, matching how
  `clients.list` does no incidental joins.
- **D5**: New router file `src/integrations/trpc/crews.ts`, registered in
  `router.ts` as `crews`, mirroring `clientsRouter`.
- **D6**: New hook file `src/integrations/crews/crews.ts` (`useCrews`),
  mirroring `src/integrations/clients/clients.ts`.

## Open questions

- None.

## Assumptions

| Assumption                                                                                                                                           | User-confirmed?        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Pagination is not needed yet (return all rows)                                                                                                       | no                     |
| `crews`/`crew_members` RLS allows select for owner/admin/dispatcher/worker (verified in `docs/database/rls.md` and the `crews` migration's policies) | yes (verified in repo) |
| Excluding the two geography columns is acceptable for this fetch                                                                                     | no                     |

## Design refs

- Mock: none, backend only.
- Screens: none; no `docs/<feature>/ui.md` change.

## Layers touched

- [ ] Migration, RLS, `docs/database`: none (table and policies exist)
- [ ] Middleware: none (`protectedProcedure` already exists from `clients.list`)
- [x] tRPC procedures (`crews.list`)
- [x] Hook (`src/integrations/crews/crews.ts`)
- [x] Tests (procedure: unauthenticated, cross-tenant, malformed id, archived
      filter, ordering, roster embed, RLS-empty, DB error)
- [x] Sentry span around the handler
- Routes/UI/stories/design record: none, no UI changes (say so in the PR)

Security-gated paths touched: `src/integrations/trpc/**`. The `security`
agent gates the merge.

## Changes

### Procedures

| Procedure    | Input                      | Output                                                             | Roles allowed                   |
| ------------ | -------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| `crews.list` | `{ organizationId: uuid }` | `Array<CrewRow & { crew_members: Array<{ member_id, is_lead }> }>` | Whatever RLS allows (all staff) |

`CrewRow` = `id, organization_id, name, color, vehicle, default_start_time,
max_work_minutes, archived_at, created_at, updated_at`.

### Hook

```ts
export function useCrews() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  return useQuery({
    ...trpc.crews.list.queryOptions({ organizationId: organizationId! }),
    enabled: organizationId !== undefined,
  })
}
```

### Routes and UI

None.

### Acceptance criteria

1. `crews.list({ organizationId })` returns non-archived crews for that org,
   ordered by name, each with its `crew_members` roster (`member_id`,
   `is_lead`).
2. An unauthenticated caller gets `UNAUTHORIZED`; a malformed
   `organizationId` is rejected by zod; a Postgres error surfaces as
   `INTERNAL_SERVER_ERROR`.
3. `useCrews()` is disabled until an active organization id exists, and
   exposes the same loading/error/data states as `useClients()`.

## Commits

1. `docs: plan for listing crews` (main agent)
2. `Add crews.list procedure and tests` (implementer)
3. `Add useCrews hook` (implementer)

## Unhappy paths

- No session: `UNAUTHORIZED`. Non-member org id: RLS returns `[]`. Malformed
  id: zod `BAD_REQUEST`. Supabase error: thrown as `INTERNAL_SERVER_ERROR`.
  A crew with no roster rows returns `crew_members: []`, not a null.

## Out of scope

- Rewiring the teams page's Crew builder to real data.
- Crew create/update/delete/archive mutations.
- Joining `organization_members` for roster member names.
- `default_start_location` / `default_end_location`.

## Dependencies not to add

- None.

## Verify command

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

- tsc, lint, and prettier pass.
- Procedure tests cover unauthenticated, cross-tenant/RLS-empty, malformed
  input, archived filtering, ordering, the roster embed, and a surfaced DB
  error.
- No stories or UI change, so no new story states.

## Audit log

_Skipped by user: plan-auditor model (opus) is unavailable in this
environment._

## Scope-change log

_None._
