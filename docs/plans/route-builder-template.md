# Plan: Route Builder template

- **Slug / branch**: `route-builder-template` / `feat/route-builder-template`
- **Tier**: full; new UI feature and route.
- **Status**: implemented (revision after initial implementation)
- **Confidence**: 95%; user confirmed empty templates before crew assignment, dropdown crew selection, selectable route cards, cross-route dragging, and Teams as reference. Daily route/visit constraints are verified in the repo.
- **Plan-mode file**: this file; native plan mode is unavailable. Revision changes only this uncommitted plan until fresh audit and explicit chat approval.
- **PR**: https://github.com/AbsoluteCRM/CRM/pull/63 (draft).

## Original request

> I added another tab to SidePanel.tsx - the route builder. Down the line this will be where admins can build routes from a collections of jobs and assign them to a crew. For now can we just template out the page, matching styling from other pages of what this could look like. Use the shape of the database but make mock data for implementation.

## Goal

Build a `/route-builder` prototype with three explicit sections: Existing routes, Create route, and Available jobs. Follow the Teams Crew builder pattern: create an empty route card, assign a crew from its dropdown, and drag scheduled job visits from the pool or other routes into it. Selectable route cards contain ordered stops and summaries; selection targets the accessible Add action and illustrative preview. Changes stay in component state and reset on refresh. Use database-shaped mock records, with a separately identified local-only unassigned template model.

## Decisions

| #   | Question          | Answer                                                                                                                                                                                     |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Interaction scope | User chose an interactive mock with local edits resetting on refresh.                                                                                                                      |
| Q2  | Roles             | Owner/admin/dispatcher, preserving existing tab visibility.                                                                                                                                |
| Q3  | Styling and data  | Existing page styling and database-shaped mock data.                                                                                                                                       |
| Q4  | Revised layout    | User: “What I would like for a section of existing routes and a section for creating a route, and a section for adding to existing routes with the available jobs”.                        |
| Q5  | Creation          | User: “Creating a route should create an empty template. With that template we can add available jobs and assign a crew. Have a look at the Teams route for a good idea of this template.” |
| Q6  | Assignment        | User: “The crew can be selected from a drop down. And jobs should be able to be drag and dropped between various routes.”                                                                  |
| Q7  | Existing routes   | User confirmed selectable summary cards showing crew, date, status, stop count and duration, with ordered stops alongside Available jobs.                                                  |

Agent defaults (minor; the user may veto them):

- **D1**: CRM PageShell, cream/leaf/lime tokens and rounded cards. Specifically imitate Teams CrewBuilder creation control, draggable cards, highlighted drop targets and unassigned pool. Desktop places Available jobs beside the Existing routes board; phone stacks sections, with contained board scrolling if necessary.
- **D2**: One page-level route date filter. Create route adds and selects an empty template for that date with a unique local label (Route 1, Route 2, etc.), no crew and no visits. Labels are presentation metadata, not database columns. Seed two assigned draft routes and some available visits to demonstrate transfers immediately.
- **D3**: Keep a compact illustrative schematic for the selected route. Preserve search, selected-route Add, removal, up/down ordering and reset. Use native HTML drag/drop plus button/select alternatives for touch and keyboard. No fake save, publish, optimization or driving estimates.

## Open questions

None that change the scope. The revised plan requires fresh audit and explicit user approval before implementation.

## Assumptions

| Assumption                                                                          | User-confirmed?                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Mock only, local edits reset on refresh                                             | yes                                                              |
| Owner/admin/dispatcher access                                                       | yes                                                              |
| Empty template before assigning crew or adding jobs                                 | yes                                                              |
| Dropdown crew selection, selectable cards and dragging between routes               | yes                                                              |
| Route templates are drafts for a selected day, consistent with database route dates | verified repo contract; no recurring template behavior requested |
| Exact arrangement, example customers and sequential local labels                    | no; minor visual defaults                                        |

## Design refs

- Mock: none; UI described here. An external sketch remains optional.
- Canonical references: `src/routes/_authed/teams.tsx`, `src/components/team/CrewBuilder.tsx`, `src/components/team/CrewBuilder.stories.tsx`, `src/components/crm/PageShell.tsx`, `src/components/crm/RouteMap.tsx`.
- Database: `docs/database/tables/crews-routing.md`, `docs/database/tables/jobs-visits.md`, `src/types/database.ts`.
- Update `docs/route-builder/ui.md`, its implemented screenshots, and `docs/design/decisions.md` for the revised design. Existing screenshots describe the previous implementation and must be replaced.

