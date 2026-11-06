# Plan: Resolve main merge conflicts

- **Slug / branch**: `resolve-main-merge` / existing `features/natalies-stuff`
- **Tier**: full, conflicts span UI, backend and database documentation.
- **Status**: implemented
- **Confidence**: 95%; both merge parents and 31 unmerged paths verified.

## Original request

> Help me resolve the merge conflicts from merging main into this feature branch

## Goal

Resolve the existing merge in place, preserving feature-branch behavior and main's improvements, and leave the resolutions staged for user review. Do not commit, push, create a PR, or merge a PR as part of this repair.

## Decisions

- User approved this plan in chat: "approve".

- Existing merge and branch are the work context; preserve unrelated staged changes.
- Retain feature settings, portal, quote-email and time-off behavior alongside main's service areas, maps, live permissions and mock-store relocation.
- This is merge repair, with no new product design or schema changes.

## Open questions

- None on intended scope. Escalate any incompatible behavior discovered during detailed resolution.

## Assumptions

- Preserve behavior from both parents unless superseded by a verified main refactor (agent default, not separately user-confirmed).

## Design refs

Existing feature records apply; no new screens or design decisions.

## Layers touched

Existing conflicted components, routes, tRPC procedures/tests, settings integration, environment declarations, lockfile, database docs and generated types. Security-gated paths include tRPC, routes, env, types and rls.md.

## Changes

- Compare stages 2 and 3 and relevant callers for each unmerged path; reconcile imports and preserve both behaviors.
- Use main's live role/permission model and relocated mocks where the old mock-store imports were removed.
- Combine distinct router registrations, environment variables, documentation and test cases.
- Remove duplicate package declarations introduced by the automatic merge; regenerate the lockfile from the resolved manifest.
- Regenerate database.ts with pnpm db:types after checking migration parity using available Supabase access. Never hand-merge it. If access or parity cannot be verified, report this blocker and leave that file unmerged.
- Format only resolved files and necessary adjacent corrections; stage individually after validation.

### Acceptance criteria

All safely resolvable paths are reconciled; no conflict markers remain in resolved files; preserved features typecheck and relevant tests pass. Report any external blockers or existing failures precisely. Full success requires zero unmerged paths.

## Commits

None requested. Leave the existing merge pending with reviewed resolutions staged. This repair uses the existing checkout rather than a new implementation worktree because the merge state is already here.

## Unhappy paths

- Incompatible requirements: ask the user before choosing a behavior.
- Missing database access: retain generated-type conflict and report; never invent remote schema state.
- Dependency/network restrictions: request required sandbox escalation.
- Failed checks: investigate resolution-related failures and distinguish pre-existing failures using parent versions where practical.

## Out of scope

New features, remote database writes, deployment, commits, pushing, PR creation and PR merge.

## Dependencies not to add

No new dependencies beyond those already present in either merge parent.

## Verify command

```sh
pnpm exec tsc --noEmit && pnpm lint && pnpm check && pnpm exec vitest run
```

Also inspect git diff --check and git diff --name-only --diff-filter=U. Run independent checks separately if an earlier failure prevents subsequent checks.

## Verification

All 31 conflicted paths resolved and staged. Canonical TypeScript, ESLint and full Prettier checks pass. Full Vitest run passes: 59 files, 552 tests (416 unit and 136 browser stories). Browser tests required sandbox escalation for localhost server access. Zero unmerged paths and clean staged/worktree whitespace checks. Main lockfile retained with frozen dependency installation verified.

Supabase OAuth refreshed successfully using codex mcp login supabase. Read-only MCP list_migrations confirmed migration drift: local-only create_service_region_function, create_service_regions, quote_client_on_approval, team_availability; remote-only convert_legacy_service_regions, quote_conversation, rename_legacy_service_regions, time_off_day_off_and_clear; service_areas version differs (local 20261102180000, remote 20261103030208). No database writes. Regeneration was paused under the approved plan. User authorized combining current and incoming declarations: "Can we just merge both current and incoming safely?" The sole conflict contains distinct cancel_time_off and create_service_region declarations; retain both without changing the remote database. This is a narrow exception to the generated-type merge rule.

Run the checks above, inspect preserved backend tests and stories, and request fresh read-only reviewer and security review of the resolution diff. Database migration tests and new UI screenshots are not applicable because this repair adds no schema or UI behavior. Report browser or external-service limitations.

## Audit log

### Round 1 (`plan-auditor`): pass, confidence high

- No blocking findings or unresolved questions.
- Checked all 31 unmerged paths, repository workflow, conflicting backend/settings behavior, database rules, scripts and design-record scope.
- Adopted: explicitly verify quote-recipient output, both router registration sets, service-area settings and live permissions.
- If type regeneration is blocked, report the repair as incomplete.
- Pre-existing findings: none.

## Scope-change log

User authorized the narrow generated-types exception described in Verification. Preserve both existing declarations instead of regenerating from a drifted remote schema. No database writes or new type signatures.

### Final review

- Initial reviewer: pass, medium confidence, no blocking findings; five targeted suites independently passed (89 tests).
- Initial security: pass, medium confidence, no findings.
- Fresh reviewer after type exception: pass, medium confidence, no blocking findings or unresolved questions; compared both parents and verified both type signatures, router union, live permissions, client APIs, quote delivery, CAPTCHA, settings and imports.
- Fresh security: pass, medium confidence, no findings or unresolved questions. Confirmed tenancy, scoped mutations, CAPTCHA, quote token boundaries, server-only secrets and preserved type declarations. Noted pre-existing properties.list uses protectedProcedure plus caller organization filter under RLS; unchanged by repair.
