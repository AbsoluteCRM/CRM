See the [design record README](../design/README.md) for the visual system and
screen-spec conventions.

| Screen              | Route                                | What it shows                                         |
| ------------------- | ------------------------------------ | ----------------------------------------------------- |
| Service area editor | `/settings`, "Hours & service areas" | Crew service areas on a map, with a list and coverage |

## Service area editor

**Route**: `/settings`, "Hours & service areas" tab, below the Business hours
card. The tab still has a second card, "Public request areas", below the editor.
It is a free-text list of area names (`organizations.settings.service_areas`, live
data) that the public request page shows to customers. It is separate from the
drawn crew areas, which customers never see, and it is kept because the portal
reads it. Folding the two together is not decided.

**Roles**: The Settings page itself is limited to owners and admins today
(`can.manageSettings`). The editor is built for every staff role, though:
users with `manageServiceAreas` (owner, admin) get the edit controls, and
anyone else sees the map and list read-only with a "View only" note. Coverage
is hidden for workers, who cannot read the properties it counts. On phone
widths (under 768px) everyone gets the read-only map and list with an
"Editing needs a larger screen" note.

**Layout**: One card titled "Service areas".

- Header: "Add city" and "Add area" buttons (editors only).
- A "City" select that frames the map on a city and filters the list. Areas
  with no city show under every city.
- Left: the OpenLayers map ([ADR 0014](../database/decisions/0014-map-provider.md)),
  480px tall. Each area is a filled polygon in its colour with its name; the
  selected area has a thicker outline and a white casing. A dark pill at the
  bottom-left says what the pointer does right now.
- Right (380px at `lg`, stacked below on narrower screens): one of the area
  list, the area form, or the city form.
  - **Area list**: one row per area with a colour swatch, name, crew, size, and
    priority when it is not zero; a property-count badge; an amber "Overlaps N"
    badge; a "Rotation" badge. Editors also get Edit and Archive buttons.
    Archive asks for a second click ("Archive <name>" / "Keep").
  - **Area form**: Name, Crew (or "No crew yet"), Colour (eight swatches),
    Priority (whole number, -1000 to 1000), an "Add rotation" switch that
    reveals a crew select per weekday ("Area crew" means no override), "Draw on
    map" / "Redraw on map", "Use map view as boundary", Cancel, and "Review
    impact".
  - **City form**: City name, Longitude, Latitude, "Pick centre on map", "Frame
    this view", Cancel, and "Add city".
- Below: the coverage tiles, "N properties in an area / outside every area /
  with no location yet".
- A "Review impact" dialog (the Modal) over the page before anything saves.

Everything uses the Settings page's existing `Card`, `Btn`, `Badge`, `Alert`,
`Field`, and `Modal` primitives and brand tokens.

**States**:

- Loading: "Loading service areas".
- Error: "Couldn't load service areas: <message>".
- No cities: the empty state asks for a city first, and "Add area" is disabled
  until there is one.
- No areas in the city: "No service areas yet" with a "Draw an area" button.
- Populated: the list, with overlap badges.
- Read-only (not an owner or admin) and phone: no edit controls, plus a note.
- Preview failure: an error in the form and nothing saved. Save failure: the
  message in the dialog, and the draft is kept.

**Interactions**:

- **Add a city**: type a name and a longitude and latitude, or click "Pick
  centre on map" and click the map, or pan and zoom and click "Frame this
  view" (this also saves the visible extent, so the city opens at that view).
  No geocoder is called. The new city becomes the selected one.
- **Draw an area**: click "Add area", then click the map to place corners and
  click the first corner to close the shape. Drag a corner to move it and drag
  an edge to add one; edges snap to other areas' corners. "Use map view as
  boundary" is the keyboard-accessible alternative, a rectangle of the visible
  map that can then be adjusted.
- **Edit an area**: the pencil on a list row loads its shape and details.
- **Review impact**: calls `serviceAreas.preview`. The dialog shows the area
  size and corner count, an amber "Overlaps N areas: <names>" warning that does
  not block saving (priority decides the owner, then the smaller area), and the
  properties that would move, each as address, from area, to area ("No area" when
  uncovered). Past 50 properties it says "and N more". "Save area" calls
  `serviceAreas.upsert` and, when rotation is on or the area had one, `rotations.set`.
- **Select**: clicking a list row or a polygon highlights it on both; clicking
  empty map clears it.
- **Archive**: archives the area; its properties are recomputed by the
  database.

**Data**: `serviceAreas.list`, `serviceAreas.regions.list`,
`serviceAreas.coverage` (office staff), `crews.list`. Writes:
`serviceAreas.upsert`, `serviceAreas.preview`, `serviceAreas.archive`,
`serviceAreas.rotations.set`, `serviceAreas.regions.upsert`. Saves and
archives invalidate the list and coverage queries; adding a city invalidates
the region list.

**Origin**: Built without a mock, from the roadmap in
[the plan](../plans/service-areas-editor.md).

**Code**: `src/routes/_authed/settings.tsx` (`HoursTab`),
`src/components/service-areas/` (`ServiceAreasSection` on live data,
`ServiceAreasEditor` presentational, `AreaMap` and `AreaMapLayers` for the
OpenLayers layers and Draw, Modify and Snap interactions),
`src/integrations/service-areas/serviceAreas.ts` (hooks). Stories:
`ServiceAreasEditor.stories.tsx`.

**Shots**: pending. Git LFS uploads are blocked from the agent environment and
there was no signed-in session to capture from, so capture
`shots/service-areas-desktop.png` (populated, with an overlap badge),
`shots/service-areas-desktop-impact.png` (the review dialog) and
`shots/service-areas-phone.png` (read-only) and commit them.
