# Plan: Organization context lookup

- **Slug / branch**: `organization-context` / `feat/organization-context`
- **Tier**: full, because the provider handles tenancy.
- **Status**: implemented (local; PR publication and merge blocked)
- **Confidence**: 95%; membership schema, provider consumers, and capability rules are verified in the repository; selection and permission behavior are user-confirmed.
- **Plan-mode file**: this file; native plan mode is unavailable.

## Original request

> Please implement the code as described by the comment on /home/nicko/code/CRM/src/integrations/organization/context.tsx:31
>
> The comment is:
> replace with a real lookup of the user's current organization + permissions.
>
> Replace the comment with your implementation.
> Optimize for speed. Don't over-explore or over-check your work other than what is absolutely necessary to implement the comment.
> Once you are done, remove the comment.

> Additionally, a user can be a member of many organizations. So it should store an array of all orgs and their permissions. And only one can be active

## Goal

Replace the placeholder with a browser Supabase lookup of every active membership belonging to the authenticated user, including its organization and derived permissions. Expose one active organization and a validated switching function, persisting the selection per user across reloads.

## Decisions

| #   | Question                          | Answer                                                                                |
| --- | --------------------------------- | ------------------------------------------------------------------------------------- |
| Q1  | Initial selection and persistence | Default to the earliest active membership; remember switches per user across reloads. |
| Q2  | Permission vocabulary             | Use the existing `can` capability rules and names.                                    |
| Q3  | Multi-organization support        | Store all organizations and their permissions, with only one active.                  |

Agent defaults (minor; the user may veto them):

- Keep existing `organization`, `permissions`, and `isLoading` fields compatible; add `organizations`, `setActiveOrganization(id)`, and `error`.
- Keep inactive and invited memberships out of the selectable list, consistent with database authorization rules.
- Read localStorage only on the client; treat blocked storage as an in-memory selection.

## Open questions

None. Approval of this audited plan is still required before code edits.

## Assumptions

| Assumption                                                                                | User-confirmed?                                                              |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Earliest active membership is the fallback when a stored selection is missing or invalid. | yes                                                                          |
| Capability names and rules follow the existing demo store's `can` object.                 | yes                                                                          |
| Selection persistence is browser-local and scoped to the authenticated user.              | yes, faithful interpretation of remembering switches per user across reloads |

## Design refs

None; this change exposes provider state and does not add screens.

## Layers touched

- [x] Middleware (organization context)
- [x] Tests (focused provider behavior verification)

Security-gated path: `src/integrations/organization/context.tsx`.
Schema, migrations, database docs, generated types, procedures, routes, screens, stories, Sentry, and design records are not changed because the existing schema supports this lookup.

## Changes

### Organization provider

- Extend organization entries with membership role and permissions.
- Fetch `organization_members` filtered by authenticated `user_id` and `status = active`, embedding `organizations(id, name)` with the existing foreign key. Order by `created_at`, then membership `id`, for deterministic earliest membership selection.
- Use the existing browser Supabase client and RLS; never use privileged credentials or user metadata as authorization inputs.
- Extract the existing `can` capability object into a small shared organization permission module and re-export it from the CRM store, avoiding a circular dependency between provider and store while keeping every current consumer compatible.
- Compute each entry's permissions from its database membership role using the shared rules. Unknown roles or malformed rows must fail closed rather than grant capabilities.
- Expose `organizations`, plus existing `organization` and `permissions` derived from one validated active ID, `isLoading`, `error`, and `setActiveOrganization(id)`.
- On lookup completion, use a valid saved organization ID for this user, otherwise the earliest returned membership. Persist valid switches under a user-scoped localStorage key. Ignore invalid switch IDs.
- While authentication or lookup is pending, expose loading and no previous account's organizations or permissions. Signed-out users have empty state. Guard asynchronous responses against cleanup and user changes so late responses cannot restore stale data. Depend on user ID, not incidental auth user object identity.
- On request failure, expose an error with empty organizations and permissions and stop loading. Catch promise rejections. Storage failures must not break the lookup or switching.
- Remove the requested TODO and the obsolete organization-shape TODO once the concrete shape is implemented.

### Acceptance criteria

1. All active organizations for the authenticated user load with their own role-derived permissions; invited and disabled memberships are excluded.
2. Exactly one returned organization is active whenever the list is nonempty; empty membership lists have no active organization.
3. Switching updates organization and permissions together and survives reloads for that user; another user cannot inherit the selection.
4. Invalid or inaccessible saved IDs fall back to earliest membership; invalid switch requests cannot select a non-member organization.
5. Sign-out, account changes, and stale async results cannot expose previous-user context.
6. Lookup and localStorage failures settle safely; loading covers auth initialization and membership lookup.
7. Existing store imports of `can` and provider consumers continue working.

