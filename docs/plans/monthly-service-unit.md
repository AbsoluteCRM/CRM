# Plan: Monthly service pricing unit

- **Slug / branch**: `monthly-service-unit` / `feat/monthly-service-unit`
- **Tier**: full; database enum and UI/validation change together.
- **Status**: approved
- **Confidence**: 97%; the user confirmed replacing stored `each`, and callers were inspected.
- **Plan-mode file**: this file; native plan mode is unavailable.

## Original request

> We need to make a slight tweak to the services table. the unit column has various unit pricing. Right now there is "job" and "visit". I would like to get rid of job as it is the same as visit and replace it with "monthly" to indicate a subrscription instead. Migrate any rows that contain "job" to "monthly and remove "job"
>
> Update the UI to accept this change. It will be present in the requests tab as well as the portal page.

## Goal

Replace the service pricing unit displayed as “per job” with `monthly`, displayed as “per month”, including existing services and request/portal consumers. Keep visit pricing available.

## Decisions

| #   | Question                                                      | Answer                                                                                                                                    |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | The database uses `each`, displayed as “per job”; replace it? | User: “Yes—replace each with monthly (Recommended)”. The question explicitly proposed migrating every service and displaying “per month”. |

Agent defaults (minor; the user may veto them):

- D1: Keep the existing UI layout and default new-service selection (`visit`). No mock needed for a label/option change; a sketch remains optional.

## Open questions

None about product behavior. Remote database access must be established during implementation; no Supabase MCP tools are exposed in this session. If the existing CLI cannot provide the required migration/history/advisor workflow, report that limitation and stop remote work without substituting an untracked SQL write.

## Assumptions

| Assumption                                                                         | User-confirmed?                                       |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Replace every stored `each` service unit, including archived services              | yes                                                   |
| Monthly is a pricing label; automatic subscription billing is outside this request | No; scope follows the request to change the unit only |

## Design refs

- Mock: none; preserve the current controls and replace the option text.
- Screens: `docs/services/ui.md` and `docs/requests/ui.md`; record the user decision in `docs/design/decisions.md` and refresh affected running-app screenshots.

## Layers touched

- Migration, database reference, generated types, tRPC validation, UI labels, fixtures/seed data, tests, and design record.
- No middleware, RLS, auth, route-loader, or Sentry behavior changes.
- Security-gated paths: `supabase/migrations/**`, `src/integrations/trpc/services.ts`, `src/routes/_authed/services.tsx` (plus any necessary route changes).

## Changes

### Schema

Add a forward migration `rename_each_service_unit_to_monthly` using `ALTER TYPE public.service_unit RENAME VALUE 'each' TO 'monthly';`. Enum renaming changes the representation of all stored enum values and the existing services default without row updates. Preserve other values and existing migration history. Reference: https://www.postgresql.org/docs/current/sql-altertype.html.

Before applying, main agent compares remote migration names against main, this branch, and open PRs, per workflow. Stop on unexplained drift. Apply through the approved project workflow, rename the local migration to the assigned version, update `docs/database/tables/catalog-tax.md` (enum and default), and run `pnpm db:types`; never hand-edit generated types. Verify the remote enum/default and no remaining `each` service values. Update `supabase/seed.sql` to use monthly so resets still work.

### Procedures and types

Change the unit validator in `src/integrations/trpc/services.ts` to accept `monthly` and reject `each` and `job`. Keep procedure permissions, organization scope and response shape. Update `ServiceUnit` in `src/components/crm/types.ts` and all current service fixtures using `each` in CRM seed data, portal/request/quote stories. Search all current code and SQL outside historical migrations for stale service-unit literals.

### Routes and UI

- `/services`: update the pricing-unit select and card label in `src/routes/_authed/services.tsx` to `monthly: 'per month'`; remove obsolete pricing copy where needed.
- `/portal/$orgSlug`: update `UNIT_LABEL` in `src/components/portal/RequestModal.tsx`, used by both portal cards and request-modal price subtitle.
- `/requests`: follow `RequestsPanel` and `RequestWorkspace` consumers and any nested quote/service pickers; update unit displays if present and fixtures/types so monthly services remain usable. Do not introduce a new pricing display to screens that currently have none.

