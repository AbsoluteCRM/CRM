See the [design record conventions](../design/README.md).

Quote delivery and conversation are implemented under [the approved plan](../plans/quote-delivery-conversation.md).
The screens below were captured in the running app on 2026-10-28 using an isolated
QA organization, an authenticated staff session and a signed-out customer browser.
Desktop captures use 1440×900; phone captures use 390×844; both use device scale 2.
The controlled recipient's displayed email was replaced with an example address
before capture. The actual email and application state were unchanged.

| Screen                       | Route                       | What it shows                                               |
| ---------------------------- | --------------------------- | ----------------------------------------------------------- |
| Quote editor and send dialog | `/requests`, request drawer | Recipient, validity, delivery state and office conversation |
| Customer quote review        | `/q/$token`                 | Quote, decision confirmations and customer conversation     |

## Quote editor and send dialog

<img src="shots/quote-editor-desktop.png" alt="Staff quote editor with saved draft details and send action" width="620">
<img src="shots/quote-editor-phone.png" alt="Saved quote details in the phone request drawer" width="260">
<img src="shots/quote-send-dialog-desktop.png" alt="Send confirmation showing recipient, quote, validity and optional-item notice" width="620">
<img src="shots/quote-send-dialog-phone.png" alt="Send quote confirmation in the phone layout" width="260">
<img src="shots/staff-conversation-desktop.png" alt="Office conversation containing customer and team messages" width="620">
<img src="shots/staff-conversation-phone.png" alt="Phone layout showing email delivery state and office conversation" width="260">

- **Route**: request drawer on `/requests`.
- **Roles**: owner, admin and dispatcher; workers and portal users have no staff access.
- **Layout**: existing quote editor, send/retry dialog and shared conversation. Reuse CRM Modal, Btn, Card and form controls. The dialog identifies the recipient and explains that optional items are excluded. It does not confirm a potentially stale draft total.
- **States**: draft validation, sending, sent, pending/uncertain, failed, approved, declined, expired and pulled back. Only live sent quotes can be resent. Conversation history stays readable to office staff after link expiry; composing requires a live sent/approved/declined link.
- **Interactions**: save changes before sending; confirm send; warn that a retry invalidates the previous link; pullback revokes customer access. Send messages with retry-safe client IDs, retain text on errors, load older history and refetch the active conversation.
- **Data**: `quotes.send`, `quotes.retryDelivery`, `quotes.listMessages` and `quotes.postMessage`, alongside existing quote editor procedures.
- **Origin**: built without a mock; user approved the plan on 2026-10-21.
- **Code**: `src/components/quotes/SendQuoteDialog.tsx`, `QuoteConversation.tsx`; `QuoteEditor.tsx`, `src/components/requests/RequestWorkspace.tsx` and `src/integrations/quotes/quotes.ts`.
- **Shots**: saved draft, send confirmation and live staff conversation above.

## Customer quote review

<img src="shots/customer-quote-desktop.png" alt="Customer quote with required and optional items, taxes, total and decision controls" width="620">
<img src="shots/customer-quote-phone.png" alt="Customer quote details and excluded optional extra in the phone layout" width="260">
<img src="shots/customer-conversation-desktop.png" alt="Customer conversation with persisted messages from both participants" width="620">
<img src="shots/customer-conversation-phone.png" alt="Phone conversation with message composer beneath the quote" width="260">
<img src="shots/customer-approved-desktop.png" alt="Approved quote with conversation still open after acceptance" width="620">
<img src="shots/customer-approved-phone.png" alt="Accepted quote and continued customer conversation on a phone" width="260">
<img src="shots/customer-declined-desktop.png" alt="Declined quote with a continuing customer conversation" width="620">
<img src="shots/customer-declined-phone.png" alt="Declined quote confirmation and chat in the phone layout" width="260">
<img src="shots/customer-unavailable-desktop.png" alt="Generic unavailable page without private quote details" width="620">
<img src="shots/customer-unavailable-phone.png" alt="Unavailable quote link page in the phone layout" width="260">

- **Route**: `/q/$token`, outside the signed-in layout.
- **Roles**: anyone holding the emailed bearer link, without signing in.
- **Layout**: organization header, customer/quote identification, item descriptions and quantities, frequency and active months, prices and tax, database-owned totals, message, terms and validity; accept/decline controls and shared conversation below. PDF and optional selection have disabled Coming soon controls. Use the current CRM palette and responsive cards.
- **States**: loading; generic unavailable for invalid/expired/revoked/superseded links; transient error with retry; sent; approved; declined; empty/history/loading/error/read-only conversation.
- **Interactions**: explicit confirmation to accept the displayed total/terms; optional reason when declining; decision actions disappear after the persisted decision. Chat stays open until original expiry. No signatures, job creation or decision/message notification emails.
- **Data**: POST server functions for quote view, message list/post and decisions; each independently validates the bearer token. Links expire at the existing valid-until boundary.
- **Origin**: built without a mock; decisions recorded in [design decisions](../design/decisions.md#2026-10-21--customer-quote-review-and-conversation).
- **Code**: `src/components/quotes/PublicQuote.tsx`, `QuoteConversation.tsx`; `src/routes/q/$token.tsx`, `src/integrations/quotes/public.ts` and `public.functions.ts`.
- **Shots**: live quote, conversation, accepted, declined and unavailable states above.

## Verification procedure

Use an isolated QA organization and controlled recipient mailbox. In `/requests`,
open a request and its saved draft. Save a title, a future valid-until date and at
least one line. Confirm that unsaved detail or line edits block send, then send
and inspect the pending/failed/provider-accepted state. Retry or resend only a
live sent quote; confirm the link-rotation warning before proceeding.

Open the emailed `/q/$token` link while signed out. Verify quote details, optional
items excluded from database totals, disabled extras/PDF controls, two-way chat,
reload persistence, older-message paging and a confirmed accept/decline. Staff
quote status and messages refresh every 15 seconds while visible and on focus.
Accepted/declined quotes retain chat until original expiry. Check that invalid,
expired, pulled-back and superseded links show the same unavailable page, and
inspect the initial document and POST responses for no-store, no-referrer and
noindex headers. Capture desktop and phone screenshots from this live flow.

## Verification result — 2026-10-28

Resend accepted three real QA emails: the first quote, a second quote and its
replacement link. The outgoing links were retrieved privately from those exact
provider records; raw bearer tokens were kept in memory and omitted from logs
and screenshots. Inbox receipt was not verified. The test server used a temporary
localhost origin; application environment files were not changed for delivery.

Playwright verified signed-out access, both message directions and reload
persistence, simple acceptance and decline, chat after both decisions, old-link
revocation after resend, generic invalid-link handling and expiry closing both
quote and conversation access. Both quotes retained the required-only $105 total,
including tax, and created no jobs. Initial HTML and public POST responses used
no-store, no-referrer and noindex protections. The customer browser had no auth
cookies and exposed no token-bearing cross-origin Referer. PDF and optional-item
controls were disabled. Automated stories cover older-message paging and staff
status/message refresh; the remote database suites cover tenant and role gates.