## Layers touched

- Routes, UI, typed mock fixtures, Storybook interactions, design record.
- No migrations, RLS, generated DB type changes, middleware, tRPC or server functions; no Sentry changes needed for client-only fixtures.
- Security-gated path in the overall PR: `src/routes/_authed/route-builder.tsx`; fresh security review is required after fresh reviewer pass.

## Changes

### Schema, middleware and procedures

None. Read generated types only; no Supabase calls, remote writes or changes to existing Teams behavior.

### Routes and UI

| Route            | Screen        | States                                                                                                                                                         |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/route-builder` | Route Builder | Existing routes, selected card, empty unassigned template, crew conflict, no routes/date visits, empty/filtered/all-assigned pool, invalid drop, worker denial |

- Preserve the implemented thin route/PageShell wrapper and `canSee(t.role, 'route-builder')` denial. Fixture content remains inside the gated child; no loader or protected prefetch. Preserve the user's navigation/type additions already committed in this PR. Generated route tree is never manually edited.
- Revise `src/components/route-builder/RouteBuilder.tsx`, `mock-data.ts` and `RouteBuilder.stories.tsx`. Split local visual components where useful and use `#/` imports in changed feature modules.
- Fixtures select generated `Tables` columns for jobs, visits, crews, routes, route stops, clients and properties, with consistent synthetic organization and FK relationships. Visits use actual ISO timestamps for windows, displayed in the example Calgary timezone; schematic coordinates are separate presentation data.
- Replace implicit crew/date drafts with an explicit collection keyed by stable template IDs independent of assigned crew. Persisted-route-shaped fixtures retain required `crew_id`. Define a separate UI template type for work in progress with nullable crew, local label and ordered visit IDs. Do not claim an unassigned template is a valid database row; no persistence conversion is implemented. Jobs may be added before crew assignment in this local model.
- **Create route**: explicit section/control creates an empty unassigned template on the selected date, gives it a unique local ID/label, and selects it. Multiple crew-less templates are permitted. No automatic routes on date/crew changes.
- **Existing routes**: selectable cards with date, crew or Unassigned, Draft badge, stop count, on-site work duration, crew dropdown and ordered draggable visit cards. Use a separate accessible selection button; avoid nested interactive controls inside buttons. Selection highlights the route, targets pool Add actions, and determines the compact schematic. All route cards accept drops, so visits can move between routes without reselecting the destination.
- Crew dropdown includes No crew. Assignment changes that template only and retains its visits. Disable crews occupied by another route for the same date and revalidate in the state update. Clearing assignment frees the crew. Enforce at most one assigned template per crew/date, matching database uniqueness.
- Page-level date selection filters route cards and the available pool, selecting an existing route or none without modifying other dates. A date with no routes offers Create route guidance. Templates keep their original date; no rescheduling UI.
- **Available jobs**: scheduled unassigned visits for the selected date joined to job/customer/property/service/duration/window. Explain one stop is one job visit; no invented visit crew field. Search matches customer, address, job number and service. Add to selected route is disabled with guidance when no route is selected.
- Native drag supports pool → route, route → another route, route → pool. A single functional update validates the known visit/destination/date, removes its source assignment, appends to target, renumbers both routes contiguously from 1, and updates summaries/preview. Same-route and duplicate drops are no-ops. Reject unknown/cross-date payloads without mutation. Use a custom visit MIME type, actual draggable root elements and labeled drop containers. Clear highlights on drop/cancel.
- Equivalent Add/remove and per-stop Move to route select/action support touch and keyboard, using the same transfer operation. Up/down controls reorder within a route with disabled boundaries. Announce transfers/errors through a live status region. No packages or drag library added.
- Reset restores seeded routes/date/selection/search and gives feedback. Refresh discards changes. No network calls or shared CRM store mutation.

### Acceptance criteria

1. The sidebar opens a styled page with visibly distinct Existing routes, Create route and Available jobs sections based on Teams Crew builder.
2. Creating a route selects a genuinely empty template, usable before crew assignment. Dropdown assignment/clearing preserves visits and enforces crew/date uniqueness.
3. Native pool→route, route→route and route→pool drags work without lost/duplicate visits; sequences, summaries and preview stay consistent. Keyboard/touch alternatives work.
4. Selection, search, date, reorder, removal and reset work locally; refresh restores fixtures. Wrong-date/unknown drops do not mutate state.
5. Owner/admin/dispatcher can use the builder; workers opening the URL see the existing denied state and no builder content.
6. Empty, no-selection and filtered states are helpful; phone layout has no page overflow. Clearly identify mock state and illustrative map.
7. Meaningful stories, real browser drags, updated UI spec and fresh desktop/phone screenshots document the revised behavior.

