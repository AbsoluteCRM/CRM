# Plan: Initial route authentication redirect

- **Slug / branch**: `initial-route` / `fix/initial-route`
- **Tier**: full, because routing depends on authentication state.
- **Status**: approved
- **Confidence**: 95%; the requested destinations and existing auth provider are verified.
- **Plan-mode file**: this file; native plan mode is unavailable.

## Original request

> I want to fix the initial route. If authed, a user should be routed to the dashboard. If not, they can go to the landing page as it currently is set up to do.

## Goal

Make `/` send authenticated users to `/dashboard` and continue displaying the existing landing page to guests.

## Decisions

| Question               | Answer                                                    |
| ---------------------- | --------------------------------------------------------- |
| Signed-in destination? | Dashboard, per the request; existing URL is `/dashboard`. |
| Guest destination?     | Existing landing page at `/`, per the request.            |

Agent defaults: reuse `useAuth`, `PageLoading`, and router `Navigate` with `replace`; wait for auth resolution before rendering either destination. Keep this change within the existing client auth architecture.

## Open questions

None. User approved the audited plan on 2026-11-04.

## Assumptions

| Assumption                                                             | User-confirmed?              |
| ---------------------------------------------------------------------- | ---------------------------- |
| Reusing the existing loading screen while auth resolves is acceptable. | Yes; approved with the plan. |

## Design refs

No mock needed: existing screens are reused. Record the initial route's loading/guest/redirect states in `docs/initial-route/ui.md`, with implemented screenshots captured during verification. Record the user's routing decision in `docs/design/decisions.md`.

## Layers touched

Routes and design record only. Security-gated path: `src/routes/index.tsx`.
Schema, database docs, middleware, procedures, types, Sentry, and new UI components/stories do not apply: none change.

## Changes

### Routes and UI

Replace `component: LandingPage` in `src/routes/index.tsx` with an index component that reads `useAuth()`. Render `PageLoading` while `isLoading`; once resolved render `<Navigate to="/dashboard" replace />` when authenticated, otherwise render `LandingPage`. Do not put this in `__root.tsx`, which wraps public token and auth routes too. Do not introduce server auth or expose auth through router context for this fix.

### Acceptance criteria

1. A signed-in user visiting or navigating to `/` arrives at `/dashboard` without seeing the landing page.
2. A guest visiting `/` sees the existing landing page once auth resolves.
3. Loading does not trigger premature navigation; auth state changes while on `/` are reflected.
4. Replacement navigation avoids leaving `/` as an extra history entry.
5. Public token routes and other existing routes retain their behavior.

## Commits

1. `Document initial route redirect plan` (main agent): approved plan; push and open draft PR from freshly fetched origin/main.
2. `Redirect authenticated visitors to the dashboard` (implementer): index component and design record, screenshots; push from isolated worktree.

## Unhappy paths

- While auth is unresolved, use the existing accessible loading screen.
- If auth resolves to no user (including expired session), show the landing page.
- Existing auth-provider failures remain governed by that provider; do not redesign it.
- Existing dashboard guard continues to handle a session lost during navigation.

## Out of scope

SSR auth, auth-provider changes, sign-in flow changes, dashboard redesign, database changes, and public token-route redirects.

## Dependencies not to add

No new dependencies.

## Verify command

```sh
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

Run the workflow Definition of done checks. Verify in the running app with Playwright: guest `/`, seeded test user sign-in then direct reload at `/`, client navigation to `/` while signed in, and public token route isolation. Capture loading and guest screenshots for the record. Check history replacement in the browser. No procedure/tenant tests or new component stories apply because no procedures or reusable UI components change. Obtain fresh reviewer and security passes on the entire diff before merging, following all workflow merge gates.

## Audit log

### Round 1 (`plan-auditor`): pass, confidence high

- **Blocking / non-blocking / unresolved / pre-existing**: none.
- **Checked clean**: requested destinations; loading-first auth handling; provider coverage; dashboard route and existing guard; accessible loading component; applicable workflow and template sections; verify commands; security review gate.
- Reviewer and security review pending implementation.

## Scope-change log

None.
