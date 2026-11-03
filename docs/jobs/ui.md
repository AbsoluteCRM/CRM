See the [design record README](../design/README.md) for the visual system and
screen-spec conventions. This file covers only the Jobs screens' route maps so
far; the rest of `/jobs` predates the design record.

| Screen                | Route              | What it shows                               |
| --------------------- | ------------------ | ------------------------------------------- |
| Routes & dispatch     | `/jobs`            | One crew's day on a map, with its stop list |
| Job drawer, Route tab | overlay on `/jobs` | The job's crew route, with this job ringed  |

## Routes & dispatch

**Route**: `/jobs`, "Routes & dispatch" tab.

**Roles**: Signed-in staff. Owners, admins, and dispatchers can optimize and
reorder; everyone sees the map.

**Layout**: A card with the crew switcher and the date field, then the route
map (16:10), then the Stops, Drive time, On-site work, and Est. finish tiles.
The stop list sits in the right column. The map is the shared OpenLayers
`MapView` ([ADR 0014](../database/decisions/0014-map-provider.md)): numbered
pins in the crew colour at each property's location, completed stops faded,
the yard as a dark tile with a lime warehouse glyph, and straight legs from the
yard through each stop and back, labelled with estimated drive minutes (the
leg back to the yard is unlabelled). Attribution is always shown.

**States**:

- Loading: a sage skeleton fills the map box until the map chunk loads.
- No stops on the day: the existing "No stops on this day" empty state, no map.
- Stops without a location (for example a client added in the demo store,
  until phase 2 geocodes addresses): numbered as usual and listed under the
  map in a "Not on the map" box.
- No basemap configured: pins and legs on a plain background, with a small
  "Basemap not configured" note.

**Interactions**: Clicking a pin opens that job's drawer. The pointer turns
into a hand over pins. Pan and zoom with the buttons, drag, or wheel; the view
re-frames the yard and stops when the crew or date changes.

**Data**: The demo tenant store (`useTenant()`); `Property.location` is lon/lat
(mirroring `properties.location`), and the yard is `depotLonLat(org.city)`.
Drive estimates still use the demo grid until the optimizer lands (ADR 0006).

**Origin**: Built without a mock; the pins and yard copy the earlier schematic
map.

**Code**: `src/routes/_authed/jobs.tsx`, `src/components/crm/RouteMap.tsx`,
`src/components/map/`.

## Job drawer, Route tab

**Route**: overlay on `/jobs` (and anywhere the job drawer opens).

**Roles**: As the drawer.

**Layout**: The same route map as Routes & dispatch, for the job's crew and
date, above the crew summary and stop list. The current job's pin is larger
with a lime ring.

**States**: As Routes & dispatch; "No crew assigned" shows the existing empty
state instead of a map.

**Interactions**: Pan and zoom; pins are not clickable here (the drawer is
already on the job).

**Data**: As Routes & dispatch.

**Origin**: Built without a mock.

**Code**: `src/components/crm/JobDrawer.tsx` (`RouteTab`),
`src/components/crm/RouteMap.tsx`.

**Shots**: pending. They were captured during verification, but Git LFS uploads were blocked from the agent environment, so recapture and commit them as `shots/jobs-desktop-routes.png` and `shots/jobs-desktop-drawer-route.png`. The capture used a stubbed sign-in with the tile host blocked, so its basemap is blank.
