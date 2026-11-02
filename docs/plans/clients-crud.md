# Plan: Live clients list, add-client, and notes

- **Slug / branch**: `clients-crud` / `feat/clients-crud`
- **Tier**: full (tRPC procedures, security-gated routes, UI, design record)
- **Status**: implemented
- **Confidence**: 96%. Scope, the three schema/UX tradeoffs, and the mutation
  shape are user-confirmed or verified against the schema and existing
  procedures/hooks (`clients.list`, `crews.create`/`update`, `useCrewMutations`,
  `teams.tsx`'s mixed mock/live pattern). The remaining 4% is implementation
  detail (exact zod shapes, optimistic-cache merge) left to the implementer
  within the bounds set below.
- **Plan-mode file**: unavailable; this environment has no native plan mode.

## Original request

> I would like for this page to read from the database. Right now it appears
> to be reading only mock data.
>
> Let's backtrack. I want to read just the list of clients from the DB and the
> ability to add clients, add notes to their file. Service history, scheduled,
> and invoices can remain mock.

## Goal

`/_authed/clients` reads real, organization-scoped clients from the database
(table, counts, search, and the profile drawer's identity), can create a new
client, and can edit a client's single notes field and core contact fields
(name, type, phone, email, status) — all through new `clients.create` /
`clients.update` tRPC procedures. Service history, scheduled jobs, invoices,
and property details in the drawer keep rendering today's mock-store content
and empty states unchanged; they are not wired to real data in this PR.

## Decisions

| #   | Question                                               | Answer                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Scope of "live"                                        | Client list, add client, and notes. Service history/scheduled/invoices stay mock.                                                                                                                                                                                                         |
| Q2  | Add Client form                                        | Client only (name, kind, status defaults to active, email, phone). Drop the property-address field; no property is created.                                                                                                                                                               |
| Q3  | Notes schema                                           | Reuse the single `clients.notes` text column; the Notes tab becomes one editable note box, not a per-entry timeline.                                                                                                                                                                      |
| Q4  | Mock-sourced tabs/fields for a real (DB-backed) client | Accept that Service history, Scheduled, Invoices, the property fields in Overview, and most of Timeline render their existing empty states for every real client (mock jobs/invoices/properties key off mock IDs that never match real UUIDs). Ship as-is; wiring them up is future work. |

Agent defaults (minor; the user may veto them):

- **D1**: `kind = 'company'` requires a non-empty `company_name` (DB check
  constraint). No separate "company name" field is added to the form; the
  client sends `company_name = display_name` whenever it submits
  `kind: 'company'` (on create, and on the Overview "Type" select changing to
  Commercial).
- **D2**: New client `status` defaults to `'active'` (DB default); the Add
  Client form keeps no status field, matching the current form.
- **D3**: Permission gating stays on `can.manageClients(t.role)` from the mock
  tenant (`useTenant()`), matching the existing `teams.tsx` pattern of mixing
  live data with a mock-store-gated page while the server independently
  enforces `requireOrgPermission('manageClients')`. Switching the page to
  `useOrganization()` permissions is out of scope.
- **D4**: The client row shown in the drawer is looked up from the already
  loaded `clients.list` cache by id (`clients.find(c => c.id === id)`); no
  separate `clients.get` procedure. If the id isn't in the loaded list (stale
  link, still loading), the drawer doesn't render — identical to today's
  `t.client(id)` behavior.
- **D5**: The "Lifetime value" and "Outstanding" stat cards and the per-row
  "Lifetime value" column keep calling the existing mock `t.clientLifetimeValue`
  / `t.invoices` helpers, now over the real client list. Since no mock invoice
  references a real client id, these display `$0`/empty rather than a
  stale aggregate across unrelated mock clients (today's `outstanding` summed
  across _all_ mock invoices regardless of the visible list, which would be
  actively misleading once the list shows real clients).
- **D6**: The Timeline tab drops its per-note events entirely (no discrete
  timestamp exists anymore); it keeps "Became a client" plus the still-mock
  requests/jobs/invoice-payment events.
- **D7**: No Storybook story for this page, consistent with other `_authed`
  pages that aren't broken into presentational components with stories
  (`teams.tsx`, `dashboard.tsx`). `CrewBuilder`/`RequestsPanel` are the
  exception because they're extracted components; nothing here is extracted.
- **D8**: The live `ClientRow` is not shaped like the mock `Client` type, so
  every read of a field that differs in name or nullability is rewritten,
  not left as-is: `createdAt` → `created_at` (table "Recent" sort, drawer
  subtitle, Timeline's "Became a client" event); `phone`/`email` (both
  nullable on the DB row, same as `notes`) are coalesced to `''` everywhere
  they're read — the search filter, the two `InlineEdit` values, the
  `tel:`/`mailto:` links, and the two table-cell displays — mirroring the
  `notes ?? ''` treatment. The Notes tab's header badge drops its `count`
  since `notes` is a string, not a list.

## Open questions

- None.

## Assumptions

| Assumption                                                                                                                                                                  | User-confirmed?          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `clients.list` (existing) is the source of truth for the table and drawer.                                                                                                  | verified in repo         |
| No migration is needed: `clients.notes`, `display_name`, `kind`, `status`, `email`, `phone`, `company_name` already exist with `insert`/`update` grants to `authenticated`. | verified in repo         |
| D1–D7 above.                                                                                                                                                                | agent default (vetoable) |

## Design refs

- Mock: current `src/routes/_authed/clients.tsx` (the page being changed).
- Screens: new `docs/clients/ui.md` — Clients list, Add client modal, Client
  profile drawer (Overview contact fields + Notes tab; other tabs unchanged).

## Layers touched

- [ ] Migration
- [ ] RLS policies / pgTAP tests
- [ ] `docs/database`
- [ ] Types (no `pnpm db:types` run; no schema change)
- [ ] Middleware (`requireOrgPermission('manageClients')` already exists)
- [x] tRPC procedures (`clients.create`, `clients.update`)
- [x] Routes / loaders
- [x] UI components
- [ ] Stories (see D7)
- [x] Tests
- [ ] Sentry (procedures follow the existing `Sentry.startSpan` convention already used by `clients.list`/`crews.*`; no new setup)
- [x] Design record (`docs/clients/ui.md`, shots)

Security-gated paths touched: `src/integrations/trpc/clients.ts`,
`src/routes/_authed/clients.tsx`. The `security` agent gates the merge.

## Changes

### Schema

- None. `public.clients` already has `display_name`, `kind`, `status`,
  `email`, `phone`, `company_name`, `notes` with `insert`/`update` grants to
  `authenticated` (RLS still governs row visibility/ownership).

### Middleware

- None new. `clients.create`/`clients.update` use the existing
  `requireOrgPermission('manageClients')` (built on `organizationProcedure` /
  `protectedProcedure`), exactly like `crews.create`/`crews.update`.

### Procedures

| Procedure        | Input                                                                                                                                                                                              | Output                                | Roles allowed                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| `clients.create` | `{ organizationId: uuid, display_name: string (min 1), kind: 'individual'\|'company', email?: string, phone?: string, company_name?: string }`                                                     | the new client row (`CLIENT_COLUMNS`) | `manageClients` (owner/admin/dispatcher) |
| `clients.update` | `{ organizationId: uuid, clientId: uuid, display_name?, kind?, status?: 'active'\|'inactive'\|'lead', email?, phone?, notes?: string\|null, company_name? }`, refined so at least one field is set | `{ id: clientId }`                    | `manageClients`                          |

`organizationId` is the implicit input every `requireOrgPermission`-based
procedure already carries from the chained `organizationProcedure`
(`crews.create`/`crews.update` don't restate it in their own `.input()`
call for the same reason). All organization scoping in both procedures
uses `ctx.organizationId` (verified server-side by the middleware), never
a client-supplied value, matching `crews.ts` exactly.

- Both follow `crews.ts`'s `toTRPCError` mapping (`23505` → `CONFLICT`,
  `42501` → `FORBIDDEN`, `P0002`/`23503` → `BAD_REQUEST`, else
  `INTERNAL_SERVER_ERROR`), each wrapped in `Sentry.startSpan`.
