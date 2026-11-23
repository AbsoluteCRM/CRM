# Plan: Invite a team member

- **Slug / branch**: `invite-team-member` / `feat/team-members` (continuing the existing branch/PR #28)
- **Tier**: full (touches an RLS-gated tenancy table and `src/routes/**`, a security-gated path, across two layers: data + UI)
- **Status**: implemented (plan-auditor passed round 3; email and acceptance later added by `invite-email-acceptance`)
- **Confidence**: ~97%; every material choice rests on a user answer or a verified repo fact (RLS policy, grants, `accept_invitation`'s hashing, the `toast()` tones, both `OrgRole` definitions, the default DELETE grant). The remaining uncertainty is the as-yet-unbuilt `/accept-invite` destination page, which is explicitly out of scope.

## Original request

> I want to route an invite team member route in teams.ts

## Goal

An owner or admin on the Team page can invite someone by email and role. Submitting the existing "Invite a team member" modal creates a real `organization_invitations` row (enforced by existing RLS: owner/admin only), and the modal then shows a copyable invite link built from a client-generated token. No email is sent and no `/accept-invite` destination page exists yet — both are deferred to a later PR. If an invite is already pending for that email (not yet accepted, whether or not it has expired), the mutation resends it: it replaces the pending row's token and expiry and returns a fresh link, rather than only erroring.

## Decisions

| #   | Question                                                               | Answer (user's words or a faithful summary)                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Branch/PR scope                                                        | Keep adding to the current `feat/team-members` branch/PR, rather than a new branch                                                                                                                                                      |
| Q2  | Data-access mechanism                                                  | Direct Supabase browser client in `teams.ts`, matching `useTeamMembers()`'s existing pattern; no tRPC (tRPC's `protectedProcedure`/org context only exists on the separate, unmerged `origin/feature/trpc-auth`)                        |
| Q3  | Email delivery                                                         | Out of scope. Create the invitation row only; show a copyable invite link to the admin. No email provider is integrated in this PR                                                                                                      |
| Q4  | Link destination                                                       | Out of scope. Generate the link text/URL only; the `/accept-invite` page that reads it is a separate, later PR                                                                                                                          |
| Q5  | UI wiring                                                              | Wire end to end: update the existing `InviteModal` in `routes/_authed/teams.tsx` to call the real mutation (replacing the mock `actions.inviteMember`), show the link, and surface insert errors                                        |
| Q6  | "Name" field in the modal                                              | Drop it. `organization_invitations` has no name column; the invitee's own profile name is used when they accept (`accept_invitation`'s `coalesce(nullif(trim(p.full_name), ''), u.email)`), so a name entered here would never be saved |
| Q7  | Invite button gated by a role a real worker also has                   | Map the RLS rejection to a friendly message only ("You don't have permission to invite team members."). Leave the button's visibility (`editable = can.manageTeam(t.role)`, reading the mock tenant) as-is — pre-existing, out of scope |
| Q8  | Re-inviting an email with an already-pending (possibly expired) invite | Resend: on a `23505` conflict, update the existing pending row's `token_hash`, `expires_at` and `role` (allowed by the existing update grant) instead of only erroring, and return a fresh link                                         |

Agent defaults (minor; the user may veto them):

