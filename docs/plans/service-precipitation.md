# Plan: Service precipitation settings

- **Slug / branch**: `service-precipitation` / `feat/service-precipitation`
- **Tier**: full; schema, procedures, and UI.
- **Status**: approved
- **Confidence**: 95%; scope, existing create/update paths, and one-rule-per-service model confirmed. User replied "Approved" on 2026-10-28 after the explicit one-pair recommendation and draft plan.
- **Plan-mode file**: this file; native plan mode unavailable. Explicit approval in chat is required before implementation by the repository workflow.

## Original request

> I need to do a database rework for the services an organization offers. What I am thinking of doing is adding a column to the services table of: precipitation_dependency with values of "schedule" or "re_schedule".
>
> Essentially what this will do is tell the admins if there is a snow day, we schedule a route. If in the summer there is a rainy day, they will reschedule lawn mowing jobs. Is this a good approach?

> It should only flag for now. But in this PR all I would like to do is to add the columns and make them editable in both the created and upate processes in the services page. It will later integrate with weatherapi.com data to create these flags so be mindful of the data shape from this api. But for now just the update and create procedures and adding them to the UI of the services page.

## Goal

Store and edit each organization's service precipitation settings through the existing Services Add/Edit modal and tRPC procedures. Flags and weather ingestion are future work. Ship the approved scope in one PR.

## Decisions

| #   | Question          | Answer                                                                               |
| --- | ----------------- | ------------------------------------------------------------------------------------ |
| Q1  | Automation?       | Future behavior only flags recommendations. No automatic scheduling or rescheduling. |
| Q2  | This PR?          | Columns, create/update procedures, Services UI, and required verification/docs only. |
| Q3  | Weather provider? | Future integration with WeatherAPI.com.                                              |

Approved decisions (user approval on 2026-10-28):

- **D1**: Two columns: `precipitation_type` (`none`, `rain`, `snow`, `any`) and `precipitation_action` (`none`, `schedule`, `reschedule`). Both default to `none`. `any` means rain or snow; it does not imply different actions for different precipitation types.
- **D2**: Use Postgres enums, following the catalog's existing enum conventions. Enforce `(precipitation_type = 'none') = (precipitation_action = 'none')` with a CHECK: either disabled, or a condition and an action.
- **D3**: One optional rule per service. No amount/probability thresholds in this PR.
- **D4**: Add a compact Weather preferences section to the current modal, with Precipitation and Suggested action selects. For no precipitation dependency, reset the action to `none` and disable its select. When enabling a type, default action to `schedule`; users can choose `reschedule`. Help text says these preferences are saved for future weather recommendations; no flags are generated yet.

## Open questions

None. User approved one precipitation/action pair per service and the draft plan.

## Assumptions

| Assumption                                                           | User-confirmed?    |
| -------------------------------------------------------------------- | ------------------ |
| Existing owner/admin manage-services permissions remain appropriate  | Yes; approved plan |
| Existing services remain weather-independent until explicitly edited | Yes; approved plan |

## Design refs

- Mock: none; extend the existing modal with the two selects, using existing field styling. A separate mock is optional for this small form addition.
- Screens: create `docs/services/ui.md`, Add/Edit service modal section and Services page context, with implemented screenshots.
- Future mapping verified against https://www.weatherapi.com/docs/forecast-api/: daily `daily_will_it_rain`, `daily_will_it_snow`, `daily_chance_of_rain`, `daily_chance_of_snow`; hourly `will_it_rain`, `will_it_snow`, `chance_of_rain`, `chance_of_snow`. Amounts have explicit units (`totalprecip_mm`, `totalsnow_cm`, hourly `precip_mm`, `snow_cm`). Store our business rule rather than API condition text or raw response. No API call, provider dependency, mapping implementation, units, or thresholds added now.

## Layers touched

- [x] Migration
- [x] pgTAP tests (existing RLS policies retained)
- [x] `docs/database`
- [x] Generated types (`pnpm db:types`)
- [x] tRPC procedures
- [x] UI components and Services route
- [x] Stories and procedure tests
- [x] Design record
- Middleware and Sentry need no new behavior; retain existing org-scoped procedures and spans.

