# Plan: Wire real crews into the Crew builder

- **Slug / branch**: `crew-builder-live-data` / `feat/crew-builder-live-data`
- **Tier**: full (routes/UI change, `src/routes/**` is a security-gated path)
- **Status**: implemented
- **Confidence**: 95%; scope, display fields, and the local-state approach are
  user-confirmed. Internal naming/structure are agent defaults.

## Original request

> Let's connect the fetch to the UI. It should on the Teams Route. and it
> should display in the crewBuilder Component. For now just display the
> crews. It should return nothing to start as I haven't populated the DB

Follow-up decisions (below) narrowed this to replacing the mock drag-and-drop
board with one driven by real data, keeping drag-and-drop but not persisting
it yet.

## Goal

The Crew builder tab on `/teams` shows real crews (from `crews.list`) and
real team members (from the existing `useTeamMembers`) instead of the mock
`useTenant()` data. Creating a crew, renaming it, setting its lead/vehicle,
and dragging members between crews still work in the browser, but only as
local component state — nothing is sent to the server yet. Since the `crews`
table is empty, the board starts with no crew columns, just the "Unassigned"
pool of every real worker.

## Decisions

| #   | Question                                                     | Answer                                                                                                            |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Q1  | Replace the mock board, or add a real list alongside it?     | Replace the mock drag-and-drop board. Keep drag-and-drop working; don't wire create/update mutations yet.         |
| Q2  | Member cards show mock-only fields (title, availability)?    | No. Simplify to name, avatar, and role/status badges — the real team member data has no title or availability.    |
| Q3  | Keep the "jobs today" per-crew count?                        | No. Drop it; it was computed from mock jobs keyed to mock crew ids, which won't match real crew ids.              |
| Q4  | Persist local edits (add/rename/lead/vehicle/drag) anywhere? | No. Local-only React state, not saved, resets on reload. Acceptable until mutations are wired later.              |
| Q5  | Also fix the "Crews" stat card and crew-builder tab count?   | Yes. Both switch from the mock count to the real `crews.list` count, so they don't mismatch what the board shows. |

Agent defaults (the user may veto):

- **D1**: Extract the crew builder (`MemberCard`, `CrewColumn`,
  `CrewBuilder`, `CREW_COLORS`) out of `teams.tsx` into
  `src/components/team/CrewBuilder.tsx`, mirroring how `MembersTab` was
  extracted: a pure component taking data as props (no `useTenant()`, no
  tRPC/org-context hooks inside it), so it can get a Storybook story the same
  way `MembersTab.stories.tsx` does.
- **D2**: Export a `Crew` type from `src/integrations/crews/crews.ts` via
  `inferRouterOutputs<TRPCRouter>['crews']['list'][number]` (verified this
  resolves `crew_members` as `Array<{ member_id: string; is_lead: boolean }>`,
  not a loose type, by a throwaway `tsc` probe). `TeamMember` is already
  exported from `teams.ts` the same way (by hand, since that hook isn't
  tRPC); this is the tRPC-router equivalent.
- **D3**: Internal local-only shape, derived once from the fetched `Crew` and
  then mutated locally:
  ```ts
  type LocalCrew = {
    id: string
    name: string
    color: string | null
    vehicle: string | null
    memberIds: Array<string>
    leadId: string | null
  }
  ```
  Seeded from `crews.data` the first time it's defined (a `useRef` seeded
  flag), so a later refetch doesn't clobber in-progress local edits. New
  crews created in the UI get a client-generated id (`crypto.randomUUID()`).
- **D4**: The "Unassigned" pool and crew rosters both read from the real
  `members: Array<TeamMember>` prop (the same `useTeamMembers()` data the
  page already fetches for the Team list tab), filtered to
  `role === 'worker' && status !== 'disabled'`, matching the current mock
  filter exactly.
- **D5**: Card click-to-open-profile is dropped for this board. The mock
  `MemberProfile` drawer looks members up in the mock store by id
  (`t.member(id)`), which won't resolve for real member ids, and wiring a
  real profile drawer is out of scope. Drag-and-drop, by contrast, is pure
  local state and works fine with any id. (`MembersTab`'s rows already don't
  open a profile either, so this isn't a new inconsistency.)
- **D6**: Loading/error states mirror `MembersTab`: a message in place of the
  board while `crews` is loading, an alert if it errors, otherwise the
  interactive board (seeded once).
- **D7**: Role/status on a card use the same `Badge`/`StatusBadge` and role
  label/tone mapping `MembersTab` already uses (copied locally, same comment
  about not pulling in org context, rather than exporting one from
  `MembersTab` and creating a coupling between the two components).

## Open questions

- None.

## Assumptions

| Assumption                                                                  | User-confirmed?        |
| --------------------------------------------------------------------------- | ---------------------- |
| It's fine for drag-and-drop/rename/lead/vehicle to be ephemeral (not saved) | yes                    |
| Dropping click-to-profile on crew cards is acceptable                       | no (agent default, D5) |

## Design refs

- Mock: none; this reshapes the existing Crew builder tab in place.
- Screens: no `docs/<feature>/ui.md` exists for teams; not adding one since
  this isn't a new screen, just restating an existing one on real data. (Say
  so in the PR.)

## Layers touched