- **D1**: Invite link is `${window.location.origin}/accept-invite?token=<token>`. The page at that path doesn't exist yet (Q4); the link is inert until a later PR builds it.
- **D2**: Token is 32 random bytes from `crypto.getRandomValues`, hex-encoded as the plaintext token; hashed client-side with `crypto.subtle.digest('SHA-256', …)`, hex-encoded, to exactly match `encode(extensions.digest(p_token,'sha256'),'hex')` used by `accept_invitation` in [20261007221518_review_fixes.sql](/home/nicko/code/CRM/supabase/migrations/20261007221518_review_fixes.sql).
- **D3**: Role choices stay `admin` / `dispatcher` / `worker` (unchanged from the current modal); `owner` is excluded both by the table's `role <> 'owner'` check and by never being offered.
- **D4**: A Postgres `23505` (unique violation) on the partial unique index `organization_invitations_pending_email_idx` triggers the resend path (Q8): update the existing pending row (`organization_id`, `email`, `accepted_at is null`) with the new `token_hash`, `expires_at` (now + 7 days) and `role`, then return its fresh link. If that update affects zero rows (the pending row was accepted/removed in the interim — an unlikely race), throw "Could not resend the invite; try again." A Postgres `42501` (insufficient privilege — RLS rejected the insert, e.g. a dispatcher/worker somehow reaches the form, per Q7) is caught and shown as "You don't have permission to invite team members." Any other error shows `error.message` via the existing `toast(..., 'warning')` (there is no `'error'` tone).
- **D5**: No query invalidation after a successful invite — `organization_members` (what `useTeamMembers()` reads) isn't touched until the invite is accepted.
- **D6**: New hook is named `useInviteTeamMember()`, mirroring `useTeamMembers()`'s naming, returning a `useMutation` whose `mutateAsync({ email, role })` resolves to `{ inviteLink: string; resent: boolean }`.
- **D7**: The hook imports `OrgRole` from `#/integrations/organization/permissions` (the real DB-backed type) rather than the mock `#/components/crm/types` one that `InviteModal` currently uses.
- **D8**: On success, the hook attempts `navigator.clipboard.writeText(inviteLink)` but the modal's toast/copy never claims the clipboard write itself succeeded (it only confirms the invite/link is ready), since that write can silently fail (D on clipboard permissions).

## Open questions

- None.

## Assumptions

| Assumption                                                                                                                                                                                                                                                                                 | User-confirmed?                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Inviting an email that already belongs to an active `organization_members` row isn't specifically blocked at the app layer (no DB constraint catches it either); it's left as a known gap, not handled in this PR                                                                          | no — not asked; flagged as an unhappy-path note below instead of a question, since it doesn't change any decision above |
| The "Invite member" button's existing visibility gate (`can.manageTeam(t.role)` from the mock tenant store, which defaults every signed-in user to `'owner'`) is untouched; the mutation itself enforces real authorization via RLS, with the 42501 case mapped to a friendly message (Q7) | yes (Q7)                                                                                                                |

## Design refs

- Mock: none, built without a mock (the modal already exists; only its submit behaviour and a new success state change)
- Screens: `docs/team/ui.md` — add an "Invite a team member" section

## Layers touched