Security-gated paths: `supabase/migrations/**`, `src/integrations/trpc/**`, `src/routes/_authed/services.tsx`. Security review required.

## Changes

### Schema

- Create migration `services_precipitation_settings` using CLI migration creation after inspecting CLI help. Add `public.service_precipitation_type` and `public.service_precipitation_action` enums with D1 values, and two NOT NULL columns with `none` defaults and D2 CHECK on `public.services`.
- Extend column-level INSERT/UPDATE grants to `authenticated` for both fields; preserve existing RLS and organization scoping. No indexes required for settings that are not queried by weather yet.
- Main agent compares remote migration history by name with main/branch and other open PRs before applying to project `skygtamcakhoirlrqlnq`; investigate unexplained migrations before proceeding. Apply only after approval, rename local file to remote-assigned version, and regenerate types with `pnpm db:types` once histories satisfy the repository gate.
- Update `docs/database/tables/catalog-tax.md` with enums, columns, defaults, invariant, and future WeatherAPI notes. No new table or relationship; ERD and ADR changes unnecessary.
- `supabase/tests/services_precipitation_test.sql`: transaction/rollback fixtures in a dedicated test org, TAP aggregation per test README. Cover defaults, every permitted condition/action combination, invalid enum values/nulls/half-disabled pairs, owner/admin writes, dispatcher/worker/nonmember/portal denial, cross-org read/write denial, multi-org scope at procedure level, and direct authenticated writes using new column grants. Do not modify demo or real tenants.

### Procedures and client mapping

| Procedure                               | Input                                                                                                                                    | Output                                         | Roles allowed          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| `services.create`                       | Existing fields plus optional precipitation pair; omitted pair defaults to `none`/`none`. Reject half-specified or invalid combinations. | Existing service row including both new fields | Owner/admin, unchanged |
| `services.update`                       | Existing partial patch; precipitation fields supplied together or both omitted. Validate pair before writing.                            | Updated row including both new fields          | Owner/admin, unchanged |
| `services.list`, `services.setArchived` | Unchanged                                                                                                                                | Include both fields via `SERVICE_COLUMNS`      | Existing permissions   |

- Update `src/integrations/trpc/services.ts` select columns and Zod input schemas. Avoid create defaults leaking into update patches: omission on update must preserve existing settings. Existing unrelated field patches remain valid; empty patches still fail. Pair validation on update avoids a read-before-write race and matches the existing paired-season contract.
- Update `src/integrations/services/services.ts` mapping, `src/components/crm/types.ts` Service shape, and necessary service fixtures/default constructors in `src/components/crm/seed.ts`, `src/components/crm/store.ts`, stories/tests and other compiler-identified consumers. Existing mock services default to `none`/`none`; no name-based inference.
- Retain user-session Supabase client, verified organization filter, existing errors, permissions, cache invalidation, and Sentry spans.

### Routes and UI

| Route       | Screen                                                       | States                                                                                                               |
| ----------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `/services` | Existing Add/Edit service modal, Weather preferences section | New disabled default; edit populated settings; pending save disabled; failure retains input and existing error toast |

- Wire both settings into modal state and create/update payload. Reopening a saved service restores its pair. Unrelated edits retain the pair.
- Prefer a small controlled `src/components/services/PrecipitationFields.tsx` using shadcn Select primitives (or native selects styled consistently with existing fields) with associated labels and explanatory text. Add matching `.stories.tsx` interaction tests for disabled default, snow/schedule, rain/reschedule, `any`, and reset-to-none. Keep the rest of the modal in place.
- No service-card badges, filters, dashboard changes, alerts, route/job/visit changes, or weather effects.

### Acceptance criteria

1. Existing services and create callers that omit settings get `none`/`none`.
2. Owner/admin can create, read back, edit, clear, and reopen each supported pair in Services.
3. Invalid/half-specified pairs fail before procedure writes and invalid persisted pairs fail database checks.
4. Updates that omit precipitation fields preserve them; selecting no dependency clears both.
5. Existing access restrictions and active-org isolation cover both new fields.
6. No WeatherAPI requests, flags, automatic scheduling, or new environment variables.

