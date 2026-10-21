# Plan: Email team invitations and accept after authentication

- **Slug / branch**: `invite-email-acceptance` / `feat/invite-email-acceptance`
- **Tier**: full; server email delivery, authentication, and UI.
- **Status**: approved
- **Confidence**: 96%; material product choices are user-confirmed, and existing invite and organization contracts were read. Provider configuration remains an operational verification, not a product assumption.
- **Plan-mode file**: this file; this client has no native plan mode. Only this uncommitted plan changes before approval.

## Original request

> I would like to continue building out the invite worker route. In teams.tsx we can invite the worker and the back end is wired up. I now have a resend API key in the .env file that we can use for routing emails to the invited worker. That email should provide a secure link for the user to accept an invite. If they do not have an account they should be prompted to create on before being added to the team.

## Goal

Owners/admins email a secure invitation from Teams. Recipients sign in or create an account, then explicitly accept before membership is created. Successful acceptance opens the invited organization.

## Decisions

| #   | Question   | Answer                                                                                                                           |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Sender     | User: `requests@terraformaflow.com`.                                                                                             |
| Q2  | Origin     | User: `terraformaflow.com`; development `localhost:3000`. Use HTTPS in production and HTTP for local development.                |
| Q3  | Acceptance | User approved seven-day expiry, existing role picker, matching invited email, explicit Accept invitation, and opening that team. |

Agent defaults (minor; user may veto):

- **D1**: Retain copyable links as a fallback. Retry sends a newly generated link and warns that the earlier link stops working, matching current resend semantics.
- **D2**: Use native server fetch for Resend; no SDK or template framework needed. Plain text plus escaped HTML identify the organization, role, expiry, and acceptance link.
- **D3**: Offer signup/sign-in directly on the acceptance page, using the existing auth context. This keeps the invitation in the URL without altering unrelated sign-in/signup behavior.
- **D4**: Do not automatically test-send to arbitrary people. Verify actual delivery only to a user-specified or dedicated test inbox; otherwise report that live delivery verification remains outstanding.

## Open questions

None for planning. Verify Resend domain permission and Supabase redirect configuration during implementation. If unavailable, document the precise deployment setup and do not claim live delivery or confirmation was verified.

## Assumptions

| Assumption                                                                     | User-confirmed?                             |
| ------------------------------------------------------------------------------ | ------------------------------------------- |
| Sender domain and localhost/production origins are intended                    | yes                                         |
| Seven-day expiry, role picker, email-bound authentication, explicit acceptance | yes                                         |
| Native fetch, retained copy fallback, inline auth forms                        | no; minor defaults, reviewable in this plan |

## Design refs

- Mock: none. Use existing Team modal and auth form styles; a sketch is optional if the user wants to supply one.
- Screens: update `docs/team/ui.md` for invite form, delivery result/failure, acceptance, auth, confirmation, and success; capture implemented screens in `docs/team/shots/` and append decisions to `docs/design/decisions.md`.

## Layers touched

- No migrations, RLS changes, or regenerated database types: reuse `accept_invitation` and invitation grants.
- Server: new `src/server/invitations.ts` email helper; `src/integrations/trpc/teams.ts` procedures, router registration.
- Auth/org: extend signup result/options for confirmation awareness; add safe organization reload/select capability.
- Routes/UI: Teams modal, public `/accept-invite`, auth callback, presentational invitation component and stories.
- Tests, Sentry spans with no token/email payload logging, env documentation, design record, tenancy documentation.
- Security gate: `src/server/**`, `src/integrations/trpc/**`, `src/integrations/auth/**`, `src/integrations/organization/**`, `src/routes/**`, `src/env.ts`, `.env.example`.

## Changes

### Schema and documentation

Reuse invitation rows and RPC without schema modifications. `docs/database/tables/tenancy.md` will describe server-generated emailed tokens and existing acceptance behavior instead of client-only generation. No SQL is authored; schema checks/types/advisors are not applicable.

Verified: current acceptance RPC locks an unaccepted, unexpired hash match, requires `auth.uid()`, matches auth.users email, inserts/links membership, and consumes the invite in one transaction. It protects owner rows and rejects existing members. Invitation RLS permits owner/admin writes only.

### Middleware and configuration

Reuse `requireOrgPermission('manageTeam')` and `protectedProcedure`; no service-role client for invitation writes or acceptance. Use `ctx.supabase` and the verified organization ID.