## Commits

1. `Document organization context implementation plan` (main agent): approved plan.
2. `Load organization memberships and persist active selection` (implementer): provider and shared capability rules.

## Unhappy paths

- Empty list: null active organization and no permissions.
- Query error or rejection: error state, empty memberships, loading false.
- Deleted, disabled, or invalid stored selection: select earliest available active membership.
- Blocked localStorage: use memory without throwing.
- Account change or unmount during lookup: ignore stale results and hide old account state immediately.
- Unknown role or malformed embedded organization: fail closed.

## Out of scope

New UI, server tenancy middleware, changing the demo store's data source or role simulation, changing RLS, real-time permission updates, cross-browser selection synchronization, and database writes.

## Dependencies not to add

No new runtime or test dependencies.

## Verify command

```sh
pnpm exec tsc --noEmit
pnpm exec eslint src/integrations/organization/context.tsx src/integrations/organization/permissions.ts src/components/crm/store.ts
pnpm exec prettier --check src/integrations/organization/context.tsx src/integrations/organization/permissions.ts src/components/crm/store.ts docs/plans/organization-context.md
```

## Verification

- Focused executable verification of membership mapping, per-role capability results, selection restoration and switching, user-change isolation, failed lookup, and blocked storage, using available tooling without introducing a new test framework.
- Reviewer and security audit the final diff before any merge, as required by the workflow.
- Database/procedure tests, visible UI stories, screenshots, and database advisors are N/A because this change adds no procedures, schema, or screens.
- A remote verification query, if available, is read-only and constrained to the authenticated user's memberships; credentials must not be printed.
- Record any unavailable verification and pre-existing failures explicitly; do not claim a passing merge gate without evidence.

## Audit log

User approved the audited plan on October 7, 2026.

### Round 1 (`plan-auditor`): pass, confidence high

- **Blocking**: none.
- **Non-blocking**: changed-file checks do not replace repository-wide lint/formatting and signed-in app verification before merge. Adopted as applicable workflow gates; unavailable checks block merge.
- **Unresolved**: none.
- **Pre-existing**: none identified.
- **Checked clean**: request coverage, template sections, schema and RLS compatibility, provider and consumer contracts, permission-module cycle avoidance, unknown-role denial, persistence, account isolation, and failure handling.

## Scope-change log

### Corrective lookup fix

The user reported empty context with a generic error. A read-only live request reproduced `PGRST201`: multiple relationships connect memberships and organizations. The lookup now specifies `organization_members_organization_id_fkey` and preserves plain-object Supabase error messages. This corrects the approved lookup without changing its behavior or authorization scope.

- TypeScript and focused ESLint passed.
- The corrected anonymous request resolves the relationship and reaches expected table permission denial; authenticated loading awaits user confirmation. No grants or database writes were made.
- Fresh reviewer and security verdicts both passed with high confidence and no blocking findings. Live signed-in verification remains a merge gate.
- Existing user edits in the provider were preserved; the correction is left uncommitted.

No behavior changes. The user denied `git push`, so implementation and review continued locally without publishing a PR. Freshly fetched main includes generated database types; the implementation uses them.

## Implementation verification

- Exact plan commands passed in the main checkout: TypeScript, changed-file ESLint, and changed-file Prettier.
- Mounted-provider verification passed in Chromium using temporary harness `/tmp/verify-organization-context.mjs`: all roles, membership filters/order, malformed rows, auth loading, switching and reload persistence, invalid IDs, per-user isolation, same-ID rerenders, stale responses, query errors and rejection, empty results, blocked storage, and sign-out during lookup.
- Baseline repository formatting passed. Baseline repository lint failed at unrelated `src/components/ui/button/button.tsx:2:15` (`import/consistent-type-specifier-style`); left unchanged.
- Signed-in remote lookup could not be verified: local environment lacks `VITE_SUPABASE_PUBLISHABLE_KEY` and test-user credentials. No database writes were performed.
- PR creation and merge remain blocked by denied push permission and the verification limitations above.

### Review (`reviewer`): pass, confidence high

- No blocking findings or unresolved questions.
- Checked request coverage, query/RLS compatibility, role validation, preserved capability rules, persistence, account isolation, errors, and Chromium harness assertions.
- Non-blocking alias-import convention note recorded; neighboring code uses relative imports and no runtime failure was identified.
- Pre-existing lint failure recorded above.

### Review (`security`): pass, confidence high

- No security findings.
- Checked membership filters and RLS policies, publishable browser client, foreign key and uniqueness constraints, selection validation, unknown-role denial, account isolation, and absence of privileged credentials or new server paths.
- Live signed-in verification remains unavailable, as recorded above. This pass does not authorize merge without the remaining workflow gates.
