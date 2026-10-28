# Design decisions

Every user decision that shaped the design, dated, with its reason, newest
last.

- A decision here overrides issue text, older memory, and mocks where they
  disagree.
- To change one, add a new dated entry that supersedes it, naming the entry
  it replaces. Never edit an old entry's substance.
- Then update the `ui.md` sections the change touches.

"User" is the product owner. Product and data-model decisions belong in
[docs/database/decisions/](../database/decisions/README.md) or the feature's
plan instead.

| #   | Date       | Decision                                                                                                                                                          | Reason                                                                                                                                           | Where it lives                                             |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1   | 2026-10-07 | Style the Calendar with the current CRM brand system across week navigation, day tiles, route stops, and map states.                                              | Keep the Calendar visually consistent with the rest of the signed-in CRM while retaining its existing layout and behavior.                       | [Calendar UI](../calendar/ui.md)                           |
| 2   | 2026-10-08 | Invite a team member by creating (or resending) an invitation row and showing a copyable link. No email is sent and there is no accept-invite page yet.           | No email provider is integrated and the acceptance page is a later PR. Re-inviting a pending email replaces its token instead of only failing.   | [Invite a team member](../team/ui.md#invite-a-team-member) |
| 3   | 2026-10-08 | Drop the Name field from the invite modal.                                                                                                                        | `organization_invitations` has no name column; the invitee's profile name is used when they accept, so a name entered here would never be saved. | [Invite a team member](../team/ui.md#invite-a-team-member) |
| 4   | 2026-10-16 | The public request portal does not ask for a preferred frequency, and its service cards copy the internal Services page (season bar, duration, frequency badges). | Each service already defines its frequencies; matching the Services page keeps the public and internal views consistent.                         | [Request portal](../requests/ui.md#request-portal)         |

## 2026-10-21 — Email team invitations and explicit acceptance

Team invitations use requests@terraformaflow.com with a fixed terraformaflow.com origin (localhost:3000 for development), a seven-day expiry, and the existing admin/dispatcher/worker role picker. Recipients must authenticate with the invited email and explicitly choose Accept invitation before joining. Signup confirmation stays Supabase-managed. Copy links remain available when sending cannot be confirmed; retry generates a replacement and visibly warns that earlier links expire. Successful acceptance selects the invited team, with a separate retry for opening it if navigation fails. No mock was supplied; use the existing modal and auth styles.

## 2026-10-21 — Match invitation acceptance to the application

The user requested the acceptance page match the rest of the application. Reuse the existing AbsoluteCRM logo, cream/paper surfaces, forest/lime palette, display typography, and rounded CRM form controls across every acceptance state. Keep the current form labels and explicit acceptance behavior, with responsive spacing and wrapping for long emails.

## 2026-10-28 — Live Calgary dashboard weather

The user confirmed that the dashboard card and header badge should both use live Calgary weather, retain their layout, show metric units (°C and km/h), and render only the forecast days available from WeatherAPI. Calgary coordinates remain fixed until geocoding is connected. See [Dashboard weather](../dashboard/ui.md).
