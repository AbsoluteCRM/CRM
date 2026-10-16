# Plan: Read live requests in the Requests tab

- **Slug / branch**: `requests-tab-live-read` / `feat/requests-tab-live-read`
- **Tier**: full (feature workflow; authenticated route, organization-scoped data,
  UI and design record)
- **Status**: approved
- **Confidence**: 97%. The requested read-only scope, replacement of demo
  requests, active-organization context, and existing procedures are confirmed
  by the user or verified in the repository.
- **Plan-mode file**: unavailable; this environment has no native plan mode.

## Original request

> The request flow is down so we will now read the requests for an organization into the requests tab

## Goal

Make `/_authed/requests` display requests returned by the existing
organization-scoped `requests.list` procedure for the active organization,
instead of demo-store requests. Keep the existing list filters and search,
provide a read-only details view, and render explicit loading, empty, and error
states. Creating requests and changing their status remain out of scope.

## Decisions

| # | Question | Answer |
| - | -------- | ------ |
| Q1 | Which operations should use live data? | Read-only list and detail; defer create and status actions. |
| Q2 | Should demo requests remain visible? | No. Replace them with database rows for the active organization. |

Agent defaults (minor; the user may veto them):

- **D1**: Preserve the existing Requests page layout, stage/status filters,
  search, and visual language where compatible with read-only data.
- **D2**: Keep the current organization context as the source of the active
  organization ID; the server procedure remains responsible for verifying
  membership, permission, RLS, and organization scoping.

## Open questions

- None.

## Assumptions

| Assumption | User-confirmed? |
| ---------- | --------------- |
| `requests.list` is the source of truth for rows shown in the tab. | yes |
| Existing schema and server procedure are sufficient; no migration or
  procedure changes are needed. | verified in repo |
| Service names can be resolved from the existing organization-scoped
  `services.list` procedure. | verified in repo |

## Design refs

- Mock: current `src/routes/_authed/requests.tsx` page.
- Screens: extend `docs/requests/ui.md` with the internal Requests screen and
  its live-data states.

## Layers touched

- [ ] Migration
- [ ] RLS policies / pgTAP tests
- [ ] `docs/database`
- [ ] Types
- [ ] Middleware
- [ ] tRPC procedures
- [x] Routes / loaders
- [x] UI components
- [x] Stories
- [x] Tests (interactive Storybook story)
- [ ] Sentry
- [x] Design record (`docs/requests/ui.md`, implemented-screen shots)

Security-gated paths touched: `src/routes/_authed/requests.tsx`.

## Changes

### Schema

- None. The requests schema, RLS, and generated types already exist.

### Middleware

- None. Use the active organization from `useOrganization()` and the
  authenticated request context already used by `requests.list`.

### Procedures

- No procedure changes. Call `requests.list` with the active
  `organizationId`; its existing `manageRequests` permission check and
  organization filter remain in force.
- Call `services.list` for the active organization to display service names
  for request rows without relying on demo service data.

### Routes and UI

| Route | Screen | States (loading, empty, error, populated) |
| ----- | ------ | ----------------------------------------- |
| `/_authed/requests` | Live Requests list and read-only details | Loading, organization-context error, no active organization, query error with retry, empty, filtered-empty, populated list and detail |

- Replace `useTenant().requests` as the list/detail data source with
  organization-keyed tRPC queries. Extract a presentational Requests panel
  that accepts request rows and service labels as props, so its Storybook
  interaction test does not need auth or tRPC providers.
- Preserve search, status filters, counts, source labels, and submitted-time
  ordering using database row fields.
- Replace the demo workflow drawer with read-only request details showing
  contact, address, service, notes, source, submission time, and status.
- Remove the demo-only create action from this screen so it cannot create rows
  that are absent from the real list. Do not expose status mutation actions.
- Gate the page using
  `useOrganization().permissions.includes('manageRequests')` before rendering
  request states or enabling either query; workers continue to see the
  existing no-access state without issuing a forbidden request.
- Key the Requests panel by the active organization ID so changing
  organizations clears the selected detail and local filters while the
  organization-keyed queries load the new organization's data.
- Show loading while organization context or required queries are loading. If
  organization context fails, show its error with a page-reload action (the
  context currently exposes no retry method); if loading completes without an
  active organization, show an explicit no-organization state. Show an error
  with a retry action if either data query fails. Show an empty state when
  there are no database rows and a distinct filtered-empty state when filters
  exclude all rows.

