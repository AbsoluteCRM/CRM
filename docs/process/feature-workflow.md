# Feature workflow

This is how every change to AbsoluteCRM is made, by agents and humans alike.
A feature is owned end to end: schema, middleware, backend, and frontend ship
together as **one vertical-slice PR**, built across as many commits as it
needs.

The loop:

```
Question ──▶ Plan ──▶ Audit ──▶ Approve ──▶ Implement ──▶ Review ──▶ Merge
   ▲           ▲         │                     │    ▲        │
   │           └─ fixes ─┘                     │    └ fixes ─┘
   └──────── user decision needed ◀────────────┘ (scope change)
```

The decision records for these rules are
[docs/plans/ai-workflow.md](../plans/ai-workflow.md) and
[docs/plans/agent-roster.md](../plans/agent-roster.md).

## Agents

The roster lives in [.claude/agents/](../../.claude/agents/). Each agent pins
its own model and effort, so dispatch it by `subagent_type` and **leave out
`model`**.

| Agent          | Model  | Phase       | Job                                                                                |
| -------------- | ------ | ----------- | ---------------------------------------------------------------------------------- |
| `plan-auditor` | opus   | 3 Audit     | Defeat the written plan. Read-only                                                 |
| `implementer`  | sonnet | 4 Implement | Build the approved plan in an isolated worktree; push each commit to the PR branch |
| `reviewer`     | opus   | 5 Review    | Defeat the branch diff before merge. Read-only                                     |
| `security`     | opus   | 5 Review    | Hard gate on security-gated paths (below). Read-only                               |

The three read-only agents share one contract:

- **Standard of proof**: a blocking finding needs a location, evidence the
  agent read or ran, the written rule or user decision it breaks, and the
  concrete failure. Absence of a written rule is not a finding, and a clean
  pass is a legitimate result.
- **Named doubt**: an `unresolved` (or `could_not_verify`) entry with what was
  tried and what would settle it. Low confidence requires one.
- **JSON verdict** with a mandatory `checked_clean` list, and `pre_existing`
  for real defects the change doesn't introduce.
- **No writes**: they have Read, Bash, WebFetch, and the Supabase list and
  inspect tools only. They can't run SQL or the advisors; a query that would
  settle something comes back in `unresolved` with its exact SQL, and the
  main agent runs it. After each run, the main agent checks `git status`.

Tools without sub-agents run the same agent file's instructions in a fresh
session.

**Security-gated paths**: `supabase/migrations/**`,
`src/integrations/trpc/**`, `src/integrations/auth/**`,
`src/integrations/organization/**`, `src/lib/supabase/**`, `src/server/**`,
`src/env.ts`, `src/routes/**`, `docs/database/rls.md`, and `.env.example`.

## Tiers

| Tier      | Applies to                                                                                            | Loop                                                          |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Full**  | `feat/` and `db/` work, and any change that touches schema, auth/tenancy, or more than one layer      | Every phase below, with a plan file in `docs/plans/<slug>.md` |
| **Light** | Small `fix/` and `chore/` work in one layer with no schema or auth change, and `db/revert-<slug>` PRs | Every phase except the audit; the plan goes in the PR body    |

When unsure which tier applies, ask the user. The light tier skips only the
audit. It still runs in plan mode, still asks questions until the confidence
gate is met, and still shows the user a short plan before any code is written.
That plan covers the goal, what changes, the confidence, open questions, and
assumptions.

## Plan mode

Phases 1–3 run in the agent's **native plan mode**, which is read-only.

- **Claude Code**: if the session isn't already in plan mode, call
  `EnterPlanMode`, or ask the user to press Shift+Tab, before doing anything
  else. Approving the plan when the agent calls `ExitPlanMode` is the go
  signal. Tell the user the plan file's path (`~/.claude/plans/…`) so a later
  session can resume from it.
- **Tools without a plan mode**: follow the user's stated preference for how
  approval is given, and ask if they haven't stated one. Write the plan
  uncommitted to `docs/plans/<slug>.md`: no branch, no other files.

No branch, files, migrations, or code before approval.

## Phase 1: Question

1. Read before asking:
   - [CLAUDE.md](../../CLAUDE.md);
   - [docs/database/](../database/README.md) for anything touching data;
   - [docs/design/](../design/README.md) and the feature's `docs/<feature>/ui.md` for anything a user sees;
   - the existing code.
2. Load skills:
   - run the TanStack Intent check from [AGENTS.md](../../AGENTS.md) (`pnpm dlx @tanstack/intent@latest list`);
   - for schema work, load the `supabase` and `supabase-postgres-best-practices` skills.
