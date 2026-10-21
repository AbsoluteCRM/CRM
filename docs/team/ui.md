# Team UI

The Team page (`/teams`) has four tabs. Team list and crews read real data for the active organization; availability and performance still use the mock store.

## Send invitation

**Route**: overlay on `/teams`, opened by Invite member. Its visibility uses the actual active organization role. Owners and admins can send; authenticated tRPC authorization and RLS enforce access.

The modal has Email and Admin / Dispatcher / Worker role choices, Cancel, and Send invitation. Sending disables duplicate submits. A warning explains that sending again replaces any pending link; only the latest generated link remains valid. Owner is never offered.

**States**:

- Form: Send invitation is enabled for a plausible email; the server validates and normalizes it.
- Sending: button reads Sending… and is disabled.
- Sent: the provider accepted the email for sending; the UI asks the inviter to check the recipient inbox, without claiming inbox delivery. A read-only link and Copy provide a fallback.
- Unconfirmed/failed: the invitation was saved, but sending could not be confirmed (including timeout). Copy the link or Retry with new link. Retry explicitly rotates the token and warns that earlier links stop working, including if another send fails.
- Write, permission, or configuration error: warning toast, form retained. No email is attempted before a successful authorized write and configuration validation.

`useInviteTeamMember` calls `teams.invite`. Tokens are generated on the server; only hashes are stored. The email identifies the team, role, seven-day expiry and fixed-origin secure acceptance link.

## Accept invitation

**Route**: public `/accept-invite?token=…`, outside the authenticated layout. It exposes no invitation metadata before authentication. Missing or malformed tokens show a request-new-invitation message.

**States**:

- Loading account.
- Sign in / Create an account instead: inline email/password form asks the user to use the invited email. Authentication alone never creates membership.
- Confirmation required: Check your email instructions retain the original invitation URL. After confirming, sign in and explicitly accept.
- Authenticated: current email, Accept invitation, and Use another account (signs out while retaining the token).
- Accepting: duplicate clicks disabled.
- Invalid, expired, rotated, used or mismatched email: safe combined error with account-switch and request-new-invite recovery.
- Already a member: explanation and Open dashboard link; no role mutation.
- Joined successfully but opening failed: Retry opening team reloads/selects the accepted organization and navigates, without calling acceptance again.

Success reloads memberships, selects the accepted team, invalidates caches, and opens `/dashboard`, including when the recipient previously had no memberships or belongs to other teams. Reload guards account switches and sign-out races.

## Confirmation callback

**Route**: `/auth/callback?token=…&code=…`. The Supabase singleton browser client automatically exchanges the PKCE code during initialization; the page awaits that session and returns only to a locally constructed acceptance path with a validated token. It never accepts arbitrary return URLs or invitations.

Missing, denied or expired codes and cross-browser/no-verifier attempts show recovery instructions: sign in in the original browser, then reopen the original invitation. Both public invitation routes return `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, include no-referrer/noindex metadata, and use no third-party content. Server telemetry redacts token/code query values and token-like hashes.

## Deployment configuration

Set private server environment variables `RESEND_API_KEY`, `RESEND_FROM_EMAIL=requests@terraformaflow.com`, and `SERVER_URL=https://terraformaflow.com`. Verify the sender domain in Resend and grant this key permission to send from it. Locally use `SERVER_URL=http://localhost:3000`. HTTP is accepted only for localhost outside production. Credentials, paths, queries and fragments are rejected in the configured origin.

Node startup loads `.env.local` then `.env` without overriding already supplied deployment values, in development and production. Browser exposure remains restricted to `VITE_` variables. Production hosting may inject the three server variables directly; never use a VITE prefix for secrets. Blank placeholders are in `.env.example`.

In Supabase Auth URL Configuration, set the production Site URL to `https://terraformaflow.com` and add Redirect URLs that allow these fixed callback paths with the invitation query:

- `https://terraformaflow.com/auth/callback?token=*`
- `http://localhost:3000/auth/callback?token=*` for local testing.

Keep the Supabase confirmation template's confirmation link based on `{{ .ConfirmationURL }}` so the signup `emailRedirectTo` survives the confirmation redirect. Supabase sends account-confirmation messages; Resend here sends only team invitations. Confirmation requires the same browser's PKCE verifier; another-browser recipients can sign in and reopen their original invitation.

At implementation verification, the remote project had `site_url=http://localhost:3000`, an empty redirect allowlist and email confirmation enabled. Those remote settings were inspected, not changed. Configure the callback allowlist before real confirmation verification. Verify actual invitation delivery only to an explicitly approved test inbox; provider acknowledgement alone does not prove delivery. Live inbox/confirmation verification remains outstanding without that inbox and redirect configuration.

**Design origin**: existing Team modal and auth form styles, without a separate mock. Implemented screenshots are recorded by the running-app verification in this PR.

**Code**: Teams `InviteModal`, `InvitationAcceptance` with interaction stories, `/accept-invite`, `/auth/callback`, `teams.invite`, and `teams.acceptInvite`.

## Implemented screens and verification

Captured locally on 2026-10-21 in the running app with dedicated test organizations and accounts. Invite-link fields are masked. These files remain uncommitted: Git LFS is missing, and its installation was declined. Screenshot delivery is an outstanding workflow check.

| State                     | Screenshot                                           |
| ------------------------- | ---------------------------------------------------- |
| Send invitation           | `shots/invite-email-form.png` (local only)           |
| Provider accepted         | `shots/invite-email-sent.png` (local only)           |
| Sending failed            | `shots/invite-email-failed.png` (local only)         |
| Sign in or create account | `shots/accept-invite-sign-in.png` (local only)       |
| Explicit acceptance       | `shots/accept-invite-review.png` (local only)        |
| Invalid or reused link    | `shots/accept-invite-invalid.png` (local only)       |
| Confirmation required     | `shots/accept-invite-confirm-email.png` (local only) |

Running-app checks passed for wrong-account rejection, no membership before the explicit Accept click, existing-user acceptance, active-team selection for a multi-org user, replay rejection, malformed links, provider-failure fallback, and new-account acceptance. Signup's confirmation-required response and subsequent confirmation were simulated for the dedicated new account; a real confirmation-email callback is not claimed verified. Separate live database checks rejected cross-tenant writes and expired/rotated/reused tokens, then accepted the current token.

The real Resend API accepted a team invitation from the configured sender to its documented `delivered+crm-invite-test@resend.dev` test mailbox. This verifies API/sender acceptance, not delivery to a personal inbox. All other browser-test email calls were intercepted locally. The invitation response returned `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
