See the [design record README](../design/README.md) for the visual system and screen-spec conventions.

| Screen        | Route            | What it shows                                                          |
| ------------- | ---------------- | ---------------------------------------------------------------------- |
| Route Builder | `/route-builder` | Available job visits, a local crew/date draft, and a schematic preview |

## Route Builder

**Route**: `/route-builder`

**Roles**: Owner, admin, and dispatcher can use the builder. Workers receive the existing PageShell access-denied card, including on direct navigation. The authenticated layout handles sign-in. This prototype has no server data access.

**Layout**: PageShell supplies the Operations kicker, display heading, cream surface, and footer. A sage demo notice and Reset demo action precede a paper card with native date and crew selectors. On wide screens, three columns show the available-job pool, route draft, and schematic map with its illustrative-preview notice. Smaller screens stack these cards. Existing CRM Card, Badge, Btn, IconBtn, SearchInput, TextInput, SelectInput, and EmptyState primitives supply rounded corners, leaf/lime tokens, focus rings, and typography.

Available visit cards show job number, customer, address, service, duration, and arrival window or flexible-arrival fallback. Draft cards have contiguous numbered stops and accessible up/down/remove controls. The crew summary shows the mock vehicle and start time. Totals show stop count and on-site work only. The schematic reflects the selected draft order and never presents driving estimates.

**States**:

- Populated draft: North crew begins with two visits on October 29, 2026; four visits remain available.
- Empty draft: South crew initially has no stops; guidance explains how to add visits.
- All assigned: the pool explains that visits are on routes and can be released by removing a stop.
- Filtered-empty: guidance suggests searching by customer, address, job number, or service.
- Empty date: dates other than the example date have no mock visits; guidance points back to October 29, 2026.
- Role denied: workers see the established restricted-content card.
- No loading or remote-error state is necessary for synchronous local fixtures.

**Interactions**:

- Date and crew select a separate local draft for that pair, preserving other drafts.
- Search filters only unassigned visits on the selected date.
- Add to route appends the visit. A visit assigned to any draft disappears from every crew's pool, preventing duplicate assignments.
- Remove returns a visit to its date's available pool. Up/down controls reorder stops and are disabled at list boundaries. Every edit rebuilds contiguous one-based sequences and updates the schematic and on-site total.
- Reset demo restores the initial drafts, date, crew, and search with a status message. Refresh also discards all edits.
- No save, publish, optimization, live assignment, or persistence action is offered.

**Data**: `src/components/route-builder/mock-data.ts` selects fields from generated `Tables` types for jobs, visits, crews, routes, route stops, clients, and properties. Shared synthetic organization IDs and explicit foreign-key relationships join visits to jobs and customer/property records. Assignment derives from route stops, never a visit crew field. Schematic coordinates live separately from database-shaped records. There are no network calls or store mutations.

**Origin**: Built without a mock, following the approved [Route Builder plan](../plans/route-builder-template.md) and existing CRM styling.

**Code**: `src/routes/_authed/route-builder.tsx`, `src/components/route-builder/RouteBuilder.tsx`, `src/components/route-builder/mock-data.ts`, and `src/components/route-builder/RouteBuilder.stories.tsx`.

**Verification**: Storybook interactions cover adding/removing, both reorder directions and boundaries, contiguous numbering, duration and preview updates, assignment exclusion across crews, preserved crew/date drafts, empty dates, all-assigned and filtered-empty pools, search fields, and reset. Running-app desktop and phone captures are added during final verification.
