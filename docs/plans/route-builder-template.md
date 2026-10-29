# Plan: Route Builder template

- **Slug / branch**: `route-builder-template` / `feat/route-builder-template`
- **Tier**: full; new UI feature with a new route.
- **Status**: approved
- **Confidence**: 95%; interaction scope and roles are user-confirmed, styling and visit/route relationships are verified in the repo. Remaining defaults are minor visual choices.
- **Plan-mode file**: this file; native plan mode is unavailable. Only this uncommitted plan is written before approval. Approval is an explicit chat reply to the audited proposal.

## Original request

> I added another tab to SidePanel.tsx - the route builder. Down the line this will be where admins can build routes from a collections of jobs and assign them to a crew. For now can we just template out the page, matching styling from other pages of what this could look like. Use the shape of the database but make mock data for implementation.

## Goal

Build a polished `/route-builder` prototype with an available-job pool, an ordered route draft, crew selection, and a schematic route preview. All changes live in local component state and reset on refresh. Use database-shaped mock records rather than the existing flattened demo jobs.

## Decisions

| #   | Question          | Answer                                                                                                  |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| Q1  | Interaction scope | User chose interactive mock builder: add/remove/reorder stops and crew selection, resetting on refresh. |
| Q2  | Roles             | User chose existing visibility: owner, admin, dispatcher.                                               |
| Q3  | Styling and data  | User requested existing page styling and mock data shaped like the database.                            |

Agent defaults (minor; the user may veto them):

- **D1**: Use PageShell, CRM cream/green tokens, rounded cards, lucide icons, and existing shadcn controls where appropriate. Desktop job pool and draft sit beside a schematic map; stack on narrower screens.
- **D2**: Start with a populated example date, two mock crews, a small collection of visits, and one selected draft. Show a clear demo notice. Provide search, date selection, crew selection, add/remove, accessible move-up/down controls, and reset. Do not add fake save, publish, or optimize actions.
- **D3**: Use a lightweight inline SVG schematic with numbered stops and label it as illustrative. No map service or real driving estimates.

## Open questions

None that change the approved scope. The audited plan still needs explicit user approval before implementation.

## Assumptions

| Assumption                                        | User-confirmed?          |
| ------------------------------------------------- | ------------------------ |
| Local-only interactive edits reset on refresh     | yes                      |
| Owner/admin/dispatcher access                     | yes                      |
| Mock rather than live database reads/writes       | yes, original request    |
| Specific visual arrangement and example customers | no; minor defaults D1–D3 |

## Design refs

- Mock: none, UI proposed here. An external design sketch is optional if the user wants one before implementation.
- Canonical references: `src/components/crm/PageShell.tsx`, `src/routes/_authed/jobs.tsx`, `src/components/crm/RouteMap.tsx`, `docs/calendar/ui.md`.
- Database references: `docs/database/tables/crews-routing.md`, `docs/database/tables/jobs-visits.md`, `src/types/database.ts`.
- Screens: add `docs/route-builder/ui.md` and implemented screenshots in `docs/route-builder/shots/`; record user decisions in `docs/design/decisions.md`.

## Layers touched

- Routes / UI components / mock fixture types / Storybook interaction tests / design record.
- No migrations, RLS, generated database changes, middleware, tRPC, or server functions; no Sentry changes needed for this client-only prototype.
- Security-gated path: `src/routes/_authed/route-builder.tsx`; security review is required.

## Changes

### Schema, middleware, procedures

None. Read existing generated types only. No Supabase calls or database writes.

### Routes and UI

| Route            | Screen        | States                                                                                                       |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `/route-builder` | Route Builder | Populated draft, empty draft, all visits assigned, filtered-empty job pool, date with no visits, role denied |

- Add `src/routes/_authed/route-builder.tsx` as a thin PageShell wrapper with `allowed={canSee(t.role, 'route-builder')}` and a restricted-content fallback for workers. All fixture content sits inside the gated child component. Follow current authenticated layout conventions; no loader or protected prefetch.
- Add `src/components/route-builder/RouteBuilder.tsx` for self-contained local state and presentation, `mock-data.ts` for fixtures, and `RouteBuilder.stories.tsx` for stories and interaction tests. Split internal visual components only where useful.
- Type mock records using selected generated `Tables<'jobs'>`, `Tables<'visits'>`, `Tables<'crews'>`, `Tables<'routes'>`, `Tables<'route_stops'>`, client and property row fields. Keep display-only schematic coordinates separate from database records. Fixtures share a synthetic organization ID and consistent job/property/client relationships.
- The job pool displays scheduled visits joined to their parent jobs, customer, property, service summary, duration and any arrival window. Explain that each stop represents a job visit. Do not invent a visit `crew_id`: assignment derives from route stops.
- Keep one draft per mock crew/date pair, selected by crew and date. A visit can belong to at most one draft. All stops match their route date; sequence is always contiguous and 1-based. Switching crew/date selects that draft without moving existing visits. Removing returns a visit to its date's pool. A new date has a valid empty state.
- Search filters the available pool by customer, address, job number or service. Add/remove/reorder update ordered stops, numbered schematic and total on-site duration. Show selected crew details and draft badge. Any travel/distance values in fixtures are explicitly sample values; do not compute or present road routing as real.
- Reset restores the original fixtures and controls with clear feedback. Boundary reorder buttons are disabled, controls have accessible names and focus styles, and layouts avoid page-width overflow at 390px.
- Preserve the user's existing `SidePanel.tsx` and `store.ts` edits. Include the tab and Section union addition in the feature PR; only format the added nav item if necessary. Regenerate `src/routeTree.gen.ts` with `pnpm generate-routes`, never manually.

