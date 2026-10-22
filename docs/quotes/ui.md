See the [design record conventions](../design/README.md).

This feature is in progress under [the approved plan](../plans/quote-delivery-conversation.md).
Presentational components are prepared; route/data integration and running-app
screenshots remain pending the Supabase migration and generated types. The
screens below are the approved design, not a claim that the flow is live.

| Screen                       | Route                                   | What it shows                                               |
| ---------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| Quote editor and send dialog | `/requests`, request drawer             | Recipient, validity, delivery state and office conversation |
| Customer quote review        | `/q/$token` (pending route integration) | Quote, decision confirmations and customer conversation     |

## Quote editor and send dialog

- **Route**: request drawer on `/requests`.
- **Roles**: owner, admin and dispatcher; workers and portal users have no staff access.
- **Layout**: existing quote editor, send/retry dialog and shared conversation. Reuse CRM Modal, Btn, Card and form controls. The dialog identifies the recipient and explains that optional items are excluded. It does not confirm a potentially stale draft total.
- **States**: draft validation, sending, sent, pending/uncertain, failed, approved, declined, expired and pulled back. Only live sent quotes can be resent. Conversation history stays readable to office staff after link expiry; composing requires a live sent/approved/declined link.
- **Interactions**: save changes before sending; confirm send; warn that a retry invalidates the previous link; pullback revokes customer access. Send messages with retry-safe client IDs, retain text on errors, load older history and refetch the active conversation.
- **Data**: planned `quotes.send`, `quotes.retryDelivery`, `quotes.listMessages` and `quotes.postMessage`, alongside existing quote editor procedures.
- **Origin**: built without a mock; user approved the plan on 2026-10-21.
- **Code**: `src/components/quotes/SendQuoteDialog.tsx`, `QuoteConversation.tsx`; existing `QuoteEditor.tsx` and `src/components/requests/RequestWorkspace.tsx` await integration.
- **Shots**: pending running-app verification at desktop and phone sizes.

## Customer quote review

- **Route**: `/q/$token`, pending route integration.
- **Roles**: anyone holding the emailed bearer link, without signing in.
- **Layout**: organization header, customer/quote identification, item descriptions and quantities, frequency and active months, prices and tax, database-owned totals, message, terms and validity; accept/decline controls and shared conversation below. PDF and optional selection have disabled Coming soon controls. Use the current CRM palette and responsive cards.
- **States**: loading; generic unavailable for invalid/expired/revoked/superseded links; transient error with retry; sent; approved; declined; empty/history/loading/error/read-only conversation.
- **Interactions**: explicit confirmation to accept the displayed total/terms; optional reason when declining; decision actions disappear after the persisted decision. Chat stays open until original expiry. No signatures, job creation or decision/message notification emails.
- **Data**: planned POST server functions for quote view, message list/post and decisions; each independently validates the bearer token. Links expire at the existing valid-until boundary.
- **Origin**: built without a mock; decisions recorded in [design decisions](../design/decisions.md#2026-10-21--customer-quote-review-and-conversation).
- **Code**: `src/components/quotes/PublicQuote.tsx`, `QuoteConversation.tsx`; route/server-function integration pending.
- **Shots**: pending running-app verification at 1440×900 and 390×844, device scale factor 2. Storybook previews are not substituted for these screenshots.
