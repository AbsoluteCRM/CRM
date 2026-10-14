# Plan: Persist Crew builder edits

- **Slug / branch**: `crew-builder-persist` / `feature/update-crews`
- **Tier**: full (migration, tRPC, `src/routes/**` consumer)
- **Status**: implemented
- **Confidence**: ~92%. Scope, save timing, and the one-crew rule are user-confirmed. Procedure shapes and the missing DELETE grant fix are agent defaults.

## Original request

> Let's add in the functionality to update a crew with the drag drop feature.

## Goal

On `/teams` → Crew builder, every board edit is saved: create crew, rename, set lead, set vehicle, and drag-drop member moves (including to/from Unassigned). Each action saves immediately, optimistic UI with rollback + toast on error. A member belongs to at most one crew; a move replaces the old assignment. Office roles (owner/admin/dispatcher) can edit; others stay read-only.

## Decisions

| #   | Question                   | Answer                                                     |
| --- | -------------------------- | ---------------------------------------------------------- |
| Q1  | Which edits persist?       | All: create, rename, lead, vehicle, moves.                 |
| Q2  | When saved?                | Immediately per action; optimistic with rollback on error. |
| Q3  | Multiple crews per member? | No. One crew; move replaces. Enforced on save.             |
| Q4  | Unassigned column contents | All non-disabled org members not in a crew (done earlier). |

Agent defaults:

- **D1**: Moves/lead changes are SQL functions called via `.rpc()` (ADR 0009: multi-step writes) so remove+add is atomic.
- **D2**: Enforce one-crew in the function (delete the member's rows in other crews of the org), not by a new unique index, so existing data can't block the migration.
- **D3**: Crew create/rename/vehicle use plain `ctx.supabase` table writes (single statement, RLS governs).

## Open questions

- None blocking. Assumed below.

## Assumptions

| Assumption                                                                                                                                                     | User-confirmed? |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `crew_members` has no explicit DELETE grant. **Wrong**: the foundation migration leaves `authenticated` with default SELECT and DELETE, so no grant is needed. | n/a             |
| Duplicate crew names (case-insensitive, non-archived) surface as a unique violation → CONFLICT toast.                                                          | no              |
| Color for a new crew continues to be picked client-side from `CREW_COLORS`.                                                                                    | no              |

## Layers touched

- [x] Migration: functions `set_crew_member(crew, member)` (move; `crew` null = unassign) and `set_crew_lead(crew, member)`
- [x] RLS: unchanged policies; add pgTAP/SQL checks if the repo has the harness
- [x] `docs/database` (crews-routing.md: functions, one-crew rule)
- [x] Types (`pnpm db:types`)
- [x] tRPC procedures
- [x] UI components (`CrewBuilder.tsx`)
- [x] Stories, Tests
- [x] Sentry spans
- [ ] Design record: update `docs/teams/ui.md` if present

Security-gated: migrations, tRPC. `security` agent gates the merge.

## Changes

### Schema

Migration `crew_builder_mutations`:

- `public.move_crew_member(p_organization_id uuid, p_member_id uuid, p_crew_id uuid)` — `security invoker`; deletes the member's `crew_members` rows in the org, then inserts into `p_crew_id` if not null (`is_lead=false`). Moving out of a crew that the member leads simply drops the lead.
- `public.set_crew_lead(p_organization_id uuid, p_crew_id uuid, p_member_id uuid)` — clears `is_lead` in the crew, then sets it for `p_member_id` (must already be a crew member; null clears). Respects `crew_members_one_lead_idx`.
- `revoke execute ... from public, anon; grant execute ... to authenticated`; fixed `search_path`.

### Procedures (all `protectedProcedure`, input has `organizationId`, use `ctx.supabase`)

| Procedure          | Input                                       | Output | Roles (via RLS) |
| ------------------ | ------------------------------------------- | ------ | --------------- |
| `crews.create`     | `{organizationId, name, color?}`            | crew   | office staff    |
| `crews.update`     | `{organizationId, crewId, name?, vehicle?}` | crew   | office staff    |
| `crews.moveMember` | `{organizationId, memberId, crewId\|null}`  | void   | office staff    |
| `crews.setLead`    | `{organizationId, crewId, memberId\|null}`  | void   | office staff    |

Errors: unique violation → `CONFLICT`; RLS/permission → `FORBIDDEN`; else `INTERNAL_SERVER_ERROR`. Each wrapped in `Sentry.startSpan`.

### UI

`CrewBuilder` stays presentational-ish: gets mutation callbacks as props (`onCreate`, `onUpdate`, `onMove`, `onSetLead`) from `teams.tsx` via mutation hooks in `src/integrations/crews/crews.ts`. Hooks use optimistic update on the `crews.list` query cache (`onMutate` patch, `onError` rollback + toast, `onSettled` invalidate). The local `LocalCrew` state and seed-once effect are removed; the board derives from the query cache. Newly created crew shows optimistically with a temp id until settled. The "Changes are not saved yet" hint is removed.

### Acceptance criteria

1. Dragging a member to a crew persists across reload; dragging to Unassigned removes them.
2. A member is never in two crews after any move.
3. Renaming, vehicle, lead, and create persist across reload.
4. Failure (e.g. duplicate name, RLS denial) rolls the UI back and shows an error toast.
5. A worker/non-office role sees the board read-only and the procedures reject them.
6. Cross-tenant: passing another org's ids changes nothing / errors.

## Commits

1. `Add crew mutation functions` (main agent: migration applied to remote, types regen)
2. `Add crews mutation procedures with tests` (implementer)
3. `Persist crew builder edits with optimistic updates` (implementer: hooks, CrewBuilder, teams.tsx, stories)
4. `Document crew mutations` (implementer: docs)

## Unhappy paths

- Duplicate crew name → CONFLICT, rollback, toast.
- Move to an archived/other-org crew → FK/RLS failure, rollback.
- Two quick drags of one member → mutations serialized per member via `mutationKey`/`scope`; last write wins, refetch on settle.
- Function fails midway → single statement transaction, nothing partially applied.
- Member disabled/removed after load → FK error, rollback, refetch.

## Out of scope

Archiving/deleting crews, default start time / max minutes / locations, scheduling use of crews, realtime sync between users.

## Dependencies not to add

None.

## Verify command

```
pnpm lint && pnpm check && pnpm exec tsc --noEmit && pnpm exec vitest run
```

## Verification

Workflow Definition of done: procedure tests (cross-tenant, multi-org, per-role), stories with interaction tests, verified in the running app, reviewer + security passed, docs updated.

## Audit log

_Skipped by user decision: `plan-auditor` model unavailable in this environment._

## Scope-change log

- `crews.create` is not optimistic (waits for the server id), so a temp-id crew can't be edited before it exists.
- Added `can.manageCrews` (non-worker) for the procedures; `/teams` `editable` still uses `manageTeam`.
- Migration applied to the remote by the user: the Supabase MCP isn't available in this session.
- The default DELETE grant on `crew_members` was missing on the remote ("permission denied"), so a follow-up migration grants it explicitly.