### Acceptance criteria

1. The user's sidebar link opens a styled Route Builder with schema-shaped mock data.
2. Owner/admin/dispatcher can use it; workers opening the URL see the established access-denied state.
3. Add/remove/reorder/search/crew/date/reset work locally with the invariants above; refresh restores the fixture.
4. No network calls, persistent store mutation, assignment of real jobs, or misleading save/publish/optimize success.
5. Empty and filtered-empty states are useful; desktop and narrow layouts are legible.
6. Stories exercise the user interactions and invariants, and design documentation includes running-app screenshots.

## Commits

1. `Document Route Builder template plan` (main agent): approved plan, pushed with draft PR.
2. `Add mock Route Builder page` (implementer): UI, typed fixtures, route, generated tree, user's existing nav/type additions, and meaningful stories.
3. `Record Route Builder design and verification` (implementer/main agent, one writer at a time): UI record, screenshots, user decisions, verification and review verdicts, plan status.

After approval fetch origin/main, inspect branch/worktree status, and safely carry the two known user edits into an isolated feature checkout based on fresh origin/main. Do not overwrite, discard or commit unrelated work. If fresh main materially contradicts these verified contracts, stop and revise the plan. Follow the workflow's implementer worktree, draft PR, push, review and gated merge process. Subagents get role instructions from `.claude/agents/`; this environment has no `subagent_type` parameter, so dispatch fresh sessions with the matching role file and no model override.

## Unhappy paths

- Empty search/date/draft: dedicated guidance, no fake loading or remote errors for synchronous fixtures.
- Duplicate clicks/assignment: functional state updates reject an already assigned visit; no duplicate stops across drafts.
- Crew/date switching: preserve separate local drafts; never silently transfer visits between crews or dates.
- Missing optional property/window fields: readable fallback; unknown references do not crash the page.
- Worker direct navigation: existing access-denied UI and no rendered builder content. This demo UI gate introduces no server authorization claim.
- Parallel browser sessions: independent prototypes; refresh intentionally discards edits and the demo notice explains this.
- Tooling/auth/network failures: report exact blockers and do not claim successful verification or merge without evidence.

## Out of scope

Live data, backend APIs, database changes, persistence, publication, route optimization, geocoding, road directions, calendar integration, real assignment, crew roster editing, and changing existing Jobs route tools.

## Dependencies not to add

No new packages, map SDK, drag/drop library, or optimizer dependency.

## Verify command

```bash
pnpm generate-routes && pnpm build && pnpm exec tsc --noEmit && pnpm lint && pnpm check && pnpm exec vitest run
```

## Verification

- Stories: populated, empty, filtered-empty and mobile viewport; play tests for add/remove, reorder, duplicate exclusion across crews, crew/date selection, and reset.
- Run the exact verify command and workflow Definition-of-done checks. Record baseline failures separately; do not merge with failing required checks.
- Verify running `pnpm dev` app signed in with seeded credentials without exposing secrets. Check role-denied behavior and desktop 1440×900 plus phone 390×844 at device scale factor 2. Capture screenshots to the design record.
- Procedure/tenant/database tests and advisors are N/A: no procedures, schema or live database data access.
- Fresh reviewer and security agent must pass the whole diff. Check git status after read-only agents. Record verdicts and complete PR checklist; merge only through the repository's fresh-head gates.

## Audit log

- User approved the audited plan in chat on 2026-10-29: “Approved”.

### Round 1 (`plan-auditor`): pass, confidence high

- **Blocking / non-blocking / unresolved / pre-existing**: none.
- **Checked clean**: request and fixed user decisions; workflow and template coverage; design documentation and screenshot requirements; PageShell role denial; database visit assignment, crew/date uniqueness and sequences; generated Tables types and verify scripts; existing styling references; empty/date/search/duplicate/reorder/reset/mobile paths.
- Fresh read-only agent `/root/plan_auditor` returned the required JSON verdict. Main agent checked git status afterward: only the two disclosed user edits and this uncommitted plan.

## Scope-change log

- Verification order corrected during implementation: TanStack Router CLI generation removes the Start-specific type registration that the Start Vite plugin regenerates during build. Run the existing build before TypeScript so the generated route tree includes that registration. No generator configuration or generated files are edited manually; feature scope is unchanged.

## Implementation verification

- Worktree verification on 2026-10-29: `pnpm generate-routes && pnpm build && pnpm exec tsc --noEmit && pnpm lint && pnpm check && pnpm exec vitest run` passes generation, build, TypeScript, ESLint, and Prettier, then stops at the full Vitest suite: 10 files failed / 18 passed; 5 tests failed / 160 passed.
- Seven existing suites cannot import without `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`: clients, client mutations, crews, crew mutations, services, Calendar stories, and SeasonBar stories. The isolated implementation worktree intentionally has no `.env.local`; final verification loads environment only in the main checkout.
- Five assertions outside this feature fail: QuoteEditor Draft Editing expects a callback object without the current frequency/season fields; RequestsPanel Filters And Read Only Details expects two description values but gets one; CrewBuilder Drag To Crew and Drag To Unassigned record no callback; CrewBuilder Set Lead resolves its label to the crown SVG instead of the select. These tests and implementations were not changed.
- `pnpm exec vitest run src/components/route-builder/RouteBuilder.stories.tsx --reporter=verbose`: **8 passed**, 1 file passed. Covers populated, add/remove/reorder, crew/date drafts, search/reset, all assigned, empty date, filtered empty, and mobile stories. Existing Nitro/CommonJS runner messages appear in stderr without failing these tests.
- Running-app screenshots, role-denied verification, review verdicts, and environment-loaded full-suite verification remain with the main agent before merge.
