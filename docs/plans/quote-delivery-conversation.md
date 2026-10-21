# Plan: Quote delivery and customer conversation

- **Slug / branch**: `quote-delivery-conversation` / `feat/quote-delivery-conversation`
- **Tier**: full: schema, public bearer-token access, email, staff and customer UI.
- **Status**: approved
- **Confidence**: 95%. Product choices are user-confirmed; the existing send/token RPCs, staff drawer, permissions and email sender were read. Remote schema parity is an execution prerequisite, not assumed verified.
- **Plan-mode file**: this file; native plan mode is unavailable in this session. Only this uncommitted plan is written before approval.

## Original request

> Now that Resend is wired in, I would like to go back to the quote flow. We are able to build a quote now but I would like to send that quote to a customer along with a link for them to leave notes in the chat and view the quote/accept/decline, etc.

## Goal

Office staff send an existing draft quote through Resend. Its customer opens a secure link without signing in, reads the quote, accepts or declines with a confirmation, and exchanges plain-text messages with office staff. This ships in one PR. It finishes the deferred delivery portion of `quote-builder-send.md` and adds a per-quote conversation; this plan governs the new work.

## Decisions

| #   | Question        | Answer                                                                                                                                                     |
| --- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Customer access | Anyone holding the emailed link may view and respond without signing in.                                                                                   |
| Q2  | Conversation    | Each quote has a two-way conversation visible to its customer and office staff.                                                                            |
| Q3  | Notifications   | Defer message and acceptance/decline notification emails to a future PR. Sending the original quote email and manually retrying/resending it are in scope. |
| Q4  | Acceptance      | Simple accept/decline confirmation now. Signatures and job creation wait for another PR.                                                                   |
| Q5  | Extras          | Defer PDF download/attachment and customer optional-item selection. Include disabled PDF-download and optional-selection placeholders.                     |
| Q6  | Terminal states | Chat remains writable after acceptance or decline.                                                                                                         |
| Q7  | Expiry          | Keep existing token expiry at the quote's valid-until date, including conversation access.                                                                 |

Agent defaults (minor; the user may veto them):

- **D1**: Owner, admin and dispatcher send and chat, using existing `manageRequests`; workers and portal accounts have no staff access. Customer messages are labelled Customer; staff messages are labelled Team. No claim of verified customer identity is made by possession of a forwarded link.
- **D2**: Plain text only, 1–4000 characters after trimming; append-only messages, no attachments, edits or deletion. Poll every 15 seconds while the tab is visible, refetch on focus, and invalidate after sends. No Realtime dependency or notification badges in this slice.
- **D3**: Optional lines are displayed separately and explicitly excluded from the accepted total; accept submits an empty optional-selection list. Show a disabled selection control and an explanation beside those lines. Display counted totals from the database, never compute a different accepted total on the client.
- **D4**: Per-quote means revisions have distinct threads. Resending rotates the link but retains that quote's thread. Pullback/supersession/expiry disables customer access; staff retain history. Drafts have no active customer conversation and staff cannot post until sent. Staff can post on sent/approved/declined quotes only while their current link is live.
- **D5**: Acceptance confirms agreement to the displayed quote and terms; decline has an optional reason of at most 1000 characters. No name/signature collection in this PR. No job creation side effect.

## Open questions

- None affecting product scope. User approved the audited plan on 2026-10-21.

## Assumptions

| Assumption                                                                                                                       | User-confirmed?                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No-login link, two-way quote chat, simple accept/decline, deferred notifications/extras, terminal-state chat and existing expiry | Yes, Q1–Q7                                                                                      |
| Existing migrations expose send/rotate/read/approve/decline/delivery RPCs                                                        | Verified in migration files and generated types; remote parity must be checked before execution |
| New minor UI and operational defaults                                                                                            | Yes; D1–D5 approved with the plan on 2026-10-21                                                 |

## Design refs

- Mock: none; proposed UI below, following existing CRM components and public request portal styling.
- Screens: `docs/quotes/ui.md` for the quote editor/send dialog and public quote page, with desktop and phone shots. Update the feature-spec index and `docs/design/decisions.md` with the confirmed decisions.
- Existing builder is inside `RequestWorkspace` on `/requests`, not the nested quote route proposed by the older plan. Preserve this drawer integration.

## Layers touched