## Commits

Already shipped to draft PR #63:

1. `dbb0efa` Document Route Builder template plan (main).
2. `eaeddc0` Add mock Route Builder page (implementer).
3. `11f0822` Record Route Builder design and verification (implementer).
4. `3b28677` Capture Route Builder browser verification (main).

Revision commits after fresh audit and approval, in the same PR:

5. `Revise Route Builder plan for route templates` (main): revised plan, user decisions, fresh audit and approval.
6. `Build route template board with drag and drop` (implementer): UI/fixture changes and revised interaction stories together.
7. `Record revised Route Builder verification` (main/implementer, one writer): revised design records, recaptured Git LFS screenshots, exact check results, fresh whole-diff review/security verdicts and plan status.

After revision approval commit/push the plan first, fetch origin/main and synchronize the existing isolated implementer worktree with the feature branch. Inspect git status and preserve unrelated work. Stop if fresh main materially contradicts verified contracts. Follow the workflow's one-writer, worktree, push, review and gated merge process. This environment lacks `subagent_type`; fresh agents receive matching `.claude/agents/` role instructions without model override. Remove implementer worktrees after merge as required.

## Unhappy paths

- Duplicate/rapid transfers: functional atomic updates preserve exactly one assignment per visit; duplicate/same-route drops are no-ops. Rapid create actions produce unique IDs and labels.
- Occupied crew: disabled option plus updater validation; readable feedback. Clearing a crew preserves the route and jobs.
- No route selected/empty date: explicit creation guidance, disabled Add; switching dates preserves other templates and does not silently create routes.
- Wrong-date/unknown/drop outside target: no mutation, useful feedback where appropriate and cleared highlight on cancel. Validate current state, not only drag payload.
- Touch/keyboard: Add/remove, move select/action and reorder buttons remain usable without drag support. Avoid inaccessible card selection controls.
- Missing optional display values: readable fallback, no crashes on missing property/customer/window. Fixtures are synchronous, so no fake loading or remote-error UI.
- Worker direct navigation: existing denial and no rendered builder; demo UI gate does not claim server authorization.
- Concurrent browser tabs: separate prototypes, refresh reset explained by demo notice.
- Tool/auth/check failures: record exact blocker; no successful verification/merge claim without evidence.

## Out of scope

Live data, persistence, schema changes, reusable recurring templates, route deletion, real assignment, scheduling/rescheduling, publication, optimizer/geocoding/road directions, crew roster editing, changes to Teams or existing Jobs routing tools, and unrelated test repairs.

## Dependencies not to add

No new packages, map SDK, drag/drop library, optimizer or database access dependency.

## Verify command

```bash
pnpm generate-routes && pnpm build && pnpm exec tsc --noEmit && pnpm lint && pnpm check && pnpm exec vitest run
```

Build precedes tsc because Start restores its generated registration after router CLI generation. Main checkout runs this command with `pnpm exec dotenv -e .env.local -- bash -c` without exposing secrets; implementer must not read/copy the main env file.

## Verification

- Stories: multi-route populated board, empty template, empty date/no routes, filtered/all-assigned pool and phone. Play tests: create empty before assigning crew, unique IDs/labels, selection, assign/clear crew, occupied crew rejection, all three drag pathways, unknown/cross-date/same-route drops, fallback controls, reorder, sequence/summary/preview consistency, date preservation, search/reset.
- Real authenticated Playwright `dragTo` tests on draggable roots and labeled targets must demonstrate pool→route, route→route and route→pool. Synthetic story events alone are insufficient. Verify phone fallback controls, owner/admin/dispatcher access, worker denial, refresh reset and no horizontal overflow.
- Recapture `docs/route-builder/shots/route-builder-desktop.png` at 1440×900, phone and phone-draft at 390×844, device scale factor 2; visually inspect and commit through Git LFS. Update screen spec/decisions in the same PR.
- Run exact command and required Definition-of-done checks on revised head. Record pre-existing failures without weakening tests; do not merge while required checks fail.
- Procedure/tenant/DB tests and advisors are N/A: no schema/procedures/live DB access. Fresh reviewer then security over the whole diff, not only revision. Check status after read-only agents. Record verdicts and PR checklist; merge only under all workflow gates.

## Audit log

### Initial plan: pass, confidence high

