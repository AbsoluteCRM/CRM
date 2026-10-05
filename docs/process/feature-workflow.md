# Feature workflow

This is how every change to AbsoluteCRM is made, by agents and humans alike.
A feature is owned end to end: schema, middleware, backend, and frontend ship
together as **one vertical-slice PR**, built across as many commits as it
needs.

The loop:

```
Question ──▶ Plan ──▶ Audit ──▶ Approve ──▶ Implement ──▶ Verify ──▶ PR
   ▲           ▲         │                     │
   │           └─ fixes ─┘                     │
   └──────── user decision needed ◀────────────┘ (scope change)
```

The decision record for these rules is
[docs/plans/ai-workflow.md](../plans/ai-workflow.md).

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

- **Who audits**: a fresh `general-purpose` sub-agent, never a `fork`,
  because a fork inherits the planner's context and blind spots. Each round
  uses a new auditor. Tools without sub-agents use a fresh session given the
  same prompt.
- **What it gets**: the plan, the user's original request verbatim, the user
  decisions (fixed, not to be re-litigated), and the instruction to defeat
  the plan, read-only and **making no edits**. After each round, the planner
  runs `git status` to confirm nothing changed.
- **What it returns**: each finding is tagged **MATERIAL** or **MINOR**, and
  the report ends with a verdict of DEFEATED or NOT DEFEATED. A finding is
  MATERIAL when following the plan would produce a wrong, broken, insecure,
  or incomplete result, or when the plan contradicts a user decision. Wording
  and style are MINOR.
- **Handling findings**:
  - The planner checks the auditor's factual claims against the repo before
    acting on them.
  - Every finding is recorded in the plan's Audit log as fixed, rejected with
    a reason, or escalated.
  - The planner may not reject a MATERIAL finding without the user agreeing.
  - A finding that needs a user decision sends the work back to Phase 1.
- **Termination**: the loop ends when a round returns no MATERIAL findings.
  After 3 rounds that still find something, escalate by asking the user a
  question, not by calling `ExitPlanMode`. If the user approves with a
  MATERIAL finding still open, log it as a user override.

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

1. Create the branch from `main`: `feat/<slug>`, `fix/<slug>`,
   `db/<slug>`, or `chore/<slug>`. Schema that is part of a feature stays on
   `feat/`; `db/` is for schema-only work. Older `feature/*` branches predate
   this convention.
2. Commit the plan file first.
3. Build the layers in this order, committing as you go:
   migration → `docs/database` → Prisma pull/generate → middleware →
   procedures → routes/UI → stories/tests → design record.

### Scope changes

If implementation shows that the plan is wrong, **stop**. No silent pivots.

1. Update the plan and add a Scope-change log entry.
2. If confidence drops below 95%, ask the user.
3. If the change is material, re-enter plan mode, re-audit, and get the
   user's approval again before continuing. Log that approval.

## Layer rules

### Schema

Follow the steps in [docs/database/README.md](../database/README.md#toolchain-and-workflow).
In addition:

- Apply migrations to the remote only **after the plan is approved**.
- Before applying, compare `list_migrations` with `supabase/migrations/` on
  `main` plus your branch, matching by name.
  - Remote-only migrations that belong to another open branch or PR are
    expected.
  - Stop and tell the user about any others.
- After applying, rename the local file to the version `apply_migration`
  assigned.
- After `prisma db pull`, `schema.prisma` may change only for this branch's
  models. Revert other branches' models **and** the back-relation fields
  they added to shared models such as `Organization`. Then run
  `pnpm exec prisma validate` before `pnpm db:generate`.
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
- **RLS is the access control**: user requests reach Prisma only through
  `withRls(claims, (tx) => …)` ([ADR 0007](../database/decisions/0007-prisma-and-rls.md)),
  so every policy applies, including role scoping. The claims come from the
  verified Supabase session.
- **The active-org filter is also required**: RLS admits every org the user
  belongs to (`private.my_org_ids()`). So every org-owned query and insert
  must also scope to `ctx.org.id`. Both are required, and neither replaces
  the other.
- **Trusted code only**:
  - The raw `prisma` client is used only inside `withRls` itself, in
    `prisma/seed.ts`, and in trusted code under `src/server/trusted/`
    (webhooks, cron, optimizer write-back).
  - Supabase clients built with `SUPABASE_SERVICE_ROLE_KEY` also bypass RLS,
    so they too live only in `src/server/trusted/`.

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

- [ ] `pnpm exec tsc --noEmit` is clean. Until the Prisma client is first
      generated, this means "no new errors".
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
- [ ] The plan's status is `implemented`.

Procedure tests may only touch a dedicated test org, never `absolute-demo` or
real tenants.

## Bootstrapping

Some pieces don't exist yet. The **first feature that needs one builds it**
as part of its slice, and lists it in its plan:

| Piece                            | Notes                                                                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma client                    | `prisma db pull` + `pnpm db:generate`, and replace the scaffold `prisma/seed.ts`                                                                                                                                                                |
| Org-scoped procedure + `withRls` | Build on `protectedProcedure` from `origin/feature/trpc-auth`; don't write a second one. If that branch hasn't merged, ask the user whether to rebase onto it. The context must also carry verified JWT claims (for example from `getClaims()`) |
| SSR auth for tRPC                | Forward the incoming request's cookie header in the SSR link in `root-provider.tsx`, or use a per-request server caller. Add a server-side `beforeLoad` guard on `_authed`; today the guard is client-only                                      |
| Sentry tRPC middleware           | See Observability                                                                                                                                                                                                                               |
| Unit/integration Vitest project  | Record how tests reach the database without touching real tenants; consider Supabase branching                                                                                                                                                  |
| Seeded test user and org         | Credentials in `.env.local` as `E2E_EMAIL` / `E2E_PASSWORD`                                                                                                                                                                                     |

## Git and PRs

- Never commit with `--no-verify`. If a hook fails, fix the cause.
- Write commit messages in the imperative ("Add client list procedure").
- The PR body:
  - links the plan (light tier: pastes the plan);
  - includes the ticked Definition of done;
  - lists the shots added.
- PRs land as merge commits, matching the existing history.