## Commits

1. `docs: record service precipitation plan` (main agent): approved plan, then draft PR.
2. `db: add service precipitation settings` (main agent): migration/application/version alignment, catalog documentation, generated types and pgTAP tests.
3. `feat: edit service precipitation preferences` (implementer, isolated worktree): procedures, mapping/types/default fixtures, UI, tests/stories, design spec and decisions. Main agent captures implemented screenshots during verification before review.
4. Review-driven fixes, if needed, follow workflow; all changes in the same PR.

## Unhappy paths

- Null/unknown enum, half-disabled settings, or partial precipitation update: reject; no writes.
- Existing callers omitting the pair on create: use safe defaults. Updates omitting it do not reset anything.
- Foreign org/id or forbidden role: existing membership checks, permission middleware, org filter and RLS apply. Cross-org updates return NOT_FOUND or authorization rejection as appropriate.
- Network/database failure: existing toast, keep modal open with inputs for retry; invalidate query using current behavior.
- Concurrent edits: existing last-write-wins behavior; precipitation pair written atomically, unrelated partial patches preserve it.
- Unexplained remote migrations, type regeneration failure, missing tools or failed required checks: stop dependent work and report; do not hand-edit generated types or bypass merge gates.

## Out of scope

- WeatherAPI ingestion, credentials, thresholds, condition-code mapping, flags, automation, service overrides on jobs, multiple rules per service, card badges and dashboard work.

## Dependencies not to add

- No new npm packages, weather SDK, cron, database extension, or external service.

## Verify command

```sh
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

- Extend `src/integrations/trpc/services.test.ts` with valid/default/invalid pairs, read selection, update omission and atomic pair behavior; owner/admin success, dispatcher/worker/portal/nonmember rejection for both mutations; active-org tests for a multi-org user and foreign-org service update. Mock-chain checks verify filters; pgTAP verifies actual RLS/grants separately.
- Run all SQL test files in `supabase/tests/` via main-agent MCP `execute_sql`; every TAP assertion passes and fixtures roll back. Compare advisors before/after; no new warnings.
- Run the exact verify command on PR head; Storybook play tests cover field interactions. Typecheck verifies all Service-shaped consumers migrated.
- Verify running app signed in with seeded test credentials from `.env.local` without exposing them: inspect existing edit modal without saving demo changes; create/update/reopen/clear a service only in a dedicated test org. Capture Add/Edit desktop and phone screenshots at documented viewport sizes, device scale factor 2.
- Record `docs/services/ui.md`, screenshots, and default-design decisions in `docs/design/decisions.md`; update design index.
- Full workflow Definition of done in PR body, fresh reviewer pass followed by security pass, main synchronization and re-verification before merge. Only merge after every workflow condition passes. Remove implementer worktrees afterward.

## Audit log

### Round 1 (`plan-auditor`): needs-changes, confidence high

- **Blocking**: D1/D3 are material unconfirmed product choices; the plan cannot claim 95% or defer confirmation into implementation approval. **Resolution**: user approved on 2026-10-28 after the explicit clarification; round 2 verified closure.
- **Non-blocking / unresolved**: none.
- **Pre-existing**: CLAUDE.md's unit-test configuration description is stale; actual Vite config has a node unit project, which this plan correctly uses.
- **Checked clean**: limited scope; schema invariant/defaults/grants; service select/mapping/modal paths; org/role restrictions; pair/omission validation; test configuration; verification and design/review gates.

### Round 2 (`plan-auditor`): pass, confidence high

- **Blocking / non-blocking / unresolved**: none. Previous blocker closed by explicit user approval; original scope unchanged.
- **Checked clean**: whole plan against repository workflow/template, database/RLS/design documentation; enum defaults and paired checks; grants, atomic input validation and omission preservation; role/org restrictions; unhappy paths; migration/type gates; rollback fixtures; application/screenshots and review gates.
- **Pre-existing**: stale CLAUDE.md Vitest description as noted above.
- **Approval**: user said "Approved" on 2026-10-28; applies to this unchanged scope and confirmed one-pair model. No further permission required.

## Scope-change log

_None._