- [ ] Migration (`supabase/migrations/…`) — table and RLS already exist; no change
- [ ] RLS policies / pgTAP tests — unchanged; existing "Owners and admins manage invitations" policy already covers this insert
- [x] `docs/database` (tables, ERD, ADR) — one sentence added to `tenancy.md` documenting how invitations get created
- [ ] Types (`pnpm db:types`) — schema unchanged
- [ ] Middleware (auth, org scope, `ctx.supabase`)
- [ ] tRPC procedures — explicitly not used (Q2)
- [x] Routes / loaders
- [x] UI components
- [ ] Stories — `InviteModal` is inline in the route file, not a separate story-covered component; no story exists for `teams.tsx` today (`MembersTab` has one, `InviteModal` doesn't)
- [ ] Tests — no unit-test project exists beyond Storybook interaction tests, and `InviteModal` has none to extend
- [ ] Sentry — this is a client mutation, not a `createServerFn` handler; nothing to wrap
- [x] Design record (`docs/team/ui.md`, shots, `docs/design/decisions.md`)

Security-gated paths touched (see the workflow's Agents section): `src/routes/_authed/teams.tsx`. The `security` agent gates this merge.

## Changes

### Schema

None. `organization_invitations` and its RLS policy already exist and already allow exactly this insert.

### Middleware

None.

### Procedures

No tRPC procedure. Instead, a client-side mutation hook:

| Hook                                                                                          | Input                                                | Output                                    | Enforced by                                                                                                 |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `useInviteTeamMember()` (in [teams.ts](/home/nicko/code/CRM/src/integrations/teams/teams.ts)) | `{ email: string; role: Exclude<OrgRole, 'owner'> }` | `{ inviteLink: string; resent: boolean }` | RLS: "Owners and admins manage invitations" (insert/update restricted to `owner`/`admin` of the active org) |

Implementation: reads the active `organization.id` from `useOrganization()`; generates the token and hash (D2); normalizes the email once (`const email = input.email.trim().toLowerCase()`) and reuses that value for both calls below. Tries to insert `{ organization_id, email, role, token_hash }` into `organization_invitations` via `createSupabaseBrowserClient()`. On `23505`, instead updates the existing pending row (`.update({ role, token_hash, expires_at }).eq('organization_id', organizationId).eq('email', email).is('accepted_at', null).select('id')`, so the response row count is observable) and returns `{ inviteLink, resent: true }`, or throws "Could not resend the invite; try again." if that update matches zero rows (D4/Q8 — an unlikely race where the pending row was accepted or removed between the insert attempt and the update). On `42501` from the insert throws a friendly "no permission" `Error` (Q7/D4) — this is the only place `42501` can occur, since a non-admin's `WITH CHECK` fails on the insert itself, before the unique index is ever touched; the resend's `update` is filtered by the same policy's `USING` clause, which for a non-admin simply matches zero rows (not an error), so it reuses the same "could not resend" message rather than needing its own `42501` handling. Any other error rethrows the Postgres error message. On success (insert or update) returns `{ inviteLink: `${window.location.origin}/accept-invite?token=${token}`, resent }`.

### Documentation

- `docs/team/ui.md`: add the "Invite a team member" screen section (Route/Roles/Layout/States/Interactions/Data/Origin/Code, per `docs/design/README.md`'s format).
- `docs/design/decisions.md`: append two dated entries — (1) Q3/Q4/Q8: ship the invite as a create-or-resend-and-show-a-link flow, no email send and no acceptance page yet; (2) Q6: drop the modal's Name field since it's never persisted. Both point to `docs/team/ui.md`.
- `docs/database/tables/tenancy.md`: one sentence under `organization_invitations` documenting that rows are created by a direct client insert (owner/admin, via RLS), with the token generated and hashed client-side and only the hash stored; also fix the existing `token_hash` row's wording ("SHA-256 of the emailed token") since no email is sent.

### Routes and UI

| Route    | Screen                                 | States (loading, empty, error, populated)                                                                                                                                                                    |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/teams` | `InviteModal` (overlay, Team list tab) | form (email + role, Name field removed) → submitting (submit disabled) → success (read-only link field + Copy button + Done; copy differs slightly when `resent`) → error (toast, form stays open for retry) |

`InviteModal` changes in [teams.tsx](/home/nicko/code/CRM/src/routes/_authed/teams.tsx):

- Remove the `name` state and its `Field`; move `autoFocus` to the Email input.
- Replace the `OrgRole` import source with `#/integrations/organization/permissions` (D7).
- Replace the modal's `subtitle` — "They'll get an email to join this company's workspace." claims an email is sent, which contradicts Q3 — with copy that doesn't promise one, e.g. "Create an invite link to share with them." The success state's own copy (below) states the link must be shared manually.
- Rename the submit button from "Send invite" (with the `Mail` icon) to "Create invite link" (swap to a `Link` icon import from `lucide-react`), since no email is sent.
- Replace the footer's `onClick` (currently `actions.inviteMember(...)`, which also fires `toast(`Invitation sent to ${email}`)` — also contradicts Q3) with `useInviteTeamMember().mutateAsync({ email, role })`.
- On success: `navigator.clipboard.writeText(inviteLink)` (best-effort; ignore a rejected promise — D8), `toast(resent ? `New invite link ready for ${email}`:`Invite link ready for ${email}`)` (not "copied", since the clipboard write may have silently failed), and switch the modal body to the success state showing the link with copy "Share this link with them to join — it's not emailed automatically." plus a visible Copy button for a manual retry.
- On error: `toast(message, 'warning')` (D4's mapped message for `42501`/the resend-failure case, or the raw Postgres message otherwise), keep the form open.

### Acceptance criteria

1. An owner/admin fills in email + role and clicks "Create invite link": a row appears in `organization_invitations` (verified via Supabase), and the modal shows a copyable link containing a token.
2. Submitting the same email again while the first invite is still pending (not yet accepted — whether or not it has expired) updates that same row with a new token and expiry and shows a fresh link, rather than erroring — verified by checking the row's `id` is unchanged but `token_hash`/`expires_at` differ, and the old token no longer hashes to the stored value.
3. The emitted link's token, when hashed with `encode(digest(token,'sha256'),'hex')`, matches the stored `token_hash` (spot-checked against the DB in verification, confirming `accept_invitation` will accept it later).
4. The "Name" field no longer appears in the modal, and no copy in the modal (subtitle, success state, toasts, button label) claims an email was sent.
5. A dispatcher/worker who reaches the form (pre-existing gate, Q7) and submits sees "You don't have permission to invite team members." rather than a raw Postgres error.
6. `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm check` and `pnpm exec vitest run` all pass.

## Commits

1. `Invite team members from the active organization` (implementer, worktree cut from `feat/team-members`): `teams.ts` mutation hook + `teams.tsx` `InviteModal` wiring + `docs/team/ui.md` + `docs/design/decisions.md` + `docs/database/tables/tenancy.md` sentence.
2. `Add teams invite screenshots` (main agent, after pulling the implementer's push — screenshot capture needs a running dev server and browser tools the isolated worktree doesn't have): shots captured from the running app, added to `docs/team/shots/` and embedded in `docs/team/ui.md`.

## Unhappy paths

- **Duplicate pending invite** (same org + email, not yet accepted, expired or not): Postgres `23505` on the insert → the hook resends instead (Q8/D4): updates the existing row's `token_hash`/`expires_at`/`role` and returns a fresh link. Only if that update itself matches zero rows (the row was accepted or removed in the interim) does the hook throw "Could not resend the invite; try again."
- **No active organization**: the hook throws before querying if `organization.id` is undefined.
- **A dispatcher/worker reaches the form**: the "Invite member" button's visibility gate reads the mock tenant store, which defaults every signed-in user's role to `'owner'` (pre-existing, out of scope per Q7), so in practice anyone can open the modal and submit regardless of their real role. RLS rejects the insert itself with `42501` (the `WITH CHECK` on "Owners and admins manage invitations" fails before the unique index is ever touched), which the hook maps to "You don't have permission to invite team members." (D4/Q7) instead of a raw Postgres message. A non-admin's resend `update` is unreachable through this path (the insert fails first), but if it were reached it would match zero rows under the same policy's `USING` clause rather than erroring.
- **Clipboard write fails** (e.g. permissions, insecure context): the link is still shown and selectable/copyable manually in the success state; the toast wording never claims the copy succeeded, only that the link/invite is ready (D8).
- **Invitee email already belongs to an active member**: not blocked (see Assumptions); the invite is created (an accepted row doesn't count toward the partial "pending" unique index, so this never hits the resend path), and `accept_invitation` would later fail with "you are already a member of this organization" if they try to accept it. Noted as a known gap, not fixed here.

## Out of scope

- Sending the invite email (no provider integrated).
- The `/accept-invite` destination page and calling `accept_invitation(token)`.
- Listing or revoking pending invitations through any UI control. (`organization_invitations` does grant DELETE to `authenticated`, filtered by the same owner/admin RLS policy, so a row can already be deleted directly against the API/Studio — this PR just adds no UI entry point for it. Resending via the same email, per Q8, is the only path this PR's UI exposes for invalidating a stale link.)
- Blocking invites to emails that already belong to an active member.
- Any change to the "Invite member" button's visibility gating (`can.manageTeam`), which still reads the mock tenant store.

## Dependencies not to add

- No email-sending package (Resend, SendGrid, nodemailer, etc.) — explicitly deferred.

## Verify command

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

The Definition of done from the workflow, plus:

- Manually invite a member in the running app; confirm the row in `organization_invitations` via Supabase and that the copied link's token hashes to the stored `token_hash`.
- Confirm the resend path by inviting the same email twice: the second call updates the same row with a new token/expiry rather than erroring.
- Desktop (1440×900) shots of the form and success states, added to `docs/team/shots/` and embedded in `docs/team/ui.md`.

## Audit log

### Round 1 (`plan-auditor`): needs-changes, confidence high

| #   | Blocking finding (recurring?)                                                                                                                                              | Resolution (fixed / rejected: reason / escalated)                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Unhappy-paths/Assumptions claimed a non-admin can't reach the Invite button; false, since the gate reads the mock tenant's role, which defaults everyone to `'owner'` (no) | Escalated to the user (Q7); fixed by mapping the RLS `42501` rejection to a friendly message (D4), while leaving the pre-existing gate itself out of scope |
| 2   | Modal subtitle and the old success toast both claimed an email is sent, contradicting Q3 (no)                                                                              | Fixed: subtitle and success copy reworded to not promise an email; `Routes and UI` / `Changes` sections updated                                            |
| 3   | No `docs/design/decisions.md` entry for the Q3/Q4 and Q6 design decisions, required by the workflow's Definition of done (no)                                              | Fixed: added a `Documentation` subsection and a commit-1 line covering two new dated entries in `decisions.md`                                             |

- **Non-blocking**: phone shots are only added if the modal turns out to have a distinct phone layout.
- **Acted on**: switched the code commit from "main agent" to the dispatched `implementer` agent, matching the standard Phase-4 process rather than deviating from it; screenshot capture stays with the main agent since it needs a running dev server and browser tools the isolated worktree doesn't have.
- **Unresolved**: none.
- **Pre-existing**: the Invite button's visibility gate uses the mock tenant role (defaults to `'owner'` for every user) — noted, not fixed, per Q7.

### Round 2 (`plan-auditor`): needs-changes, confidence high

| #   | Blocking finding (recurring?)                                                                                                                                                                                                                                       | Resolution (fixed / rejected: reason / escalated)                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The Unhappy-paths claim that waiting out `expires_at` lets the admin re-invite was false: the partial unique index only checks `accepted_at is null`, not `expires_at`, so an expired-but-unaccepted row blocks re-inviting indefinitely with no recovery path (no) | Escalated to the user (Q8); fixed by adding a resend-on-conflict: `23505` now triggers an `update` of the existing pending row's `token_hash`/`expires_at`/`role` instead of only erroring. `Procedures`, `Routes and UI`, `Acceptance criteria`, `Unhappy paths` and `Out of scope` all updated |

- **Non-blocking, acted on anyway**: reworded the success toast so it no longer claims the clipboard write itself succeeded (D8); renamed the submit button from "Send invite"/`Mail` icon to "Create invite link"/`Link` icon since no email is sent; moved `autoFocus` from the removed Name field to the Email input; fixed `tenancy.md`'s pre-existing "SHA-256 of the emailed token" wording in the same sentence this plan already touches.
- **Non-blocking, not acted on**: a third `decisions.md` entry for Q7's error-copy choice — left out, since `decisions.md` is for screen/design decisions and Q7's error message is already covered by `docs/team/ui.md`'s States section for this screen.
- **Unresolved**: none.
- **Pre-existing**: same as round 1. (Round 2 additionally claimed the table had no delete grant at all; that was wrong — `authenticated` keeps the default schema-wide DELETE grant per `foundation.sql`, filtered by the same owner/admin RLS policy, so a row is already deletable directly against the API/Studio. Corrected in Out of scope; this PR just doesn't add a UI control for it.)

### Round 3 (`plan-auditor`): pass, confidence high

No blocking findings. Non-blocking items (all acted on, since they were cheap and correctness-affecting):

| #   | Non-blocking observation                                                                                                                                                                                  | Resolution                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The insert normalizes the email (`.trim().toLowerCase()`) but the resend's `.eq('email', email)` could use the raw input if the implementer isn't careful, breaking the resend match for mixed-case input | Implementation text now specifies a single normalized `email` variable reused by both the insert and the resend update                                  |
| 2   | "Zero rows matched" on the resend update isn't observable without `.select()`                                                                                                                             | Implementation text now specifies `.select('id')` on the update                                                                                         |
| 3   | The claim that RLS rejects "the resend's update" with `42501` was inaccurate — a non-admin never reaches the update, because the insert's `WITH CHECK` fails first                                        | Unhappy paths and Procedures reworded to say the `update` path is unreachable for a non-admin, and would match zero rows (not error) if it were reached |
| 4   | "No delete grant/revoke path" was wrong — `authenticated` keeps the default DELETE grant, filtered by the same RLS policy                                                                                 | Out of scope and the round-2 pre-existing note both corrected                                                                                           |

Not acted on: a third `decisions.md` entry for Q7's error copy (judged unnecessary — that state belongs in `docs/team/ui.md`'s States section, not the cross-feature decisions log), and documenting that `invited_by` stays the original inviter after a resend (minor, doesn't change behavior or any acceptance criterion).

## Scope-change log

Round 2: added the resend-on-conflict mutation behaviour (Q8) in response to a blocking auditor finding that the originally planned "wait for expiry" recovery path does not work. This is additive to Q3 (still no email, still just a link) and does not change any other decision.