### Acceptance criteria

1. Every existing `each` service reads as `monthly`; other units, prices, IDs, and relations are preserved.
2. DB and API accept monthly and reject old unit inputs; the database default reads monthly, while the UI's existing visit selection remains visit.
3. Services and portal price text says “per month”; the “per job” unit option is gone; requests and nested service consumers handle monthly data.
4. Fresh seeds and existing story fixtures work with the new enum.
5. Monthly units do not change service frequencies or create subscriptions/charges.

## Commits

1. `docs: record monthly service unit plan` (main agent): approved plan; push and open draft PR on a branch from freshly fetched origin/main.
2. `feat: replace each service pricing unit with monthly` (main agent with implementer): one buildable vertical-slice commit contains migration, database docs, generated types, SQL seed, validation, type alias, UI labels, fixtures and regression tests. Main agent performs remote steps only after approval/history checks. Dispatch implementer in an isolated worktree to prepare application changes as a patch without committing an incompatible intermediate state; main agent incorporates that patch with its database/type changes and commits the complete slice after typechecking. There is one PR-branch writer.
3. `docs: record monthly pricing verification` (main agent): running-app shots, design record, audit/review results and implemented status when all work passes.

## Unhappy paths

- Invalid/stale `each` or `job` inputs fail validation; refresh an old open service form after rollout. Coordinate database and app rollout because old clients may still submit each.
- Migration fails or remote history differs: stop, report, and do not claim a successful migration or regenerate types from an unexplained schema.
- No database/CLI access or missing app credentials: record the precise unmet gate; do not fabricate execution, screenshots, advisors, or types.
- A failed save keeps existing error handling; no access-control changes.

## Out of scope

Automatic subscriptions, payment integration, recurring-charge scheduling, frequency changes, and renaming document/job entities.

## Dependencies not to add

No new dependencies or services.

## Verify command

```sh
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

- Add meaningful regression coverage in existing services tests for monthly create/update and rejection of removed values, preserving existing role/tenant coverage.
- Update portal modal story coverage to assert “per month”; ensure request and quote stories with monthly fixtures pass.
- Add pgTAP coverage for enum members/default and rejection of old values; exercise migration on pre-existing each data in a dedicated test database/org where available. Never use production tenant rows for test writes.
- Run existing pgTAP tests and advisors; no new warnings. Run all Definition-of-done checks.
- Verify Services create/edit/reopen, portal cards/request modal and Requests with monthly services in the running app using the dedicated QA org; capture affected screens at required desktop/phone sizes.
- Fresh reviewer then security audits must pass. Record results; merge main, regenerate types as required, rerun checks at PR head, complete PR checklist, mark ready and merge only through the workflow gate.

## Audit log

### Round 1 (`plan-auditor`): needs-changes, confidence high

- Blocking: generated types in a standalone database commit would leave validators and fixtures using `each`, violating the template requirement that each commit builds.
- Resolution: fixed commit boundaries; assemble database/types and implementer application patch into one buildable vertical-slice commit, with main agent as the only PR-branch writer.
- Non-blocking: remote access remains conditional; explicitly retained the access/history gate.
- Unresolved: none.
- Pre-existing: none.

### Round 2 (`plan-auditor`): pass, confidence high

- Blocking: none; prior commit-boundary finding verified closed.
- Checked clean: complete workflow/template, confirmed replacement and preserved visit, enum migration/history/default/types, Services/portal/request consumers, test and design records, single writer, and review/security/merge gates.
- Non-blocking: remote migration, generated types, pgTAP, advisors and running-app checks remain execution gates; stop and report if unavailable.
- Unresolved: none.
- Pre-existing: none.

## Scope-change log

None.

## Approval

User approved this audited plan on 2026-10-28: “Approved”.