- [ ] Migration, RLS, `docs/database`: none
- [ ] Middleware: none
- [ ] tRPC procedures: none (`crews.list` already exists)
- [x] Hook (`src/integrations/crews/crews.ts`): add the exported `Crew` type
- [x] Routes (`src/routes/_authed/teams.tsx`): call `useCrews()`, pass data
      down, remove the extracted mock code, fix the two real-count spots
- [x] UI components (`src/components/team/CrewBuilder.tsx`, new)
- [x] Stories (`src/components/team/CrewBuilder.stories.tsx`, new)
- [ ] Tests: no new procedure/unit tests (no new procedure); story
      interaction tests cover the component
- [ ] Sentry: none (no new server code)
- Design record: none, per above

Security-gated paths touched: `src/routes/**`. The `security` agent gates
the merge.

## Changes

### Hook

- `src/integrations/crews/crews.ts` adds:
  ```ts
  import type { inferRouterOutputs } from '@trpc/server'
  import type { TRPCRouter } from '#/integrations/trpc/router'

  export type Crew = inferRouterOutputs<TRPCRouter>['crews']['list'][number]
  ```
  Confirmed by a throwaway `tsc` probe that `Crew['crew_members']` resolves to
  `Array<{ member_id: string; is_lead: boolean }>`, not a loose type.

### Routes and UI

| Route/Component                             | Screen                       | States (loading, empty, error, populated)                                                                                                                                                |
| ------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/_authed/teams.tsx`              | Teams page, Crew builder tab | Delegates to `CrewBuilder`; "Crews" stat card and tab count use real `crews.data`                                                                                                        |
| `src/components/team/CrewBuilder.tsx` (new) | Crew builder board           | Loading: "Loading crews…" text. Error: red alert with message. Empty: just the Unassigned column with every real worker. Populated: real crew columns seeded once, then locally editable |

### Acceptance criteria

1. With an empty `crews` table, the Crew builder tab shows one "Unassigned"
   column listing every active real worker from `useTeamMembers`, and no
   crew columns.
2. Dragging a worker onto a (locally created) crew column moves them there in
   the UI; no network request is made for the move.
3. Creating a crew, renaming one, and setting its lead/vehicle all work and
   only affect local state; reloading the page reverts to whatever
   `crews.list` returns from the server.
4. The "Crews" stat card and the crew-builder tab's count badge match the
   number of crews `crews.list` returns, not a mock count.
5. Member cards show name, avatar, and role/status — no title, no
   availability badge, no per-crew "jobs today" count.
6. A Storybook story covers loading, error, empty, and populated-with-local-edit
   states for `CrewBuilder`.

## Commits

1. `docs: plan for wiring real crews into the crew builder` (main agent)
2. `Add Crew type to the crews hook` (implementer)
3. `Extract CrewBuilder with real data and local-only editing` (implementer)
4. `Wire CrewBuilder into the teams route; fix real crew counts` (implementer)
5. `Add CrewBuilder story` (implementer)

## Unhappy paths

- `crews.list` errors: an alert in place of the board, matching
  `MembersTab`'s error treatment.
- `crews.list` still loading: a loading message in place of the board.
- A worker with no crew shows up in "Unassigned"; a crew with no members
  shows its "Drop team members here" placeholder (unchanged from the mock
  version).

## Out of scope

- Persisting any crew builder edit to the database (no `crews`/`crew_members`
  mutations yet).
- Click-to-open-profile from a crew card.
- Any other tab (Availability, Performance) or the Member profile drawer;
  they keep using mock `t.crews`/`t.jobs`/`t.members` untouched.
- The Performance tab's `useMetrics`, which also reads mock `t.crews`/`t.jobs`.

## Dependencies not to add

- None.

## Verify command

```
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit
```

## Verification

- tsc, lint, and prettier pass.
- A Storybook story exists for `CrewBuilder` with interaction coverage for
  drag-and-drop (or an equivalent assertion against the exposed local-state
  behavior), loading, error, and empty states.
- Manually verified in the running app (per CLAUDE.md's Done definition):
  the Crew builder tab renders with zero crews against the (actually empty)
  database.

## Audit log

_Plan audit skipped by user: plan-auditor model (opus) is unavailable in this
environment (same constraint hit on the crews-list plan just before this
one)._

### Review (`reviewer`): pass, confidence medium

No blocking findings. Non-blocking notes: no drag-and-drop interaction test
(HTML5 DnD isn't reliably testable via Testing Library, per the plan); a
one-commit flash of "all workers in Unassigned" before the seed effect runs;
local edits reset when switching away from the Crews tab and back (component
unmounts; not a violation of Q4/AC3, which only promise reset-on-reload, but
worth noting as a known limitation); a few documented edge cases around
non-worker/disabled crew members and a stale lead selection. None are
security- or correctness-blocking.

### Review (`security`): pass, confidence high

No blocking findings. Confirmed: no new server/schema/tRPC code; all crew
edits are local `setLocalCrews` calls with no network effect; `useCrews`
remains org-scoped via `useOrganization()` and `protectedProcedure`; no
secrets, no `dangerouslySetInnerHTML`, no raw SQL/filter construction; drag
data (`text/member-id`) is only resolved against the already-fetched member
list, so a forged id renders nothing. One `could_not_verify` item asked
whether `crews`/`crew_members` RLS actually covers the `worker` role — this
was already verified in the prior `crews-list` PR's security review
(`docs/plans/crews-list.md`'s Review section), which read
`docs/database/rls.md` and the `crews` migration directly and confirmed S
(select) for worker as well as staff. This diff changes no RLS.

## Scope-change log

_None._
