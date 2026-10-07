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
three-column route-stop grid. Stop cards show the customer, job type, address,
time, duration, notes when present, and an Update button. CRM leaf, lime, cream,
paper, ink, and line tokens style the controls, tiles, cards, map, and empty
states.

**States**:

- Populated week: job counts appear on each day; populated days can be selected.
- Empty day: the tile is disabled and says "No jobs".
- No selected day: guidance prompts the user to select a day.
- Selected day with no Maps API key: an explanatory map placeholder appears.
- Authentication loading or signed-out state: handled by the `_authed` layout,
  not by the Calendar component.

**Interactions**:

- Previous week and next week shift the displayed week and clear day selection.
- Today returns the display to the current week and clears day selection.
- Selecting a populated day shows its route stops and map.
- The map opens Google Maps embed URLs for a single location or route.

**Data**: The current implementation uses `getMockWeekRoutes(anchor)` from
`src/components/calendar/mock-routes.ts`. No server procedure is called.

**Origin**: Built without a mock.

**Code**: `src/routes/_authed/calendar.tsx`,
`src/components/calendar/WeekCalendar.tsx`,
`src/components/calendar/RouteStopsGrid.tsx`,
`src/components/calendar/RouteStopCard.tsx`, and
`src/components/calendar/RouteMap.tsx`.

**Desktop shot**: Pending capture during verification.