- [x] Migration and RLS / pgTAP tests
- [x] `docs/database` (README domain list, quotes reference, ERD, RLS)
- [x] Generated types (`pnpm db:types`)
- [x] Existing org permission middleware, reused without a second tenancy system
- [x] tRPC procedures and hooks
- [x] Public route / server functions
- [x] UI, stories and tests
- [x] Sentry spans and token privacy verification
- [x] Design record and screenshots

Security-gated paths: migrations, tRPC, trusted server code, routes and `docs/database/rls.md`; reviewer followed by security review is required.

## Changes

### Schema

Create a new migration `quote_conversation` after approval, never edit existing applied migrations.

- `quote_messages`: standard UUIDv7 id, organization_id, created_at and updated_at; quote_id; body text with a trimmed-nonempty and 4000-character check; sender_kind text constrained to `staff` or `customer`; staff_user_id nullable UUID referencing auth.users, on delete set null. Attribution is assigned by RPCs and is never client-writable. Composite `(organization_id, quote_id)` FK to quotes, on delete restrict. Index `(organization_id, quote_id, created_at, id)` and a staff_user_id index. Explicit RLS and grants: office SELECT only, no direct authenticated INSERT/UPDATE/DELETE and no anon/PUBLIC access. No policy permitting portal users or workers.
- `post_quote_message(p_organization_id uuid, p_quote_id uuid, p_body text, p_client_message_id uuid)` returns safe message fields. Security definer with empty search_path, auth.uid(), explicit active office membership, exact organization/quote match and current-link/state check. It locks the quote before token lookup, writes sender_kind=staff and staff_user_id=auth.uid(). Grant authenticated only; revoke PUBLIC, anon and service_role. Include client_message_id UUID in messages with unique `(organization_id, quote_id, sender_kind, client_message_id)`; a duplicate returns the original message only for the same sender and body, otherwise rejects a conflict. This makes retries safe after a lost response.
- `portal_token_list_messages(p_token_hash text, p_before_created_at timestamptz default null, p_before_id uuid default null)` and `portal_token_post_message(p_token_hash text, p_body text, p_client_message_id uuid)` are security-definer service-role-only RPCs, empty search_path, revoked from PUBLIC/anon/authenticated. Resolve the token using the existing `private.resolve_quote_token(..., '{sent,approved,declined}')`, retaining quote-first locking and rechecking revocation/expiry. Derive organization and quote solely from that resolution; never accept customer-supplied org, quote or staff identity. Only return id, body, sender_kind, created_at; no staff identifiers, tokens, emails or internal notes. Post inserts sender_kind=customer and null staff_user_id.
- Both customer and staff posts require a live token (not revoked, expires_at > now()) for that same quote in sent/approved/declined state. Staff history remains readable for all states. Token rotation does not move or delete messages.
- Lists return 50 messages newest-first with a `(created_at, id)` keyset cursor, render the loaded window chronologically, and provide Load older. Both cursor fields must be supplied together. Staff list uses session/RLS and explicit organization and quote filters.
- Bound public writes with a database-backed per-token limit: at most 10 new customer messages in 60 seconds and 100 in 24 hours, counting existing messages under the quote lock. Deduplicate before consuming quota. No IP storage is needed for this high-entropy token endpoint; tokens are the access credential. Invalid tokens never authorize writes.
- Extend `send_quote` in this new migration: while holding its existing quote lock and before changing draft to sent, clear is_selected on all optional rows in that organization/quote. Existing triggers recalculate counted totals in the same transaction. Preserve the function's other validation, locking, grants, supersession and token behavior. Revoke authenticated UPDATE(is_selected) on quote_line_items, so staff direct API calls cannot change a sent total; approval RPCs remain security-definer and keep their existing permissions. Draft insertion may retain existing selected flags, but send always normalizes them. Document that optional selections are cleared on send; the send dialog explicitly says optional items are excluded and does not confirm a potentially stale draft total. Refetch database totals after send before rendering the sent summary; the email includes no monetary total.
- Existing `portal_token_get_quote`, `portal_token_approve`, `portal_token_decline`, rotation/delivery functions are reused. Approve passes an empty optional-id list. Read and post allow approved/declined only until original expires_at. No automatic job conversion. Add the new authenticated security-definer message RPC to the accepted advisor findings in rls.md.
- pgTAP: grants and role matrix; tenant and composite-FK isolation; spoofed attribution and direct writes rejected; revoked/expired/unknown/superseded/pulled-back tokens denied for message reads/writes; terminal-state access before/after expiry; cursor boundaries; body constraints; idempotency/conflicting reuse; message quotas; rotation retains thread; no job created on acceptance; a preselected optional draft is normalized on send, its displayed total equals its approved total, direct staff selection updates are denied and existing approval functions still work. Preserve existing quote lifecycle tests.