Add optional server config `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and use existing `SERVER_URL`. Validate all three before creating/rotating invitations; require HTTPS except explicit localhost development. Never derive email link origin from request headers or browser input. Resolve private `.env`/`.env.local` variables into server `process.env` consistently in dev and production; Vite's browser env exposure must remain VITE-only. Add blank secret placeholders and documented sender/origin examples to `.env.example`, removing the accidentally populated Resend value without changing unrelated user edits. Never print secrets. Add production configuration instructions and Supabase Auth redirect allowlist entries for both callback origins.

### Procedures

| Procedure                     | Input                                                                                      | Output                                            | Allowed                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------ |
| `teams.invite` mutation       | organizationId UUID, trimmed normalized validated email, role enum admin/dispatcher/worker | inviteLink, resent, delivery (`sent` or `failed`) | verified owner/admin                                   |
| `teams.acceptInvite` mutation | 64 lowercase hexadecimal token                                                             | organizationId                                    | authenticated recipient; RPC checks email and validity |

`teams.invite`: generate 32 random bytes server-side, hex encode, SHA-256 hash, seven-day expiry. Insert invitation through user client. Only a pending-email unique conflict triggers rotation: update pending org/email row's hash/role/expiry with `.select('id')`, and require exactly one result. No send after a database failure. Read organization name with user client scoped to verified org. Use fixed configured sender/recipient derived from validated input, never arbitrary client-supplied message bodies or URLs. Escape all HTML dynamic content. POST to Resend with a bounded timeout and per-token hash idempotency key, no raw token in key. Return sent only when Resend acknowledges an email ID; sanitize provider failures and return failed plus copyable link for database-success/email-failure. No inbox-delivery guarantee or persisted delivery state is claimed. Catch network timeouts; a timed-out send may have been accepted, so UI says unable to confirm sending. Retry explicitly rotates and invalidates previous link. Disable duplicate submits. Concurrent resends retain existing latest-write-wins semantics; warn that only the latest generated link remains valid. No rollback to old tokens after provider failure.

`teams.acceptInvite`: do not require existing org membership. Call existing RPC with caller credentials; translate invalid/expired/mismatched, already-member, auth, and transient errors to safe UI messages. Return only accepted organization ID. Do not accept on GET, route prefetch, effect, signup, or sign-in. The explicit button triggers this mutation.

### Routes and UI

| Route                    | Screen and states                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/teams`                 | Existing invite modal becomes Send invitation; sending disabled; confirmed send, uncertain/failed send with copy link and Retry, permission/write errors. Use actual organization role for invite action visibility.                                                                                                                           |
| `/accept-invite?token=…` | Public route outside `_authed`; validate token syntax without throwing route-level crashes. Missing/malformed, loading auth, sign-in/signup choice, submitting, confirmation required, authenticated Accept button, accepting, invalid/expired/mismatched link, already-member, success/navigation error. No invitation data exposed publicly. |
| `/auth/callback`         | Exchange PKCE code using Supabase client; accept only validated invite token as destination context, construct local acceptance path internally. Handle denied/missing/expired code. Never accept arbitrary return URLs.                                                                                                                       |

Inline auth form instructs using invited email; do not publicly disclose invitation email or whether an account exists. Signup uses optional `emailRedirectTo` built from current allowed app origin and fixed callback path plus validated invite token. Extend auth signup to expose whether a session exists; preserve old callers' behavior. If confirmation is enabled, show check-email instructions and retain invitation URL; callback exchanges code and returns to acceptance. Cross-browser/no-verifier recovery: explain sign-in in original browser or sign in then reopen original invitation. Supabase default confirmation email remains Supabase-managed; Resend integration here sends team invitations only. Verify redirect allowlist and confirmation template respect redirectTo; document setup instead of silently changing remote Auth settings.

On explicit acceptance success, reload organization memberships, select returned org, invalidate relevant query caches, and navigate to `/dashboard`. Reload/select must await the new list and guard against user change/sign-out races; existing `setActiveOrganization` cannot select an unloaded org. If reload/navigation fails after RPC success, show Joined successfully with Retry opening team; never retry acceptance to recover navigation. Handle account switch by signing out while retaining the token.

Invitation routes use no-referrer and no-store responses; prevent external resource links/referrers from carrying tokens. Do not put token values in Sentry span attributes or error messages. Avoid third-party content on acceptance/auth screens. Inspect existing telemetry integration for query-string capture and redact invite tokens at that boundary if needed.

### Acceptance criteria

