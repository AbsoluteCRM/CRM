# Plan: Persist the services catalog

- **Slug / branch**: `services-persist` / `feat/services-persist`
- **Tier**: full (schema, tRPC and UI)
- **Status**: approved
- **Confidence**: 95%. Month storage, the other missing fields and the scope
  rest on user answers. The `crews` feature is the pattern to copy. Assumed:
  "inactive" means archived.

## Original request

"I would like to work on the services page. Both the page and the data
structure in supabase. Right now all of the data is being populated by mock
data. We will need to build out the supabase table to mirror the mock data as
closely as possible. Specifically the months in which a service is provided."

## Goal

The services page lists, creates, edits and archives real `services` rows. The
table carries every field the mock `Service` has, including the seasonal months.

## Decisions

- **D1**: Months are `season_start_month` and `season_end_month`, `smallint`
  1-12. Both null means year-round. A start after the end wraps over new year
  (Nov to Mar). This matches the mock's `season` and `inSeason` (user).
- **D2**: `color text`, `equipment text[]` and `frequencies service_frequency[]`
  are columns on `services` (user).
- **D3**: Scope is the services page only. Jobs, requests and the quote builder
  keep reading mock services (user).
- **D4**: `is_active` is `archived_at is null`. No new column.

## Open questions

None.

## Assumptions

- "Inactive" in the UI means archived.
- Existing remote `services` rows (if any) get null season, null color, empty
  equipment and `{one_time}` frequencies from column defaults.

## Design refs

`docs/database/tables/catalog-tax.md`, `docs/database/rls.md`, ADR 0009,
`docs/plans/crews-list.md`.

## Layers touched

Schema, tRPC, client hooks, route UI, stories, docs.

## Changes

### Schema

Migration `services_season_fields`:

- `create type service_frequency as enum ('one_time','weekly','biweekly','monthly')`.
- `alter table services add`: `season_start_month smallint`,
  `season_end_month smallint`, `color text`, `equipment text[] not null
default '{}'`, `frequencies service_frequency[] not null default
'{one_time}'`.
- Checks: months between 1 and 12; both months null or both set; `color` matches
  `^#[0-9a-fA-F]{6}$` or is null; `frequencies` has at least one element.
- Extend the insert and update column grants with the five new columns.
- RLS is unchanged: the existing org-scoped policies cover the new columns.
- Update `catalog-tax.md` and the ERD, then run `pnpm db:types`.

### Middleware

None. `organizationProcedure` and `requireOrgPermission('manageServices')`
already exist.

### Procedures

`src/integrations/trpc/services.ts`, registered in `router.ts`:

- `list` ({ organizationId }): all rows including archived, ordered by name.
- `create`, `update` ({ organizationId, id, patch }), `setArchived`
  ({ organizationId, id, archived }). Writes require `manageServices` and
  filter by `organization_id`. Zod bounds the months to 1-12 and requires both
  or neither.

### Routes and UI

- `src/integrations/services/services.ts`: `useServices` and
  `useServiceMutations`, mirroring `crews`. It maps a row to the page's
  `Service` shape (`season`, `is_active`).
- `services.tsx` swaps `t.services` and `actions.saveService` and
  `updateService` for these hooks. Loading, error and empty states are added.
  Layout, filters and the month strip are unchanged.
- Usage counts that need jobs stay mock (D3).
- Stories with interaction tests. Design record `docs/services/ui.md` with
  screenshots.

### Acceptance criteria

- A service created with Nov to Mar persists and shows those months as offered
  after a reload.
- A service with no season shows year-round.
- A worker sees the list but no edit controls. The server rejects their writes.
- Archiving moves a service to the Inactive filter.

## Commits

1. Plan and migration, docs, regenerated types.
2. Router, hooks and procedure tests.
3. Page wiring, stories, design record.

## Unhappy paths

Duplicate active name returns CONFLICT (the unique index). A cross-org id
updates nothing, via RLS and the org filter. A half-set season is rejected by
zod and by the database check.

## Out of scope

Jobs, requests and quote builder using real services. Default services for new
orgs. `service_default_taxes` UI.

## Dependencies not to add

None.

## Verify command

`pnpm exec tsc --noEmit && pnpm lint && pnpm check && pnpm exec vitest run`

## Verification

Procedure tests (cross-tenant, multi-org, per-role), story interaction tests,
and a pass through the running app.

## Audit log

## Scope-change log