3. For UI work, encourage the user to sketch the screens in Claude Design (or
   a similar tool) first. The mock is input to the plan and is recorded in
   the design record (below).
4. Ask the user questions in batches, offering a recommended answer where one
   exists, until the confidence gate is met.

### The confidence gate (95%)

Confidence means how much of the plan's material choices rest on **user
answers or facts verified in the repo**, rather than agent guesses. It is a
judgment, not a calculation, and it must be honest:

- An unconfirmed assumption that would change the outcome caps confidence
  below 95%.
- The plan lists every open question and every assumption, each marked
  user-confirmed or not.
- Never raise the number just to move on. Below 95%, keep asking.

## Phase 2: Plan

Write the plan from [docs/plans/\_template.md](../plans/_template.md) as the
plan-mode plan. It includes the user's original request verbatim, every
decision, and a **Changes** section per layer: files, procedures and inputs,
routes, migrations, and acceptance criteria. After approval, it is committed
as `docs/plans/<slug>.md`.

## Phase 3: Audit

Try to defeat the plan before building it.

- **Who audits**: a fresh `plan-auditor` each round, dispatched by
  `subagent_type` with no `model`. Never a `fork`, because a fork inherits
  the planner's context and blind spots.
- **What it gets**: the plan's path, the user's original request verbatim,
  the user decisions (fixed, not to be re-litigated), and what the planner
  already verified. On a re-audit it also gets the previous findings and what
  changed, and it audits the whole plan again.
