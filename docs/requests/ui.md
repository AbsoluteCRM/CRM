See the [design record README](../design/README.md) for the visual system and
screen-spec conventions.

| Screen         | Route              | What it shows                                                    |
| -------------- | ------------------ | ---------------------------------------------------------------- |
| Request portal | `/portal/$orgSlug` | A business's services; a modal to send a request for one of them |

The internal Requests page (`/requests`) still runs on mock data and is not
covered here. It moves to real rows in a follow-up PR.

## Request portal

<img src="shots/portal-desktop.png" alt="Portal page for Test Organization with two service cards showing price, duration, frequency and season bar" width="620">
<img src="shots/portal-desktop-modal-errors.png" alt="Request modal with name, email, phone, address and notes fields and an email validation hint" width="620">
<img src="shots/portal-phone.png" alt="Portal on a phone with the service cards stacked" width="300">
<img src="shots/portal-desktop-not-found.png" alt="Not-found state for an unknown organization link" width="620">

**Route**: `/portal/$orgSlug`. Public, outside `_authed`, with no app chrome.

**Roles**: Anyone with the link. No sign-in. Staff see the submitted request on
the internal Requests page (owner, admin and dispatcher; not workers) once that
page reads real rows.

**Layout**: A header with the logo, the organization name and a prompt, then a
responsive grid (1, 2, 3 columns) of cards that match the internal Services
page: a colored icon tile, an "Available now" or "Off-season" badge, price and
unit, duration, frequency badges, the season label with the 12-month season
bar, and a full-width "Request this service" button. Internal fields such as
equipment are never shown.

**States**:

- Loading: "Loading…".
- Unknown organization: "We couldn't find that page".
- Other error: "Something went wrong", reload hint.
- No services: "No services available yet".
- Populated: cards as above. Off-season services can still be requested.

**Interactions**:

- "Request this service" opens a modal titled with the service name and price.
- The modal asks for name, email, phone (optional), service address and notes
  (optional). The service defines its own frequencies, so visitors are not
  asked for one.
- Send validates name, email and address, then submits. Errors from the server
  (rate limit, service no longer available) show inside the modal.
- Success replaces the form with a confirmation naming the service and email.
- A hidden "Website" field is a honeypot; filled values are rejected.

**Data**: `portal.get` (public) and `portal.submit` (public, rate limited to 5
per IP and 50 per organization per hour). Both run through the trusted
service-role helpers; see [requests tables](../database/tables/requests.md).

**Origin**: Built without a mock, reusing the Services page card styling.

**Code**: [`src/routes/portal/$orgSlug.tsx`](../../src/routes/portal/$orgSlug.tsx),
[`src/components/portal/RequestModal.tsx`](../../src/components/portal/RequestModal.tsx),
[`src/server/trusted/portal.ts`](../../src/server/trusted/portal.ts).