1. Owner/admin in active org can email admin/dispatcher/worker invites; other roles, portal-only users, and nonmembers cannot send or mutate invites. Multi-org caller uses only selected org.
2. Email comes from configured sender with fixed configured origin, safe template, seven-day link. Only hash persists; secrets stay server-only.
3. Existing user signs in with matching email then explicitly accepts; new user signs up and completes any required confirmation before explicit acceptance. Neither is added before acceptance.
4. Invalid, expired, rotated, reused, or wrong-email tokens do not create membership. Email scanners and GET requests never accept.
5. Resend/write/config failures produce accurate, actionable states without false send claims. Retry rotation is explicit.
6. Accepted team becomes active even for a user with other teams or no previous memberships. Recovery after a successful write does not attempt membership creation again.

## Commits

1. `Document invitation email and acceptance plan` (main agent, after approval): fetch main, branch, commit approved plan, push and open draft PR.
2. `Send team invitations and accept through authenticated signup` (implementer, isolated worktree): server/email/procedures, UI/auth/org changes, tests/stories, env/docs. Push commits to same PR, one writer at a time.
3. `Record verified invitation screens and reviews` (main agent): running-app verification, screenshots, review verdicts, plan status.

## Unhappy paths

- Configuration failure: reject before rotating or creating invitation.
- DB unique race: pending row update count checked; zero rows asks retry. Other DB errors never trigger email.
- Concurrent resends: latest token wins; original and earlier links become invalid as today. UI explains newest invitation requirement.
- Resend failure/timeout after commit: preserve hash and offer fallback link/retry; never claim inbox delivery.
- Malformed/expired/reused/wrong-account invitation: safe explanation and sign-in/account-switch/request-new-invite actions; no row leak.
- Signup confirmation pending or callback missing verifier: keep original invite usable and offer recovery instructions; never add before authenticated acceptance.
- Already-member: explain already joined, offer normal dashboard access; do not modify role or make acceptance appear successful.
- Successful acceptance but org refresh failure: distinct joined state with retry opening team.
- Provider crash gap is not durable queue delivery; administrator can resend. No background job promised.

## Out of scope

Durable email outbox/worker, scheduling, delivery webhooks, tracking bounces, pending invitation management, global auth redesign, custom Supabase confirmation-email provider, worker dashboard redesign, SQL/RLS changes, revocation UI.

## Dependencies not to add

No Resend SDK, React Email framework, ORM, queue package, or new auth provider. Use existing native fetch, crypto, Supabase, tRPC, Zod, Vitest and Storybook.

## Verify command

```sh
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm build
```

## Verification

- Follow full Definition of done in `docs/process/feature-workflow.md`, copied into PR with accurate completed/remaining checks.
- Procedure tests follow existing `clients.mutations.test.ts` structure: roles owner/admin allowed; dispatcher/worker/portal/nonmember rejected; unauthenticated; cross-tenant; multi-org scoped writes; no provider calls before authorization/config/DB success.
- Meaningful tests: token entropy/hash/TTL contract, HTML escaping, fixed origin, provider success/error/timeout, pending rotation/write error, accept RPC validation/error mapping, no role/org supplied by recipient, no acceptance during render/auth.
- Interaction stories for invitation states and inline auth/accept/retry/account switch; mock provider and network. Confirm explicit click is required.
- Running app with dedicated test org and seeded E2E credentials; create fresh dedicated recipient fixtures via auth admin if needed, never change demo or real tenant users. Verify existing and new account acceptance, wrong-email/replay/expired rejection, active-org refresh, signup confirmation configuration. Restore/remove only fixtures created by this feature.
- Real email only to authorized dedicated test inbox. If none is available, mock provider and report live-send limitation rather than emailing real users.
- Verify production build has no Resend key in browser output and invitation tokens are redacted from telemetry. Record screenshots of implemented states.
- Fresh reviewer, then security review, read-only. All passes must be on final diff, log verdicts, fulfill merge gate, deliver one PR.

## Audit log

User approved this audited plan with “approve” on 2026-10-21.

### Round 1 (`plan-auditor`): pass, confidence high

- **Blocking**: none.
- **Non-blocking**: callback code exchange must happen exactly once, accounting for browser automatic session detection; acceptance response must project the returned membership's `organization_id`. Recorded as implementation reminders within the existing callback/response contracts.
- **Unresolved**: none.
- **Pre-existing**: CLAUDE.md describes unit tests and org middleware as missing, but both exist; this plan uses the verified code.
- **Checked clean**: request/decisions, repository workflow/template, auth/org extension points, tRPC authorization and scope, invite hashing/rotation, acceptance SQL transaction and email matching, environment isolation, email failure handling, confirmation recovery, telemetry controls, test/verification coverage, screenshots and review/PR gates.

### Verification compatibility repair