- Email is trimmed and lowercased (the DB check requires
  `email = lower(email)`); blank email/phone normalize to `null`.
- `create` sets `organization_id: ctx.organizationId`, `status: 'active'`
  (DB default, not an input), and `company_name: kind === 'company' ? (input.company_name ?? display_name) : null`.
- `update` only includes keys that were actually provided (same
  spread-if-defined style as `crews.update`), scoped by
  `.eq('organization_id', ctx.organizationId).eq('id', input.clientId)`; 404s
  as `NOT_FOUND` if no row matched.

### Routes and UI

| Route                   | Screen                        | States (loading, empty, error, populated)                                                                                                                          |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/_authed/clients`      | Clients list                  | Loading (initial `clients.list` fetch), query error with retry, empty ("no clients yet"), filtered-empty ("no clients match"), populated table                     |
| `/_authed/clients`      | Add client modal              | Idle/validating (name required), submitting (disabled button), mutation error (toast, modal stays open for retry)                                                  |
| `/_authed/clients?id=…` | Client profile — Overview tab | Contact fields (name, type, phone, email) edit via `InlineEdit`/`SelectInput` → `updateClient`; save-error toast, optimistic update reverts on settle if it failed |
| `/_authed/clients?id=…` | Client profile — Notes tab    | Empty ("No notes yet" placeholder in the box), editable, save-error toast                                                                                          |
| `/_authed/clients?id=…` | Client profile — other tabs   | Unchanged: Service history/Scheduled/Invoices/Timeline/property fields keep reading `useTenant()` mock data and existing empty states                              |

- `src/integrations/clients/clients.ts`: keep `useClients()`; add
  `export type ClientRow = inferRouterOutputs<TRPCRouter>['clients']['list'][number]`
  and `useClientMutations()` (modeled on `useCrewMutations()`): `createClient`,
  `updateClient(clientId, patch)`, optimistic cache patch on the
  `clients.list` query key, `onError` toasts, `onSettled` invalidates.
- `clients.tsx`: replace `t.clients` / `t.client(id)` with the live
  `useClients()` query for the table, counts, search, sort, and the drawer's
  identity lookup (D4). Keep `useTenant()` for everything the drawer still
  renders from mock data (jobs, invoices, requests, properties, crew/service
  lookups) and for `t.role`-based permission checks (D3).
  Add the loading/error states listed above around the table (mirroring the
  `requests.tsx` pattern: loading row, `Alert` with a retry button on query
  error).
- **Field-name and nullability fixes** (the live `ClientRow` is not shaped
  like the mock `Client`): every former `client.createdAt` read becomes
  `client.created_at` (the table's "Recent" sort, the drawer subtitle's
  "Client since …", and the Timeline's "Became a client" event). Every
  former bare `client.phone` / `client.email` read — the search filter's
  `client.phone.replace(/\D/g, '')`, the two `InlineEdit` `value` props, the
  `tel:`/`mailto:` links, and the two table-cell displays — coalesces to
  `?? ''` (`client.phone ?? ''`, `client.email ?? ''`), the same treatment
  the plan already applies to `notes`. `InlineEdit`'s `onSave` still
  receives the edited string as-is; saving an emptied field sends `null`
  server-side (`clients.update` normalizes blank `phone`/`email` to `null`
  before writing, same as it does for `notes`).
- `AddClientModal`: drop the address/lawn/gate/pets/instructions fields
  (including the `address_line1` half of the `valid` gate, keeping only the
  `display_name` check), keep name/type/phone/email, call `createClient`
  (D1/D2), and on success navigate to the new client's id (same `onCreated`
  flow as today).
- `OverviewTab`: contact-info fields call `updateClient` instead of
  `actions.updateClient`; the Type select sends `company_name` alongside
  `kind` per D1. Property cards below are unchanged (mock, D4-adjacent
  limitation per D6/Q4).
- `NotesTab`: replace the note list + "add note" form with a single
  `InlineEdit` (multiline) bound to `client.notes ?? ''`, saving via
  `updateClient(client.id, { notes: v })` on blur, keeping the existing
  `EmptyState` when blank. The Tabs header's "Notes" entry drops its `count`
  (no longer `client.notes.length`, since `notes` is now `string | null`, not
  an array; a character count would be a meaningless badge).
- `TimelineTab`: drop the `client.notes.map(...)` segment (D6); keep the rest.
- Footer status `SelectInput` calls `updateClient(client.id, { status })`.
- Remove the now-unused `Client`/`ClientNote` mock type imports from
  `clients.tsx` once no call site references them.
- Table/stat cards: counts, "Commercial accounts", and "Active clients" are
  computed from the live list; "Lifetime value"/"Outstanding" keep using
  `t.clientLifetimeValue`/`t.invoices` but now scoped to the real list's ids
  (D5), so they read `$0` rather than a stale, unrelated total.

### Acceptance criteria

1. The Clients table, stat-card counts, search, and sort read `clients.list`
   for the active organization; no mock client rows ever appear in the table.
2. "Add client" creates a real, organization-scoped client row via
   `clients.create` and navigates to its profile; a commercial client gets a
   non-empty `company_name` automatically.
3. The Overview tab's name/type/phone/email fields and the footer status
   selector persist through `clients.update` and reflect optimistically, with
   an error toast and reversion on failure.
4. The Notes tab is a single editable field bound to `clients.notes`, saved on
   blur via `clients.update`, with an empty-state placeholder when blank.
5. Service history, Scheduled, Invoices, the property fields in Overview, and
   the Timeline tab (minus per-note events) keep rendering today's mock-store
   content/empty-states, unchanged in behavior.
6. `clients.create`/`clients.update` reject unauthenticated callers, reject
   callers without `manageClients`, validate input (non-empty name, valid
   kind/status/email shape), scope strictly to `ctx.organizationId`, and map
   Postgres errors the same way `crews.ts` does.
7. The list shows a loading state while `clients.list` is pending and an
   error state with a retry action if it fails; it never silently shows mock
   data as a fallback.
8. No call site reads `client.createdAt` (the live row has `created_at`) or
   treats `client.phone`/`client.email` as a non-nullable string; a client
   with a blank phone or email, and the "Recent" sort, the drawer subtitle,
   and the Timeline's "Became a client" event all work without throwing.
9. `pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit`
   all pass.

## Commits

1. `Add clients.create and clients.update procedures` (implementer): the two
   mutations in `src/integrations/trpc/clients.ts`, plus unit tests following
   `clients.test.ts`/`crews.mutations.test.ts`.
2. `Read and write live clients on the Clients page` (implementer):
   `useClientMutations()`, the `ClientRow` type, and the `clients.tsx` rewire
   described above (list, add-client modal, Overview contact fields, Notes
   tab, status selector, loading/error states).
3. `Document the live Clients screen` (implementer): `docs/clients/ui.md` +
   shots for the list, add-client modal, and profile drawer (Overview +
   Notes), captured while verifying in the running app.

## Unhappy paths

- `clients.list` fails: show an error with a retry action; never fall back to
  mock rows.
- `clients.create` fails (validation, permission, conflict, or network): toast
  the error message; the modal stays open with the entered values so the user
  can fix and resubmit.
- `clients.update` fails: the optimistic patch reverts on `onSettled`'s
  invalidate/refetch; toast the error so the user knows the edit didn't save.
- A client id in the URL isn't in the loaded list (stale link, deleted,
  still loading): the drawer simply doesn't render, matching today's
  behavior with `t.client(id)`.
- User without `manageClients` (mock role): unchanged — `PageShell`'s
  `allowed` gate blocks the whole page, same as today; the server
  independently rejects the mutations regardless of what the mock role shows.
- Switching `kind` to `company` without a company name in the UI: the client
  auto-supplies `company_name` from the current/new `display_name` so the DB
  constraint never trips from this page.

## Out of scope

- Wiring Service history, Scheduled, Invoices, properties, or the request/job
  parts of Timeline to real data.
- A per-entry notes timeline/table (`client_notes`), multi-note authorship, or
  timestamps on notes.
- Property creation/editing, address search, or the property fields in
  Overview.
- Record payment, invoicing actions, or anything under the Invoices tab.
- Switching the page's permission gate from the mock `t.role` to
  `useOrganization()` permissions.
- `pnpm db:types` (no schema change).

## Dependencies not to add

- No new packages.

## Verify command

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

- Run the exact verify command on the PR head.
- Verify in the running app, signed in as office staff: add a residential and
  a commercial client, confirm both appear with correct type/status; edit
  name/phone/email/type/status and confirm they persist after a reload; add,
  edit, and clear a note and confirm it persists after a reload.
- Verify the other drawer tabs still render their existing mock
  content/empty-states unchanged.
- Verify a worker-role mock user still sees the existing no-access state.
- Reviewer and security agent must pass before merge.

## Audit log

### Round 1 (general-purpose fallback; custom `plan-auditor` unavailable): needs-changes, confidence high

| #   | Blocking finding (recurring?)                                                                                                                          | Resolution (fixed / rejected: reason / escalated)                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Notes` tab header count badge still used `client.notes.length`, but `notes` is now `string \| null` (no)                                              | Fixed: dropped the `count` on the Notes tab entirely (D8).                                                                                                           |
| 2   | Three call sites read `client.createdAt` (mock camelCase); the live column is `created_at` (no)                                                        | Fixed: table "Recent" sort, drawer subtitle, and Timeline's "Became a client" event all switched to `created_at` (D8).                                               |
| 3   | `phone`/`email` are nullable DB columns but were read as non-nullable strings in the search filter, two `InlineEdit`s, and `tel:`/`mailto:` links (no) | Fixed: all coalesced to `?? ''`, mirroring the existing `notes ?? ''` treatment; blank-to-`null` normalization on save already existed in the procedure design (D8). |

- **Non-blocking**: adopted `display_name` trim in zod (noted for
  implementer); `AddClientModal`'s `valid` gate drops its `address_line1`
  half (already implied, now stated explicitly in Changes); unused mock type
  imports are removed as part of the rewire (routine, caught by lint/tsc).
- **Unresolved**: none.
- **Pre-existing**: none.

### Round 2 (general-purpose fallback; custom `plan-auditor` unavailable): pass, confidence high

| #   | Blocking finding (recurring?) | Resolution (fixed / rejected: reason / escalated) |
| --- | ----------------------------- | ------------------------------------------------- |
|     |                               |                                                   |

- **Non-blocking**: two table-cell `{client.phone}`/`{client.email}` reads
  weren't in round 1's enumeration — added to the `?? ''` coalescing list
  (D8 and Changes). Clarified that `organizationId` in the Procedures table
  is the implicit input inherited from `organizationProcedure`, matching
  `crews.ts`'s pattern, not a redundant client-supplied scoping value — added
  a one-line note under the Procedures table.
- **Unresolved**: none.
- **Pre-existing**: none.

## Scope-change log

_None._