### Database execution and types

Only the main agent performs remote steps after approval. Compare remote migration names against main, this branch and other open PRs before applying. Apply via the project-required Supabase MCP `apply_migration`, rename to its assigned version, run advisors and pgTAP, regenerate types and update docs. This session currently exposes no Supabase tools and has neither `supabase` nor `devenv` on PATH. Before remote work, restore the required connection/toolchain; if unavailable, report the specific dependency and continue only independent authorized work. Never substitute unrecorded SQL writes or hand-edit generated types. No remote writes are authorized before approval.

### Middleware and server boundary

- Staff procedures use existing `requireOrgPermission('manageRequests')`, ctx.supabase and ctx.organizationId. Explicitly check quote ownership within the active org before send/rotate RPCs, because their existing signatures accept quote id only and check membership in its org rather than active-org context. Message RPC accepts and checks active organization explicitly.
- Add `src/server/quote-email.ts`: Resend configuration and HTML/text email, following `invitations.ts` validation/escaping/fixed-origin conventions. Read existing RESEND_API_KEY, RESEND_FROM_EMAIL and SERVER_URL; no additional secret. Email goes only to that quote's current client email from the scoped server query. Organization name, quote number/title, validity and Review quote link; organization email is reply-to only if valid. Use fetch to the Resend API with 10-second timeout and `quote-delivery-<token-row-id>` idempotency key. Delivery means provider acceptance, not inbox arrival; no webhook in this PR.
- Generate 32 random bytes encoded as 64 hex characters server-side; only SHA-256 hash reaches the DB. Raw token is used solely in the email URL `/q/<token>`, not returned in staff procedure data. Validate configuration/recipient before committing send/rotation. Use existing send_quote and rotate_quote_token on the session client; trusted code records outcome through record_quote_delivery. Return safe sent/pending/failed status, never provider response bodies or raw tokens. Failed recording leaves pending and reports uncertain delivery; staff can retry with a new link.
- `src/server/trusted/quotes.ts`: all service-role reads/writes and delivery recording stay here (use existing supabase-admin client). `src/integrations/quotes/public.functions.ts`: token-validated server-function wrappers and Sentry.startSpan for view, list, post, approve, decline. Use POST for these wrappers so credentials do not enter RPC query strings; view is a read plus existing viewed_at stamp. Public endpoints authorize independently through the token RPC, not a route guard. Limit body lengths with Zod; return typed, runtime-validated safe DTOs.
- Use `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and noindex/nofollow for `/q/$token` and its RPC responses. Apply headers to the initial HTML response as well as RPC responses; do not rely only on a client-rendered meta tag. Token page loads data client-side through wrappers (no private data cached in a loader). Add no third-party links/assets. Preserve the existing global Google Fonts stylesheet; verify its requests have no token-bearing Referer under the initial document's no-referrer policy. No global typography change is needed. Verify existing Sentry 64-hex redaction on URLs, errors, spans and bodies; extend narrowly if tests reveal gaps. Do not log message bodies or tokens. GET page loading never accepts/declines; mutations require explicit POST confirmation. Keep same-origin framework protections for POST.

### Procedures

All staff procedures take the existing organizationId input in addition to the inputs below.

| Procedure              | Input                                             | Output                        | Roles                  |
| ---------------------- | ------------------------------------------------- | ----------------------------- | ---------------------- |
| `quotes.send`          | quoteId                                           | quote id, safe delivery state | owner/admin/dispatcher |
| `quotes.retryDelivery` | quoteId                                           | quote id, safe delivery state | owner/admin/dispatcher |
| `quotes.listMessages`  | quoteId, optional paired beforeCreatedAt/beforeId | safe page, older cursor       | owner/admin/dispatcher |
| `quotes.postMessage`   | quoteId, body, clientMessageId                    | safe message                  | owner/admin/dispatcher |

Public server functions: getQuote(token), listMessages(token, cursor), postMessage(token, body, clientMessageId), approve(token), decline(token, reason?). No public tRPC domain procedures. After mutation, invalidate/refetch quote and request data as applicable; after a terminal-state race refetch status and show the persisted outcome.

### Routes and UI

| Route / component                                                 | Changes                                                                                                                                                                                                                               | States                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/requests`, RequestWorkspace and QuoteEditor                     | Send dialog shows recipient, validity and customer-facing summary; send/retry/resend controls; delivery and viewed state; thread below quote                                                                                          | draft validation, sending, sent, pending/uncertain, failed with retry, approved, declined, expired, pulled back                                                                    |
| `/q/$token`, new `src/routes/q.$token.tsx`                        | Organization header; client name; number/revision if supplied by safe DTO; description, quantity, frequency/active months, prices/tax/totals, message, terms and validity; accept/decline confirmations; shared chat; disabled extras | loading, generic unavailable for malformed/unknown/expired/revoked/superseded links, transient retry, sent, approved, declined; chat empty/history/send pending/error/rate-limited |
| `QuoteConversation.tsx`, `PublicQuote.tsx`, `SendQuoteDialog.tsx` | Testable presentational components using existing CRM/shadcn styles                                                                                                                                                                   | story coverage for desktop/phone and interaction states                                                                                                                            |