Fresh `/root/plan_auditor` passed the initial plan with no blocking, non-blocking, unresolved or pre-existing findings. Checked request/decisions, workflow/template, design record, PageShell gate, database relationships, types/scripts, styling and unhappy paths. User explicitly approved on 2026-10-29: “Approved”. That approval covered the previous layout only.

### Initial implementation review: pass, confidence high

Fresh `/root/reviewer` passed whole diff at `3b28677`; no blockers/unresolved. Checked request, role gate, generated route, fixtures, state invariants, empty/boundary paths, meaningful stories and design artifacts; no secrets/network/persistence or test suppression. Non-blocking: full suite gate fails on confirmed baseline tests; prefer alias imports in revised feature files. Status clean after read-only review. No security pass yet. These verdicts do not cover this revision.

### Revision audit

Fresh `/root/revision_plan_auditor` returned **pass**, confidence **high**, with no blocking, non-blocking or unresolved findings. Checked the entire revised plan against user decisions, Teams creation/drag patterns, nullable-crew UI template separation, visit uniqueness/date/sequence and crew conflicts, unhappy paths, keyboard/touch alternatives, workflow/template, scripts, actual browser drags, replacement screenshots and fresh reviewer/security gates. Pre-existing: five independently reproduced unrelated assertion failures; merge remains blocked while the full suite fails. Main checked git status after the read-only audit: only this plan is modified. Awaiting user approval of this revised plan.

## Scope-change log

- User approved the audited revision on 2026-10-29: “Approved”.

- Verification order corrected: router CLI removes the Start-specific type registration; normal build restores it before tsc. No generator config/manual generated-tree edits.
- 2026-10-29: User requested explicit Existing routes, Create route and Available jobs sections after initial implementation. Implementation stopped and plan returned to draft.
- 2026-10-29: User clarified empty templates before crew assignment, Teams reference, crew dropdown and dragging jobs between routes; confirmed selectable route cards. Revised plan adopts these decisions, separates unassigned local templates from non-null-crew DB rows, and retains daily route constraints. Awaiting fresh audit and approval.

## Previous implementation verification (historical; rerun for revision)

- Generation/build/tsc/lint/check pass. Initial isolated full suite: 160 passed, 5 assertion failures and seven missing-env suites.
- Initial main env-loaded full suite: **262 passed, 5 failed**, 25 files passed /3 failed. All eight new Route Builder stories pass. Five unchanged assertions fail in QuoteEditor Draft Editing, RequestsPanel Filters And Read Only Details, CrewBuilder Drag To Crew, Drag To Unassigned and Set Lead.
- All five failures reproduced before pulling feature code; `/tmp/route-builder-baseline.log` and `/tmp/route-builder-final-verify.log` contain evidence. No unrelated test fixes or weakened checks. Full-suite gate blocks merging even with feature reviews passing.
- Previous signed-in browser verification passed editing, crew isolation, search/date/reset/refresh, roles, no page errors and no horizontal overflow. Previous screenshots were captured and inspected as Git LFS. They must be replaced and all relevant checks rerun for the revision.

## Revised implementation verification

- Implementer commits: `4b18b49` route board and stories; `f671543` design text; `9a3a0c8` responsive date-field wrapping. All pushed to PR #63. Eight revised Route Builder stories pass.
- Main checkout ran the exact Verify command with its environment loaded after the final code change. Generation, production build, TypeScript, ESLint and Prettier pass. Full suite: **262 passed, 5 failed**, 25 files passed / 3 failed. Failures remain the independently reproduced unchanged QuoteEditor, RequestsPanel and CrewBuilder assertions recorded above. Full-suite gate fails; do not merge.
- Authenticated Chromium verified native `dragTo` pool→route, route→route and route→pool, adding a visit to an unassigned template, empty creation, crew assignment/clearing, occupied-crew exclusion, reset/refresh reset, owner/admin/dispatcher access and worker direct-navigation denial.
- Phone verification at 390×844 passed Add/Move/Remove alternatives and no horizontal page overflow. Screenshot inspection caught and corrected a clipped date field by wrapping the Create route controls; final phone image shows the full date.
- Real-drag harness uses card padding and compact drop targets in a taller viewport to avoid Playwright auto-scroll moving its precomputed source point. Initial event diagnostics showed the harness dragging another visit, not a state-transfer failure. All three intended real transfer paths pass with stable coordinates.
- Replaced and visually inspected desktop (1440×900), phone and phone-draft (390×844) screenshots at device scale factor 2. Files under `docs/route-builder/shots/` use Git LFS. Fresh reviewer and security verdicts will be recorded after their audits.
