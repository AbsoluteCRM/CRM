# Team UI

The Team page (`/teams`) has four tabs. Only **Team list** reads real data: `organization_members` for the active organization, all statuses (disabled members show a "Disabled" badge). It shows name, role, status and contact (email, phone). Crew builder, availability and performance still use the mock store.

## Invite a team member

**Route**: overlay on `/teams` (Team list tab), opened by the Invite member button.

**Roles**: Owners and admins can create invites; RLS ("Owners and admins manage invitations") enforces it. The button's visibility still reads the mock tenant role, which defaults every signed-in user to owner, so a dispatcher or worker can open the form; their submit is rejected and shows "You don't have permission to invite team members."

**Layout**: A modal titled "Invite a team member" with the subtitle "Create an invite link to share with them." The form has an Email field (focused on open) and a Role picker (Admin, Dispatcher, Worker; Owner is never offered). The footer has Cancel and a "Create invite link" button. There is no Name field: invitations have no name column, and the invitee's own profile name is used when they accept.

**States**:

- Form: the submit button is disabled until the email looks valid.
- Submitting: the submit button is disabled.
- Success: the body shows a read-only invite link with a Copy button and the copy "Share this link with them to join — it's not emailed automatically." The footer is a single Done button. When an earlier pending invite was replaced, the copy says a new link replaced it.
- Error: a warning toast with the message (a friendly one for a permission failure); the form stays open for retry.

**Interactions**:

- Create invite link inserts an `organization_invitations` row. If an invite is already pending for that email (expired or not), it instead replaces that row's token, expiry and role and returns a fresh link.
- The link is copied to the clipboard on a best-effort basis. The toast only says the link is ready, because the clipboard write can fail silently; Copy retries manually.
- The link is `/accept-invite?token=…`. That page doesn't exist yet, so the link is inert for now.

**Data**: Direct Supabase browser-client insert (and update on resend) via `useInviteTeamMember()`; no tRPC procedure. The token is generated and SHA-256 hashed client-side; only the hash is stored. No email is sent.

**Origin**: Built without a mock; the modal already existed with mock behaviour.

**Code**: `InviteModal` in `src/routes/_authed/teams.tsx`; `useInviteTeamMember()` in `src/integrations/teams/teams.ts`.