- **What it returns**: the JSON verdict described under [Agents](#agents):
  `pass` or `needs-changes`, with `blocking`, `non_blocking`, `unresolved`,
  `pre_existing`, and `checked_clean`.
- **Handling findings**:
  - The planner checks the auditor's factual claims against the repo before
    acting on them.
  - Every blocking finding is recorded in the plan's Audit log as fixed,
    rejected with a reason, or escalated. Non-blocking notes are adopted or
    noted.
  - The planner may not reject a blocking finding without the user agreeing.
  - A finding that needs a user decision sends the work back to Phase 1.
  - An `unresolved` query: the planner runs it (or asks the user), then
    re-audits.
- **Loop end**:
  - A `pass` ends the loop.
  - A finding marked `recurring: true` (it survived a fix, so it wasn't
    understood), or one saying the _approach_ is wrong, escalates to the user
    at once.
  - Otherwise, up to 3 rounds; then escalate with the full history.
  - Escalate by asking the user a question, not by calling `ExitPlanMode`.
    If the user approves with a blocking finding still open, log it as a user
    override.

## Approval

The plan's status moves through these states:

- `draft`;
- `audited`, once the last round is clean and logged;
- `approved`, once the user approves on leaving plan mode;
- `implemented`, set in the PR that ships it.

Any material edit after the last clean round resets the status to `draft` and
needs a new audit round, unless the user explicitly waives it, which is
logged. This includes edits made after the user rejects the plan with
feedback.

## Phase 4: Implement

1. Create the branch from a freshly fetched `origin/main`: `feat/<slug>`,
   `fix/<slug>`, `db/<slug>`, or `chore/<slug>`. Schema that is part of a
   feature stays on `feat/`; `db/` is for schema-only work. Older `feature/*`
   branches predate this convention.
2. Commit the plan file first, push, and open a **draft PR**.
3. Build the layers in this order: migration → `docs/database` →
   `pnpm db:types` → middleware → procedures → routes/UI → stories/tests →
   design record.
   - **The main agent** does the remote-database steps itself, because only
     it writes to the remote: the migration file, `apply_migration`, the
     version rename, and regenerating types. Each is an ordinary commit on
     the PR branch.
   - **The `implementer`** builds the code layers. Dispatch it with the plan
     path, the PR branch name, the commits to make, the canonical files to
     imitate, the non-goals, and the Definition of done. It works in its own
     worktree and pushes each commit to the PR branch.
   - **One writer at a time on the PR branch.** While an implementer is
     dispatched, the main agent doesn't commit to the branch. It runs
     `git pull --ff-only` before and after each dispatch.
4. After the merge, remove every implementer worktree this PR used (a review
   loop creates one per dispatch): check `git worktree list`, then
   `git worktree remove` each one under `.claude/worktrees/` and delete its
   temporary branch.

### Scope changes

If implementation shows that the plan is wrong, **stop**. No silent pivots.

1. Update the plan and add a Scope-change log entry.
2. If confidence drops below 95%, ask the user.
3. If the change is material, re-enter plan mode, re-audit, and get the
   user's approval again before continuing. Log that approval.

## Phase 5: Review

1. Run the Definition-of-done checks and the plan's exact verify command on
   the PR branch head, in the main checkout. These include anything that
   needs `.env.local`, which the implementer's worktree doesn't have.
2. Dispatch a fresh `reviewer` with the plan path, the request, and the PR
   branch.
3. If the diff touches any security-gated path (see [Agents](#agents)),
   dispatch a fresh `security` agent after the reviewer passes.
4. Record each verdict in the plan's Audit log, under a Review heading. For
   light-tier work, which has no plan file, record it in the PR body under
   the pasted plan.

On `needs-changes` or `reject`:

- Hand the findings to the implementer **verbatim**: file, line, rule, and
  failure or attack path. The failure is the acceptance criterion.
- The first failure goes back to the implementer. On the second, re-dispatch
  it with `model: "opus"`. A third failure escalates to the user with the
  full history.
- A finding marked `recurring: true`, or one saying the approach is wrong,
  escalates at once.
- Any fix voids every earlier pass. Re-run step 1, then send a **fresh**
  reviewer (and security agent, if gated) over the **whole** diff, with the
  previous findings as history.

## Merge

The main agent merges without asking only when **every** condition holds,
checked fresh on the PR head:

1. The plan's exact verify command passes, and so do the Definition-of-done
   checks that apply.
2. The latest `reviewer` verdict is `pass`.
3. If security-gated paths changed, the latest `security` verdict is `pass`.
   A pass with `confidence: low` doesn't count.
4. `main` has been merged into the branch with no conflicts, and step 1 was
   re-run after that.
5. The plan's status is `implemented` (light tier: the plan pasted in the PR
   body says so), and the PR body has the ticked Definition of done, with a
   reason for each N/A item.
6. The PR is out of draft (`gh pr ready`).

Then run `gh pr merge --merge`. There is no CI here, so condition 1 is the
build gate. If any condition fails, stop and report. "Probably unrelated"
never justifies a merge.

## Layer rules

### Schema

Follow the steps in [docs/database/README.md](../database/README.md#toolchain-and-workflow).
In addition:

- **Only the main agent writes to the remote database**: `apply_migration`,
  data writes, the advisors, and pgTAP runs. The implementer has no Supabase
  tools, and the read-only agents have list and inspect tools only.
- Apply migrations to the remote only **after the plan is approved**.
- Before applying, compare `list_migrations` with `supabase/migrations/` on
  `main` plus your branch, matching by name.
  - Remote-only migrations that belong to another open branch or PR are
    expected.
  - Stop and tell the user about any others.
- After applying, rename the local file to the version `apply_migration`
  assigned.
- Types: `src/types/database.ts` mirrors the Supabase project
  ([ADR 0009](../database/decisions/0009-supabase-js-data-access.md)).
  Before running `pnpm db:types`, the project's migrations must equal
  `main`'s plus this branch's plus other open PRs'; if they don't, stop and
  tell the user. Regenerate after merging `main` in; never hand-merge
  `database.ts`. (The remote was rebaselined to match the migrations on 2026-10-07.)
- New app-callable functions: put them in `public`, `revoke execute … from
public, anon`, and grant to `authenticated`. Supabase also grants
  `service_role` execute by default, so revoke it explicitly where it should
  be denied. Default to `security invoker`; a `security definer` function
  needs an `auth.uid()` or membership check and an entry in the accepted
  advisor findings in `docs/database/rls.md`.
- **Abandoned feature**: its migration is already on the remote. A light-tier
  `db/revert-<slug>` PR to `main` commits that migration, a revert
  migration, and the `docs/database` update, so remote history and repo stay
  in sync.

### Middleware and tenancy

- Domain procedures use an authenticated, org-scoped procedure built on
  `protectedProcedure`, never `publicProcedure`.
- **Active org**:
  - The client may name the active org (route param, header, or cookie).
  - The server resolves it to an `active` membership of the current user,
    with that member's role, and rejects the request otherwise.
  - The result is exposed as `ctx.org`.
- **RLS is the access control**: user requests use `ctx.supabase`, the
  per-request Supabase server client built from the user's session
  ([ADR 0009](../database/decisions/0009-supabase-js-data-access.md)), so
  every policy applies, including role scoping.
- **The active-org filter is also required**: RLS admits every org the user
  belongs to (`private.my_org_ids()`). So every org-owned query and insert
  must also scope to `ctx.org.id`. Both are required, and neither replaces
  the other.
- **Trusted code only**: Supabase clients built with
  `SUPABASE_SERVICE_ROLE_KEY` bypass RLS, so they live only in
  `src/server/trusted/` (webhooks, cron, optimizer write-back, public token
  pages).

### Observability

- tRPC procedures: `Sentry.trpcMiddleware({ attachRpcInput: false })` on the
  base procedure in `src/integrations/trpc/init.ts`, which is server-only.
- `createServerFn` handlers: wrap them in `Sentry.startSpan` (see CLAUDE.md).

### UI

- Use shadcn/ui components, Tailwind, and the `#/` import alias.
- Route loaders prefetch with
  `context.queryClient.ensureQueryData(context.trpc.x.y.queryOptions())`,
  **but only once SSR auth exists** (see Bootstrapping). Until then, don't
  prefetch protected procedures in loaders; fetch them in the component
  with `useTRPC()`.

## Design record

The repo is the durable record of what was designed and built. It doesn't
depend on Claude artifacts or any other external store. See
[docs/design/README.md](../design/README.md).

- A design mock is optional, but encouraged for UI work.
- Every screen a feature adds or changes gets a section in
  `docs/<feature>/ui.md`, with shots in `docs/<feature>/shots/`. Shots are of
  the **implemented** UI, plus the mock when there was one. They are captured
  while verifying in the running app.
- The record is committed in the same PR as the code, so it never drifts.
- Every design decision the user makes goes in
  [docs/design/decisions.md](../design/decisions.md).
- `docs/database`, `docs/design`, `docs/plans`, and `docs/process` are
  reserved and can't be feature names.

## Definition of done

Copy this checklist into the PR body and tick it.

- [ ] `pnpm exec tsc --noEmit` is clean.
- [ ] `pnpm lint` and `pnpm check` pass.
- [ ] Tests for new procedures, including:
  - a cross-tenant test (org A can't read or write org B);
  - a multi-org test (a user in two orgs sees only the active org's rows);
  - per-role tests: owner, admin, dispatcher, and worker, plus rejection of
    portal users and non-members.
- [ ] Stories for new UI components, with `play` interaction tests as the UI
      tests. `pnpm exec vitest run` passes (needs
      `pnpm exec playwright install chromium`).
- [ ] Verified in the running app (`pnpm dev`), signed in as the seeded test
      user (`E2E_EMAIL` / `E2E_PASSWORD` in `.env.local`), using the `run`
      skill or Playwright. The shots for the design record come from this
      run.
- [ ] If the schema changed: the Supabase advisors show no new warnings,
      the pgTAP tests in `supabase/tests/` pass, and `docs/database` is
      updated.
- [ ] `docs/<feature>/ui.md` and its shots are updated; `docs/design/decisions.md`
      is updated if a design decision was made.
- [ ] The `reviewer` passed, and so did `security` if security-gated paths
      changed. Verdicts are recorded in the plan's Audit log (light tier: the PR
      body).
- [ ] The plan's status is `implemented`.

Procedure tests may only touch a dedicated test org, never `absolute-demo` or
real tenants.

## Bootstrapping

Some pieces don't exist yet. The **first feature that needs one builds it**
as part of its slice, and lists it in its plan:

| Piece                                 | Notes                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Generated types                       | `pnpm db:types`, then wire `createServerClient<Database>` and `createBrowserClient<Database>` in `src/lib/supabase/`. `src/types/database.ts` exists and the Supabase clients in `src/lib/supabase/` are typed with `Database`                               |
| Org-scoped procedure + `ctx.supabase` | Build on `protectedProcedure` from `origin/feature/trpc-auth`; don't write a second one. If that branch hasn't merged, ask the user whether to rebase onto it. Add `ctx.supabase` (the per-request server client) and the resolved active org to its context |
| SSR auth for tRPC                     | Forward the incoming request's cookie header in the SSR link in `root-provider.tsx`, or use a per-request server caller. Add a server-side `beforeLoad` guard on `_authed`; today the guard is client-only                                                   |
| Sentry tRPC middleware                | See Observability                                                                                                                                                                                                                                            |
| Trusted client                        | Read `SUPABASE_SERVICE_ROLE_KEY` from `process.env` on the server only (`src/env.ts` reads `import.meta.env`, which carries only `VITE_` values), under `src/server/trusted/`, with an eslint ban on the key elsewhere                                       |
| Unit/integration Vitest project       | Record how tests reach the database without touching real tenants (fixtures use the service-role client and the auth admin API, not a direct connection); consider Supabase branching                                                                        |
| Seeded test user and org              | Credentials in `.env.local` as `E2E_EMAIL` / `E2E_PASSWORD`                                                                                                                                                                                                  |

## Git and PRs

- Never commit with `--no-verify`. If a hook fails, fix the cause.
- Write commit messages in the imperative ("Add client list procedure").
- The PR body:
  - links the plan (light tier: pastes the plan);
  - includes the ticked Definition of done;
  - lists the shots added.
- PRs land as merge commits, matching the existing history, and only through
  the [Merge](#merge) conditions.