- Send is blocked without a saved title, at least one line, valid-until and valid client email, with field-specific guidance. Existing database rules remain authoritative. Save pending edits before send or block send until saved; never silently send stale edits.
- Retry/resend is available only on live sent quotes and warns that the old link stops working, then rotates it. Approved/declined quotes keep chat but have no resend action. Pullback keeps the existing revoke behavior. No copy-link action because raw tokens are not stored.
- Chat has labelled sender, timestamp, plain text with preserved newlines, textarea and Send. Keep entered text on failure; reuse clientMessageId on retry, generate a new UUID after success. Load older without losing scroll position. Poll newest page and refetch loaded history on focus; deduplicate by id. Clear quote/chat data immediately when token becomes unavailable or active org/quote changes; never display the previous quote's cached conversation during switches.
- Accept confirms the shown counted total and terms; decline optionally records a reason. On success disable decision actions, show persisted state and keep conversation enabled while link is live.
- PDF control says Coming soon. Optional rows show selection disabled and excluded from total. No PDF data or attachments are generated.

### Acceptance criteria

1. Office staff can send a saved draft to its client's email; status and delivery outcome are shown; failed or interrupted delivery is recoverable through a warned retry.
2. Signed-out customers can open the email link, see only their quote's safe details and thread, and accept or decline once with request-status sync and no job creation.
3. Staff and customer messages persist across reloads and link rotation, appear on both sides within the polling interval, and can continue after accept/decline until link expiry.
4. Invalid, expired, revoked, superseded or pulled-back links reveal no quote or conversation data and cannot mutate either. Cross-org and disallowed staff roles are rejected at both procedure and DB boundaries.
5. Duplicate posts do not duplicate messages; conflicting idempotency reuse and quota excess fail clearly without losing compose text. Totals and lifecycle transitions remain DB-owned.
6. Notification emails, signatures, jobs, PDF and optional selection remain deferred, with the two requested disabled placeholders visible.
7. Desktop/phone views are verified in the running app and recorded in docs; one PR passes all workflow gates.

## Commits

1. `Record quote delivery and conversation plan` (main agent): approved plan, pushed as first commit and draft PR opened from freshly fetched origin/main.
2. `Add quote conversation schema and access rules` (main agent): migration, remote parity/apply/version, advisors and pgTAP, types, database docs.
3. `Add quote delivery and conversation endpoints` (implementer): session-scoped procedures/hooks, email helper, trusted token functions, public wrappers, unit/procedure tests. Use existing init.ts, invitations.ts and trusted portal patterns.
4. `Add customer quote page and staff conversation` (implementer): drawer integration, send dialog, public route and shared components, stories/play tests and route generation.
5. `Document and verify customer quote flow` (implementer plus main verification): design record/screenshots, confirmed decisions, test fixes and audit logs. Main alone performs remote verification; one branch writer at a time.

Dispatch implementers in isolated worktrees according to `.claude/agents/implementer.md`, with the approved plan, branch, canonical files and these non-goals. Pull ff-only before/after dispatch. Fresh reviewer, then security agent, audit the whole final diff; any fix voids both passes. Merge only through the workflow's gates and clean up implementer worktrees afterward.

## Unhappy paths