### Acceptance criteria

1. The page requests rows for the current active organization and never mixes
   in demo requests.
2. Changing active organizations refreshes the displayed rows and service
   names to that organization's data.
3. The list retains name/address/service search, status filters, counts, source,
   and submitted date presentation.
4. Selecting a row opens a read-only detail view populated from the database
   record; it offers no create, quote, schedule, convert, or status mutation
   action.
5. Loading, query error/retry, empty, and filtered-empty states are visible and
   do not silently fall back to demo data.
6. Users without `manageRequests` retain the no-access behavior, and the
   existing server permission and organization-scope checks are unchanged.
7. An interactive Storybook story verifies that filtering and opening/closing
   request details work with representative live-row-shaped fixtures, without
   requiring auth or tRPC providers.
8. Switching the active organization changes the request and service query
    keys, clears the selected detail, and displays only the newly active
    organization's results.
9. A user without `manageRequests` sees the no-access state and causes neither
    data query to run.

## Commits

1. `Read organization requests in the Requests tab` (implementer): connect
   active-org queries, gate access, extract the read-only Requests panel,
   replace mock list/detail behavior, add loading/error/empty states, and add
   the requests panel story.
2. `Document the live Requests screen` (implementer): update the Requests
   design record and capture the verified screen states.

## Unhappy paths

- Active organization not yet available: keep queries disabled and show a
  loading state; do not query a demo organization.
- Organization context fails to load: show the context error and an explicit
  page-reload action instead of leaving the screen in a permanent loading
  state.
- Organization context finishes without an active organization: show an
  explicit no-organization state and keep data queries disabled.
- Requests or services query fails: show an error and retry control; do not
  show success-shaped demo data.
- A request references a service that is no longer returned: show a neutral
  fallback label rather than failing the whole list.
- No matching requests: distinguish no organization data from a search/filter
  result with no matches.
- Unauthorized role: preserve the no-access state; server authorization
  remains authoritative.

## Out of scope

- Creating internal requests, submitting quotes, scheduling jobs, converting
  leads, or changing request status.
- Schema, RLS, tRPC procedure, organization-context, or service-page changes.
- Replacing mock data on any page other than Requests.

## Dependencies not to add

- No new packages.

## Verify command

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

- Run the exact verify command on the PR head.
- Run the Requests Storybook interaction test and verify list, details, and
  error/empty behavior in the running app against an authenticated organization.
- Verify in the running app as a worker that the no-access state appears and
  neither the requests nor services query is issued.
- Reviewer and security agent must pass before merge.

## Audit log

### Round 1 (general-purpose fallback; custom `plan-auditor` unavailable):
needs-changes, confidence high

| # | Blocking finding (recurring?) | Resolution (fixed / rejected: reason / escalated) |
| - | ----------------------------- | ------------------------------------------------- |
| 1 | Organization context failure could leave the page loading forever (no) | Fixed: add explicit context-error/reload and no-active-organization states. |

- **Non-blocking**: added active-organization-switch verification; marked the
  Storybook layer as touched.
- **Unresolved**: none.
- **Pre-existing**: none.

### Round 2 (general-purpose fallback; custom `plan-auditor` unavailable):
pass, confidence high

| # | Blocking finding (recurring?) | Resolution (fixed / rejected: reason / escalated) |
| - | ----------------------------- | ------------------------------------------------- |

- **Non-blocking**: explicitly gate requests by the organization-context
  `manageRequests` permission before rendering/loading data; clear selection on
  organization switch; extract a presentational panel so its story can use
  props without auth/tRPC providers. All adopted in this revision.
- **Unresolved**: none.
- **Pre-existing**: `useOrganization()` exposes no retry method, so an
  organization-context error uses a page reload action.

### Round 3 (general-purpose fallback; custom `plan-auditor` unavailable):
pass, confidence high

| # | Blocking finding (recurring?) | Resolution (fixed / rejected: reason / escalated) |
| - | ----------------------------- | ------------------------------------------------- |

- **Non-blocking**: added explicit running-app verification that a worker sees
  no-access and triggers neither data query.
- **Unresolved**: none.
- **Pre-existing**: none.

## Scope-change log

_None._
