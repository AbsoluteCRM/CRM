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

## 2026-10-28: Monthly service pricing unit

Replace the service pricing unit displayed as “per job” (stored as `each`)
with `monthly`, displayed as “per month” in Services and the public portal
(including the request modal). The user confirmed migrating all existing
`each` services. Keep `visit` pricing available. Monthly pricing does not
change visit frequency or introduce automatic subscription billing.

## 2026-10-29 — Interactive Route Builder prototype

The user requested a Route Builder template matching the existing CRM styling, using mock data shaped like the database. They chose local add/remove/reorder and crew selection interactions, with edits resetting on refresh, and access for owner, admin, and dispatcher. The approved plan includes date-specific crew drafts, search, and reset. Use a clearly labeled schematic preview and demo notice; live assignment, publication, and optimization remain outside this prototype. See [Route Builder UI](../route-builder/ui.md).

## 2026-10-29 — Route templates and a drag-and-drop board

The user revised Route Builder to three explicit sections: Existing routes, Create route and Available jobs, using Teams CrewBuilder as the reference. Create a genuinely empty template before assigning a crew or adding jobs. Selectable route cards show crew/date/status/count/duration; a dropdown includes No crew. Native drag moves visits from the pool to any route, between routes and back to the pool, with equivalent keyboard/touch controls. Keep all edits local until refresh. Unassigned templates use a separate UI model because database routes require a crew; assigned crews remain unique per date. See [Route Builder UI](../route-builder/ui.md).

## 2026-11-02 — Route maps on OpenLayers

Eric chose OpenLayers instead of Google Maps, with a hosted free-tier basemap
(MapTiler or Stadia; OpenStreetMap tiles in development only) and attribution
always visible. The Calendar's Google Maps iframe and the Jobs page's
schematic SVG map both become the shared OpenLayers map, keeping the earlier
look of the stops: numbered pins in the crew colour, a lime ring on the active
job, faded completed stops, and the dark yard tile with the lime warehouse
glyph. Legs stay straight until road routing lands. Stops without a location
are listed under the map instead of placed. See
[ADR 0014](../database/decisions/0014-map-provider.md),
[Calendar UI](../calendar/ui.md), and [Jobs UI](../jobs/ui.md).

## 2026-11-03 — Route Builder reads live data

Eric approved the roadmap and told us to build Route Builder on live data
before auto-assignment. The mock state is replaced by the day's real routes,
stops and scheduled visits, with every write atomic in the database. Because
`routes.crew_id` is required, a route is now created with a crew (the
prototype's crew-less templates are gone) and a crew change builds a new
route for the new crew in one transaction. Only draft and optimized routes
are editable. Drag moves update the board first and roll back with a toast
when the server refuses. The selected route is drawn on the OpenLayers map
instead of the schematic. Screenshots are pending. See
[Route Builder UI](../route-builder/ui.md) and the
[plan](../plans/route-builder-live-data.md).

## 2026-11-02 — Service area editor in Settings

Eric approved the service area editor in the roadmap: owners and admins draw
crew service areas on a map in Settings → "Hours & service areas". The existing
free-text list stays as a separate "Public request areas" card, because the
public request page reads it. Each save shows the impact first (properties that would
move, from and to) and warns on overlaps without blocking, because overlaps
are allowed and priority decides. The area list is the keyboard equivalent of
the map. Cities are added by typing or picking a centre, or by framing the
current view; no provider is called. Drawing is for desktop and tablet; phones
and non-managers see the map and list read-only. See
[Service area editor](../service-areas/ui.md) and
[the plan](../plans/service-areas-editor.md).
