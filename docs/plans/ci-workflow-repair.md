# Plan: Repair branch CI workflows

- **Slug / branch**: `ci-workflow-repair` / existing `feature/map-region-assignments`, PR #96
- **Tier**: full after verification exposed a legacy UI/API conflict with merged service-area code.
- **Status**: implemented
- **Confidence**: 95%; failures reproduced, existing editor and schema verified, user selected the existing service-area model.
- **Plan-mode file**: this file; native plan mode unavailable.

## Original request

> I need this branch to pass both of the github workflow tests
>
> CI / Storybook interactions tests
>
> and
>
> CI Typecheck, lint, format, unit tests

## Decisions

| Question                              | Answer                                                        |
| ------------------------------------- | ------------------------------------------------------------- |
| Initial repair and verification plan? | User: “Yes approved”.                                         |
| Region/area schema conflict?          | User: “Align with existing service-area model (Recommended)”. |

## Open questions

None for implementation. GitHub results remain the acceptance gate.

## Assumptions

| Assumption                                                                         | User-confirmed?               |
| ---------------------------------------------------------------------------------- | ----------------------------- |
| Repair the current branch and existing PR rather than create a replacement branch. | Yes, requested “this branch”. |
| Retain crew assignment through the existing service-area editor.                   | Yes, selected existing model. |

## Goal

Make both named GitHub checks pass without weakening assertions or bypassing checks.

## Changes

- Lockfile: remove duplicate mappings and regenerate missing records with pnpm 10, preserving versions; prove frozen install succeeds.
- Settings: restore public request-area markup from main. Keep `ServiceAreasSection`; remove the duplicate legacy Leaflet map and its unused `regions` router registration/module. Existing `serviceAreas` APIs remain canonical. Remove the unused legacy map module so TypeScript no longer compiles its invalid column query.
- Onboarding: remove unnecessary optional chaining after the existing RPC error guard; apply Prettier.
- Map geometry: validate OpenLayers output using the existing Polygon/MultiPolygon schemas before returning `AreaGeometry`; do not cast away errors.
- Stories: reproduce map selection failure; fix readiness or map ownership if demonstrated, retaining the selection assertion. Rerun all interactions.
- Documentation: record this plan and the existing editor as the sole crew-assignment UI in `docs/service-areas/ui.md`.

## Layers touched

UI, routes, API registration, stories, dependency lockfile. Security-gated: `src/routes/**`, `src/integrations/trpc/**`. No migrations, generated types, grants or remote writes. Design reference: existing `docs/service-areas/ui.md`; restore its documented layout.

## Acceptance criteria

1. pnpm 10 frozen install succeeds.
2. Both GitHub jobs pass on the pushed PR head.
3. Existing editor still provides drawing, selection and crew assignment; public request labels/removal remain intact.
4. Reviewer and security reviews pass; unrelated screenshot materialization stays untouched.

## Commits

1. `Repair CI checks and use the existing service-area editor`: plan, verified fixes and design record in the existing PR. Main agent performs local implementation and verification in the current checkout to preserve its working state.

## Unhappy paths

- Malformed or non-polygon map output returns null; existing callers omit invalid drafts.
- Missing dependencies/browser: install locked dependencies and Chromium; do not skip tests.
- Material further scope changes require renewed audit and user approval.
- No tenant writes are necessary for verification; unit tests and stories use existing fixtures.

## Out of scope

Database reconciliation, migration changes, dependency upgrades, new map/editor features, merging the feature PR.

## Dependencies not to add

No new dependencies.

## Verify command

```sh
pnpm install --frozen-lockfile && pnpm exec tsc --noEmit && pnpm lint && pnpm check && pnpm exec vitest run --project unit && pnpm exec vitest run --project storybook
```

Use pnpm 10 as CI does; Chromium must be installed. Local host has Node 25, GitHub verifies Node 22.

## Verification

- Initial: frozen install failed duplicate YAML mappings; after repair install passes. Unit: 24 files, 355 tests pass.
- Formatting and lint pass after targeted fixes.
- Browser: 19 files, 98 interactions pass after resolving each story’s own map by its canvas target with a WeakMap; the selected-feature assertion is unchanged.
- Typecheck passes. Invalid legacy `service_regions.crew_id` read removed with the obsolete module; OpenLayers output validated with existing polygon schemas. Final unit run: 24 files, 355 tests pass. Lint and formatting pass.
- Run `pnpm dev`, sign in using the seeded E2E credentials from `.env.local` without exposing them, open Settings / Hours & service areas, verify the retained editor and public request controls, and capture the implemented screen to `docs/service-areas/shots/settings-ci-repair-desktop.png`. Update its design record. Existing editor stories exercise drawing, selection and crew assignment. Schema and new-procedure tests are N/A because no schema or procedure is added.
- Signed-in running-app verification passed: canonical editor, public request controls, zero legacy Leaflet maps and zero alerts. Captured the Settings screenshot at 1440×900, device scale 2. No tenant writes.

## Audit log

- Initial light-tier plan: auditor pass; user approved.
- Initial repair review: pass, medium confidence, verification still pending. Voided by subsequent fixes; fresh review required.
- Revised audit round 1: needs-changes. Fixed missing signed-in running-app verification and Settings screenshot in the Verification section; re-audit round 2 passed with high confidence. User selected alignment with the existing model after the initial plan approval.
- Final reviewer: pass, high confidence. Checked the entire repair diff, retained canonical editor/API, geometry validation and unchanged selection assertion.
- Final security: pass, high confidence. Verified canonical active-org/permission boundaries remain intact, removed API exposure, no secrets/schema/grant changes.

## Scope-change log

Verification exposed a merged schema conflict: cities are service regions, crew assignments belong to service areas. User selected alignment with the existing model. Expanded plan removes the duplicate legacy UI/API and retains the documented service-area editor, without database changes.

### GitHub follow-up

First push exposed a nullable OpenLayers map target in the new story helper.
Added a null guard before storing its WeakMap entry. The prior local typecheck
ran before that helper edit; final verification now runs after all source edits.
Fresh reviewer and security both passed with high confidence over the whole repair.
Corrected verification: TypeScript, ESLint and Prettier pass; all 43 test files
and 453 tests pass. The first GitHub Storybook job passed; both jobs must pass
on the corrected push before the task is complete.
