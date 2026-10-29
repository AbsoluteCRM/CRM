# Services UI

Part of the [AbsoluteCRM design record](../design/README.md).

| Screen           | Route                  | What it shows                                     |
| ---------------- | ---------------------- | ------------------------------------------------- |
| Services         | `/services`            | Service catalog and seasonal availability         |
| Add/Edit service | Overlay on `/services` | Service defaults, season, and weather preferences |

## Services

- **Route**: `/services`.
- **Roles**: authenticated organization members can read the catalog; owners and admins can add, edit, activate, and archive services.
- **Layout**: existing service cards, toolbar, and seasonal availability chart. Weather preferences are edited in the modal.
- **States**: loading, error with retry, empty catalog, populated catalog, and search/filter results.
- **Interactions**: Add service opens a blank modal; Edit opens a populated modal. Existing search, filters, and activation controls retain their behavior.
- **Data**: `services.list` and `services.setArchived` scoped to the active organization.
- **Origin**: built without a mock; extends the existing Services screen.
- **Code**: `src/routes/_authed/services.tsx`.

## Add/Edit service

<img src="shots/service-add-desktop.png" alt="Add service modal with Snow and Schedule weather preferences on desktop" width="620">
<img src="shots/service-edit-desktop.png" alt="Edit service modal with persisted Rain and Reschedule weather preferences on desktop" width="620">
<img src="shots/service-add-phone.png" alt="Add service weather preferences with Snow and Schedule on a phone" width="195">
<img src="shots/service-edit-phone.png" alt="Edit service weather preferences with persisted Rain and Reschedule on a phone" width="195">

- **Route**: overlay on `/services`.
- **Roles**: owners and admins.
- **Layout**: existing CRM modal and form controls. A compact Weather preferences fieldset follows Seasonal availability and precedes Active. Its Precipitation and Suggested action selects use the existing styled native select controls, explicit labels, and a responsive two-column layout.
- **States**: new services start with No dependency / None and a disabled action select. Edit restores the stored pair. Saving disables both weather controls and the save button. A save failure keeps the modal open, preserves values, and uses the existing mutation error toast.
- **Interactions**: choosing Rain, Snow, or Rain or snow enables the action and defaults it to Schedule when previously disabled. Users can choose Reschedule. Choosing No dependency clears both values and disables the action. Changing between enabled precipitation types preserves the chosen action. Help text explains that preferences are saved for future recommendations and no flags are generated yet.
- **Data**: `services.create` and `services.update` save the pair atomically. Reopening uses `services.list` through the existing invalidated query. Unrelated procedure patches can omit both fields and preserve the current preference.
- **Origin**: approved service precipitation plan, built without a mock.
- **Code**: `src/routes/_authed/services.tsx`, `src/components/services/PrecipitationFields.tsx`; interaction coverage in `PrecipitationFields.stories.tsx`.

Captured on 2026-10-28 in the running app, signed in as the seeded owner in the dedicated Quote Delivery QA organization: desktop 1440×900 and phone 390×844, device scale factor 2. Verified create snow/schedule; edit rain/reschedule; reopen; an unrelated save retaining the pair; any/reschedule; and clear/reopen none/none. The dedicated QA service remains disabled for weather recommendations after verification.

## Monthly pricing unit

The service card and Add/Edit pricing-unit select use “per month” for
`monthly`. The former “per job” unit is removed. Existing services using that
unit migrate to monthly pricing; new forms still initially select “per visit”.
Visit frequencies and service prices retain their existing meaning.