The first full run found a pre-existing Storybook 10.6.0 mismatch with the installed TanStack `interpolatePath` signature and Vitest 5. Existing and new stories failed before interaction execution. Updated the existing Storybook packages together to exact 10.6.1, whose upstream patch supports both APIs and Vitest 5; no new dependency or product behavior was added. The main agent approved this routine verification repair. Mechanical existing formatting issues and one type-only import were also corrected to satisfy the required lint/format gates.

### Review (`reviewer`, and `security` if gated)

Fresh reviewer returned **needs-changes**, confidence high, on implementation head `5ffe47e`. No additional feature correctness or security defect was found; 38 targeted invitation unit tests independently passed.

| #   | Blocking finding (recurring?)                                                                                                                                                                                                    | Resolution                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs/team/ui.md:65`: required implemented screenshots are absent from the PR (false). Evidence: documented local-only captures and untracked `docs/team/shots/`. Rule: design record and workflow require shots in the same PR. | Outstanding. Git LFS is unavailable, and its installation was declined. Captures remain locally available; no binary-policy bypass.                                                          |
| 2   | `docs/plans/invite-email-acceptance.md:175`: mandatory full verification gate fails (false). Evidence: 192/197 tests pass. Rule: exact verification command and full Vitest suite must pass before merge.                        | Outstanding. Five existing unrelated story failures were reproduced in main; no assertions weakened or tests skipped. Handed to implementer for assessment without silently expanding scope. |

- **Non-blocking**: real confirmation-email/PKCE completion remains unverified, as permitted by the plan's explicit setup limitation. Update plan status only after outstanding work is actually complete.
- **Unresolved**: none in feature code.
- **Pre-existing**: five failing QuoteEditor, RequestsPanel and CrewBuilder stories.
- **Checked clean**: request/decisions; role authorization and tenant scope; token entropy/hash/expiry/rotation; fixed sender/origin, template escaping and provider failure handling; caller-authenticated explicit acceptance; signup/PKCE callback and destination restriction; organization reload/race handling; response headers and telemetry redaction; tests, generated routes, dependency repair and documentation.
- **Security**: not dispatched; the workflow requires the reviewer to pass first.
- **Merge**: blocked; PR remains draft. This review is not a full completion claim.

## Scope-change log

_None._

## Implementation verification record (2026-10-21)

- Main checkout exact verify command, with `.env.local` loaded: lint and formatting pass; Vitest reports 192/197 passing. All 141 unit tests and all 14 new invitation interaction stories pass. Five existing story failures remain: QuoteEditor Draft Editing; RequestsPanel Filters And Read Only Details; CrewBuilder Drag To Crew, Drag To Unassigned, Set Lead. No assertions were weakened and none were skipped. Full merge gate is not satisfied.
- Typechecking and production build pass separately; the exact pipeline stops at Vitest.
- Running-app checks passed with dedicated remote fixtures: wrong account rejected; no membership before acceptance; existing user accepted and invited org selected despite another membership; reused/malformed links rejected; failed email has copy/retry fallback; new signup shows confirmation-required state before explicit acceptance. Signup response and confirmation were simulated without sending to an arbitrary inbox; real confirmation callback remains unverified until redirect configuration is completed.
- Actual Resend API accepted an invitation from `requests@terraformaflow.com` to its dedicated `delivered+crm-invite-test@resend.dev` test mailbox. Other provider requests were locally intercepted. No personal inbox was contacted. Sender/API acceptance does not prove inbox delivery.
- Live database checks on dedicated fixtures passed for cross-tenant write rejection and expired/rotated/reused token rejection, with successful current-token acceptance.
- Seven implemented screenshots captured locally under `docs/team/shots/`; displayed invite tokens are masked. They remain uncommitted because Git LFS is missing and installation was declined. Screenshot delivery remains outstanding. Response headers verified no-store/no-referrer.
- Remote Auth configuration was inspected, not changed: confirmation enabled, site URL localhost, redirect allowlist empty. Exact deployment steps are in `docs/team/ui.md`.
- Public-build scan checked 66 assets and found neither private server key. Removed the two dedicated test organizations and four dedicated auth users created by this feature after verification.

### User-requested presentation refinement

After confirming the email arrived in spam, the user requested: “Final step, style the accept page to match the styling of the rest of the application”. Applied the existing CRM logo, tokens, typography, and controls to the acceptance component, including loading, confirmation, error and joined states. This presentation refinement stays within the approved public acceptance UI scope; authentication, callback and backend behavior are unchanged. Existing missing-LFS screenshots and five unrelated failing story tests remain outstanding merge gates.
