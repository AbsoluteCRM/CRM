See the [design record README](../design/README.md) for the visual system and screen-spec conventions.

| Screen        | Route            | What it shows                                                                       |
| ------------- | ---------------- | ----------------------------------------------------------------------------------- |
| Route Builder | `/route-builder` | Existing routes, empty template creation, available visits, and a schematic preview |

## Route Builder

**Route**: `/route-builder`

**Roles**: Owner, admin, and dispatcher can use the builder. Workers receive the existing PageShell access-denied card, including on direct navigation. The authenticated layout handles sign-in. This prototype has no server data access.

**Layout**: The PageShell cream surface and sage mock notice precede three distinct sections. Create route pairs the page-level date filter with a creation button, following Teams CrewBuilder. Existing routes is a responsive board of rounded paper cards, beside Available jobs on desktop and above it on phone. Each route has its own selection button, Draft badge, crew dropdown, date, stop count, on-site duration and ordered draggable visit cards. The selected route has a compact illustrative schematic beneath the board. Cards stack on phone without horizontal page scrolling.

**States**: Route 1 starts with two North crew visits; Route 2 starts with one South crew visit. Three visits remain available. Creating a route selects an empty, unassigned template. Crew options occupied by another route on that date are disabled. Dates without routes show creation guidance and dates without visits explain the example date. Filtered-empty and all-assigned pools have dedicated guidance. Workers see the existing denied state. Fixtures are synchronous, with no loading or remote-error state.

**Interactions**:

- Create route adds a uniquely labeled empty template for the selected date, before choosing a crew or jobs. Multiple unassigned templates are allowed.
- Select a route to target the pool Add buttons and illustrative preview. Selection is separate from all embedded controls.
- Crew dropdowns include No crew. Assignment and clearing preserve visits; each crew can have at most one route per date.
- Drag visit cards from pool to any route, between routes, or back to Available jobs. Labeled route/pool regions highlight when accepting a visit. Native drag uses a custom visit MIME type. Unknown, wrong-date, duplicate and same-route transfers cannot lose or duplicate visits.
- Add, remove, Move to route dropdown/action, and up/down controls provide keyboard and touch equivalents. Transfers are atomic and renumber ordered stops from one; summaries and schematic follow the same state. A live status announces changes and invalid transfers.
- Search matches customer, address, job number and service. Date changes filter routes/pool without creating or rescheduling routes; returning preserves edits.
- Reset demo restores seeds, date, selection and search. Refresh discards all edits. No live assignment, publication or persistence is offered.

**Data**: Typed fixtures select generated `Tables` fields for jobs, visits, crews, routes, route stops, clients and properties, with shared synthetic organization and consistent foreign keys. Seeded route rows have required crew IDs. A separate local UI `RouteTemplate` type permits nullable crew, presentation labels and ordered visit IDs; an unassigned template is not a database row. Derived route stops have contiguous one-based sequences. Visit assignment comes from route membership, never a visit crew field. Arrival windows are ISO timestamps displayed in the example Calgary timezone. Schematic coordinates are separate display data. No network calls or shared store mutations occur.

**Origin**: Built without a mock, following the approved [Route Builder plan](../plans/route-builder-template.md) and existing CRM styling.

**Code**: `src/routes/_authed/route-builder.tsx`, `src/components/route-builder/RouteBuilder.tsx`, `src/components/route-builder/mock-data.ts`, and `src/components/route-builder/RouteBuilder.stories.tsx`.

**Verification**: All eight revised stories pass, covering empty creation and unique labels, crew conflicts/clearing, selection, all three drag pathways, invalid/same-route drops, fallback transfers/reordering, summaries/preview, date preservation, search/reset and empty/mobile states. Authenticated Chromium also verifies actual native drags on all three pathways, adding visits before assigning a crew, assignment/clearing, refresh reset and role denial. Phone Add/Move/Remove controls work at 390px without horizontal page overflow, and the date field wraps to show the full date. The screenshots below show the revised implemented UI. Build/types/lint/format pass; the main environment-loaded suite has 262 passing tests and five independently reproduced unrelated assertion failures. See the plan for exact results.

**Desktop** (1440×900, device scale factor 2):

<img src="shots/route-builder-desktop.png" alt="Route Builder with empty route creation, selectable route cards, available jobs, and an illustrative preview" width="720">

**Phone** (390×844, device scale factor 2):

<img src="shots/route-builder-phone.png" alt="Phone layout with Route Builder heading, demo notice, date filter, and Create route controls" width="320">

<img src="shots/route-builder-phone-draft.png" alt="Phone layout showing a route card with crew selection, ordered visit cards, and keyboard transfer controls" width="320">