- Missing email configuration: fail before send changes any status. Missing/archived/unavailable client or past/missing validity: actionable error, no token or email.
- Provider error/timeout: quote remains sent; record failed with sanitized generic reason where possible. A timeout can mean provider accepted; UI explains uncertainty and link rotation. A crash before email leaves pending; retry recovers it. No automatic background retry in this PR.
- Concurrent sends/rotations: existing quote lock serializes; exactly one live token. A late email can contain a revoked link, so resend UI warns only the newest email works. Recording a stale token cannot overwrite current delivery state.
- Concurrent decision/pullback/expiry/message: quote-first token resolution locks and rechecks; accepted/declined are mutually exclusive; denied operation refetches authoritative state. Do not treat a repeated decision error as a success without checking stored state.
- Chat failure or lost response: retain text, retry same UUID, no duplicate. Invalid UUID/body/cursor is rejected; quota and DB validation apply even if frontend is bypassed.
- New quote revision: distinct thread, old sent link revoked/expired as today. Staff can read each revision's history; no customer access to other revisions.
- Email scanners loading the link can stamp viewed_at; label as Link opened rather than proof the customer personally viewed it. No GET decision side effects.

## Out of scope

Notification emails for messages or decisions; unread badges; inbound email replies; reminders; SMS; portal accounts; signature/name collection; creating/converting jobs; payments; PDF generation/attachment; customer optional selection; attachments; editing/deleting chat; Realtime; persistent links beyond existing expiry.

## Dependencies not to add

No new runtime dependency. Reuse fetch, node:crypto, Supabase, Zod, TanStack and existing components. Do not add Resend SDK, email-template framework, chat platform or realtime service for this slice.

## Verify command

```sh
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm build
```

## Verification

Workflow Definition of done applies. Unit/procedure tests cover active-org prechecks (including a user in two orgs), allowed and denied roles, email HTML escaping/configuration/recipient, provider failures/timeouts and delivery recording, token/body validation and safe response fields. Existing node Vitest project is available. pgTAP verifies real RLS/privileges and token lifecycle in rollback transactions using a dedicated test org only. Stories/play tests exercise send and retry dialogs, confirmation actions, chat send/error/retry/history and placeholders.

Use seeded test login in `.env.local` without printing credentials. In the running app, use a dedicated test org/client/quote and test mailbox controlled by the seeded user; never send test quotes to real tenants. Verify real Resend acceptance and open generated link in a signed-out browser; send both directions, reload, accept one quote and decline another, test invalid link and expiry, and capture desktop 1440×900 / phone 390×844 at device scale 2. Mailbox access or user confirmation of receipt is required to claim inbox receipt; provider acceptance alone is insufficient. Check remote advisors and all pgTAP suites. Record exact executed commands/results and any N/A reason in the PR checklist. No merge if any gate or required external access remains unavailable.

## Audit log

### Round 1 (`plan-auditor`): needs-changes, confidence high

The auditor initially passed, then a supplemental check of optional-item totals established a blocking mismatch. The supplemental verdict governs this round.

| #   | Blocking finding (recurring?)                                                                                       | Resolution                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | send_quote can send preselected optional totals; acceptance clears selections and changes the confirmed amount (no) | Fixed in plan: atomically normalize optional selections under the send lock, revoke direct staff selection updates, refetch totals, clarify send dialog, and test send-to-accept total equality. Verified the cited grants, line guard and total triggers in the repo. |

- **Non-blocking**: Adopted sent-only resend controls and explicit accepted-advisor documentation. Replaced an unnecessarily broad no-third-party-assets default with no new assets and verified no-referrer on existing font requests; avoids unrelated global typography changes while protecting tokens.
- **Unresolved**: none.
- **Pre-existing**: CLAUDE.md's claim of no node unit project is stale; implementation has one and this plan uses it.

### Round 2 (`plan-auditor`): pass, confidence high

- **Blocking / non-blocking / unresolved**: none.
- **Checked clean**: full revised plan against request and Q1–Q7; required workflow/template sections; optional-total normalization and selection privileges; send, rotation, token-resolution and delivery contracts; quote frequency DTO; conversation authorization, active-org filtering, attribution, idempotency, cursors and quotas; initial HTML/RPC privacy headers and font verification; email and chat unhappy paths; design records and exact verification command; explicit remote-tooling and parity prerequisites.
- **Pre-existing**: stale CLAUDE.md unit-project statement, noted in round 1. No unrelated change planned.
- Main agent checked git status after both audit agents: only this uncommitted plan file is present. No application, migration or remote changes made.

### Review (`reviewer`, and `security`): pending implementation

## Scope-change log

None.
