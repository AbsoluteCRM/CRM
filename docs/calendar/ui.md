See the [design record README](../design/README.md) for the visual system and
screen-spec conventions.

| Screen   | Route       | What it shows                                    |
| -------- | ----------- | ------------------------------------------------ |
| Calendar | `/calendar` | Weekly job schedule and the selected day's route |

## Calendar

**Route**: `/calendar`

**Roles**: Authenticated users. The `_authed` route guard requires sign-in.
There are no role-specific Calendar variations.

**Layout**: The cream page surface contains a weekly date-range header with
previous-week, Today, and next-week controls. Seven day tiles show the weekday,
date, and job count. Selecting a populated day displays its route map beside a
three-column route-stop grid. The map is the shared OpenLayers `MapView`
([ADR 0014](../database/decisions/0014-map-provider.md)): numbered pins in the
crew colour at each property's location, the yard tile, and straight legs from
the yard through the stops and back. Completed stops are faded. Attribution
(OpenStreetMap contributors plus the tile provider) is always shown. Stop cards show the customer, job type, address,
time, duration, notes when present, and an Update button. CRM leaf, lime, cream,
paper, ink, and line tokens style the controls, tiles, cards, map, and empty
states.

**States**:

- Populated week: job counts appear on each day; populated days can be selected.
- Empty day: the tile is disabled and says "No jobs".
- No selected day: guidance prompts the user to select a day.
- Map loading: a sage skeleton fills the map box until the map chunk loads
  (and always during the server render).
- Stops without a location: they are numbered as usual but listed under the
  map in a "Not on the map" box instead of being placed.
- No basemap configured (production without `VITE_MAP_PROVIDER` and a key):
  pins and legs draw on a plain background with a small "Basemap not
  configured" note.
- Authentication loading or signed-out state: handled by the `_authed` layout,
  not by the Calendar component.

**Interactions**:

- Previous week and next week shift the displayed week and clear day selection.
- Today returns the display to the current week and clears day selection.
- Selecting a populated day shows its route stops and map.
- The map pans and zooms (buttons, drag, wheel); it frames the yard and stops
  whenever the day or crew changes.

**Data**: The route reads the demo tenant store (`useTenant()`); each stop
carries its property's `location` (lon/lat), and the org yard comes from
`depotLonLat(org.city)`. Storybook uses `getMockWeekRoutes(anchor)` from
`src/components/calendar/mock-routes.ts`, whose addresses carry approximate
Calgary coordinates. No server procedure is called.

**Origin**: Built without a mock.

**Code**: `src/routes/_authed/calendar.tsx`,
`src/components/calendar/WeekCalendar.tsx`,
`src/components/calendar/RouteStopsGrid.tsx`,
`src/components/calendar/RouteStopCard.tsx`, and
`src/components/calendar/RouteMap.tsx`, and `src/components/map/`.

**Shots**: pending. They were captured during verification, but Git LFS uploads were blocked from the agent environment, so recapture and commit them as `shots/calendar-desktop-route-map.png`. The capture used a stubbed sign-in with the tile host blocked, so its basemap is blank.
