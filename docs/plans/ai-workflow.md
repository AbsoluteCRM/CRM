# Plan: AI feature workflow rules

- **Slug / branch**: `ai-workflow` / `chore/ai-workflow`
- **Tier**: full
- **Status**: implemented. Approved 2026-10-05: round 4 was DEFEATED with fixes proposed;
  the user chose "apply fixes, implement now". This plan predates the plan-mode
  rule it introduces (Q18), so it was written on its branch and approved in
  chat. That is a one-time bootstrapping exemption.
- **Confidence**: 95%. Every material choice below rests on a user answer
  (Q1–Q19) or on a repo fact (ADR 0007, `rls.md`, `root-provider.tsx`). The
  agent defaults (D1–D7) are minor and listed so the user can veto them.
- **Amendments**: the Round 4 section at the end amends the required content
  and fields below; where they differ, it wins.

## Goal

Write down how features are built in this repo, so every agent session (and
human) follows the same loop: question → plan → adversarial audit → implement
as one vertical-slice PR → verify. This PR is documentation, two tooling
fixes, and a cheap repair of the red tsc/lint baseline (Q16).

## Decisions (from the user, 2026-10-05)

| #   | Question                | Answer                                                                                                                                                                                  |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Where the rules live    | A short "Feature workflow" section in `CLAUDE.md` that links to `docs/process/feature-workflow.md`                                                                                      |
| Q2  | "Feature set" means     | The process plus a per-feature plan template                                                                                                                                            |
| Q3  | Plan audit              | A fresh adversarial sub-agent audits every written plan by default; loop until it finds nothing material                                                                                |
| Q4  | Plan storage            | `docs/plans/<slug>.md`, committed in the feature PR                                                                                                                                     |
| Q5  | Confidence gate         | The plan states a confidence % and lists open questions and assumptions. Below 95% → keep asking                                                                                        |
| Q6  | Definition of done      | tsc + lint + prettier pass; tests for new procedures/UI; stories for new UI components; verified in the running app                                                                     |
| Q7  | Branches                | `feat/<slug>`, plus `fix/`, `db/`, `chore/`                                                                                                                                             |
| Q8  | Design input            | Optional (Claude Design or similar). Whatever was designed is recorded in the repo under `docs/` with screenshots and descriptions, so it doesn't depend on the artifact store          |
| Q9  | Design record layout    | cleros, scaled down: `docs/design/README.md` + `decisions.md`; per-feature `docs/<feature>/ui.md` + `docs/<feature>/shots/`; doc binaries in Git LFS                                    |
| Q10 | Auth/tenancy middleware | State the rule now; the first feature that needs it builds it                                                                                                                           |
| Q11 | Unit test project       | Added by the first feature PR that needs it                                                                                                                                             |
| Q12 | Small work              | Tiered: full loop for `feat/`, `db/`, and anything that touches schema, auth/tenancy, or more than one layer. Small `fix/`/`chore/` work gets a short plan and no audit. If unsure, ask |
| Q13 | Schema in feature PRs   | Apply to the remote after the plan is approved, as today. If a PR is abandoned, a follow-up migration reverts it                                                                        |
| Q14 | Git hooks               | Re-enable the prettier and nixfmt hooks in `devenv.nix`                                                                                                                                 |
| Q15 | Test login              | Seeded test user/org with credentials in `.env.local` (`E2E_EMAIL`, `E2E_PASSWORD`); the first feature that needs it adds it                                                            |
| Q16 | Red baseline on main    | Fix the cheap lint/tsc errors here; Prisma pull/generate goes to the bootstrapping list                                                                                                 |
| Q17 | Abandoned schema        | A `db/revert-<slug>` PR to main commits the applied migration and its revert (and the docs/database update), so remote history and repo stay in sync                                    |
| Q18 | Go signal               | Use the agent's native plan mode: phases 1–3 run in plan mode, and approving the plan on exit is the go. Without a plan mode, follow the user's stated preference (ask if none)         |
| Q19 | Revert PR tier          | `db/revert-<slug>` PRs are light tier                                                                                                                                                   |

Agent defaults (minor):

- **D1**: tRPC procedures get Sentry through `Sentry.trpcMiddleware` on the
  base procedure in `init.ts`, which is server-only, with
  `attachRpcInput: false`. The first feature that builds the org middleware
  adds it.
- **D2**: org scoping builds on `protectedProcedure` from
  `origin/feature/trpc-auth`; don't write a second version. If it hasn't
  merged when a feature needs it, ask the user whether to rebase onto it. Its
  context holds only a Supabase `User`, so the context must also carry
  verified JWT claims (for example from `getClaims()`) for `withRls`.
- **D3**: `AGENTS.md` gets a one-line pointer to the workflow doc (a pointer,
  not a mirror), outside the intent-skills markers.
- **D4**: procedure tests may only touch a dedicated test org, never
  `absolute-demo` or real tenants. The PR that adds the unit project records
  how, and considers Supabase branching as the alternative.
- **D5**: active org: the client may name it (route param, header, or
  cookie). The server resolves it to an `active` membership of `ctx.user`,
  with that member's role, and rejects it otherwise.
- **D6**: `docs/database`, `design`, `plans`, and `process` are reserved and
  can't be feature names under `docs/<feature>/`.
- **D7**: auditor fallback: tools without sub-agents use a fresh session
  given the same audit prompt.

## Changes

1. `docs/process/feature-workflow.md`, with the required content below.
2. `docs/plans/_template.md`, with the required fields below.
3. `docs/design/README.md`:
   - the charter: the design in the repo wins over artifacts and memory;
   - the screen-section format;
   - the shot rules;
   - a Git LFS section (setup, the GitHub quota, contributors without devenv need `git-lfs`);
   - an index of feature `ui.md` files (empty for now).
4. `docs/design/decisions.md`: a dated D-log (empty table, rules for
   superseding entries).
5. `.gitattributes`: one line per extension, because git attributes have no
   brace expansion (`docs/**/*.png filter=lfs diff=lfs merge=lfs -text`). It
   covers png, jpg, jpeg, gif, webp, pdf and mp4, with a header comment saying
   nothing outside `docs/` uses LFS.
6. `devenv.nix`:
   - add `git-lfs` to `packages`;
   - re-enable `git-hooks.hooks` (prettier with
     `settings.binPath = "./node_modules/.bin/prettier"`, nixfmt);
   - `enterShell` runs
     `git rev-parse --git-dir >/dev/null 2>&1 && git lfs install --local`.

   Order: edit, enter `devenv shell` (this regenerates
   `.pre-commit-config.yaml` and the prek hook), run
   `prek run nixfmt --files devenv.nix` with the pinned nixfmt, then commit.

7. Ignores:
   - `.prettierignore`: add `.claude/settings.local.json` and `src/generated`;
   - `.gitignore`: add `src/generated`;
   - eslint `ignores`: add `src/generated/**`.
8. `CLAUDE.md`:
   - add a "Feature workflow" section;
   - fix the Prisma line: it says "bypasses RLS"; it should say user requests use `withRls` (ADR 0007, not built yet);
   - `.devcontainer/devcontainer.json` is committed by hand, not generated by devenv; keep the file and fix only the sentence;
   - fix the direnv claim (there is no `.envrc`) and the hook list (prettier and nixfmt only);
   - mention `src/integrations/auth`, `src/integrations/organization`, and the `_authed` routes.
9. `AGENTS.md`: a one-line pointer (D3).
10. Baseline (Q16):
    - `eslint --fix` (vite.config.ts newline, button.tsx type import);
    - remove the unused `React` imports in `src/stories/Button.tsx` and `Header.tsx`;
    - add `.storybook/**/*` to the tsconfig `include` so typed lint can parse it;
    - then `pnpm format`, so prettier and eslint converge.
11. This plan file.

### Required content: `feature-workflow.md`

- [ ] **Tiers** (Q12): which work gets the full loop and which gets the light
      one. When unsure, ask. The light tier still runs Phase 1 and the confidence
      gate. It shows the user a short plan (goal, confidence, open questions,
      assumptions) before coding, and that plan is pasted into the PR body. Only
      the audit is skipped.
- [ ] **Plan mode** (Q18): phases 1–3 run in the agent's native plan mode,
      which is read-only, and so are the auditors. Approving the plan on exit
      (Claude Code: `ExitPlanMode`) is the go signal. Without a plan mode,
      follow the user's stated preference, and ask if there is none.
- [ ] **Phase 1, Question**: read the relevant docs first (CLAUDE.md, `docs/database`,
      `docs/design`, the feature's `ui.md`). Run the TanStack Intent skill check
      (AGENTS.md); for schema work, load the supabase and postgres skills. For UI
      work, encourage a Claude Design (or similar) mock before planning. Ask the
      user in batches until the gate is met.
- [ ] **Confidence gate**: confidence = how far the material choices rest on
      user answers or on facts verified in the repo, not on agent guesses. An
      unconfirmed assumption that would change the outcome caps confidence below
      95%. List the open questions and assumptions explicitly. Don't inflate the
      number to move on.
- [ ] **Phase 2, Plan**: write the plan from the template as the plan-mode
      plan. It is saved to `docs/plans/<slug>.md` as the first commit after
      approval.
- [ ] **Phase 3, Audit**:
  - The auditor is a fresh `general-purpose` sub-agent, never a fork. Each
    round uses a new one. Tools without sub-agents use a fresh session with
    the same prompt (D7).
  - It gets the plan, the user's original request, and the decisions. It is
    told to defeat the plan, read-only.
  - Findings are tagged MATERIAL (the plan would produce a wrong, broken,
    insecure, or incomplete result, or contradicts a user decision) or MINOR.
  - Every finding is recorded in the Audit log with its resolution: fixed,
    rejected with a reason, or escalated.
  - The planner may not reject a MATERIAL finding without the user agreeing.
  - A finding that needs a user decision sends the work back to Phase 1.
  - The loop ends when a round returns no MATERIAL findings. After 3 rounds
    that still find something, escalate to the user.
  - The planner checks the auditor's factual claims before acting on them.
- [ ] **Approval**: status goes draft → audited (clean round logged) →
      approved (the user approved it on leaving plan mode, Q18). No branch, files
      or code before approval.
- [ ] **Phase 4, Implement**:
  - Create `<prefix>/<slug>` from `main` (Q7) and commit the plan file first.
  - One PR, many commits.
  - Schema inside a feature stays on `feat/`; `db/` is for schema-only work.
  - Layer order: migration → docs/database → prisma pull/generate →
    middleware → procedures → routes/UI → stories/tests → design record.
- [ ] **Scope changes**: if implementation shows the plan is wrong, stop.
      Update the plan, add a Scope-change log entry, re-ask if confidence drops
      below 95%, and re-audit if the change is material. No silent pivots.
- [ ] **Vertical slice layers**, with their rules:
  - **Schema**:
    - Follow the `docs/database/README.md` steps. Apply only after the plan is approved (Q13).
    - Before applying, compare `list_migrations` (by name) with `supabase/migrations/` on main plus the branch.
      - Remote-only migrations that belong to an open branch or PR are expected.
      - Stop and tell the user about any others.
    - After applying, rename the local file to the version that `apply_migration` assigned.
    - After `db pull`, the `schema.prisma` diff may contain only this branch's models; revert any others.
    - Abandoned branch (Q17): a `db/revert-<slug>` PR to main commits the applied migration, its revert migration, and the docs/database update.
  - **Middleware**:
    - Domain procedures use an authed, org-scoped procedure (built on `protectedProcedure`, D2), never `publicProcedure`.
    - The active org is resolved on the server (D5) as `ctx.org`.
    - User-request Prisma access goes only through `withRls(claims, tx => …)` (ADR 0007), so RLS, including role scoping, is the access control.
    - RLS admits every org the user belongs to (`my_org_ids()`), so every org-owned query and insert must also scope to `ctx.org.id`. Both are required; neither replaces the other.
    - The raw `prisma` client is only for `withRls` itself, `prisma/seed.ts`, and trusted code under `src/server/trusted/`.
  - **Sentry**: D1 for procedures, `startSpan` for `createServerFn`.
  - **UI**:
    - shadcn.
    - Route loaders prefetch via `context.trpc` only once SSR auth exists (bootstrapping). Until then, don't prefetch protected procedures in loaders.
- [ ] **Design record** (Q8/Q9):
  - The design input is optional, though encouraged for UI work (Phase 1).
  - Whatever is built is recorded in `docs/<feature>/ui.md`, with shots of the implemented UI plus the mock when there was one.
  - The record is committed in the same PR.
  - User design decisions go in `docs/design/decisions.md`.
- [ ] **Definition of done** (Q6), as a checklist:
  - `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm check`;
  - tests for new procedures, including:
    - a cross-tenant access test;
    - a multi-org test (a user in two orgs sees only the active org's rows);
    - per-role access tests: owner, admin, dispatcher, worker, plus rejection of portal users and non-members;
  - stories for new UI components, with `play` interaction tests as the UI
    tests, run via `pnpm exec vitest run` (needs Playwright Chromium);
  - verified in the running app with the seeded test user (Q15), using the
    `run` skill or Playwright, which also captures the shots;
  - advisors and pgTAP pass when schema changed;
  - docs updated.
- [ ] **Bootstrapping notes**: until each of these exists, the first feature
      that needs it builds it:
  - the org middleware and `withRls` (Q10, D2, ADR 0007);
  - SSR auth for tRPC, by forwarding the request's cookie header in the SSR
    link or by using a per-request server caller, plus a server-side
    `beforeLoad` guard on `_authed` (today the guard is client-only);
  - the Sentry tRPC middleware (D1);
  - the unit Vitest project (Q11, D4);
  - the test user (Q15);
  - Prisma `db pull` + `db:generate`, with a real `prisma/seed.ts` (Q16).

  Until the Prisma client is generated, the tsc item in the DoD means "no new errors".

- [ ] **Git/PR**:
  - Never `--no-verify`.
  - Commit messages in the imperative.
  - The PR body links the plan, pastes the DoD checklist ticked, and lists
    the shots.
  - The plan status becomes `implemented` in the same PR.
  - Merge commits, as in the existing history.
  - The existing `feature/*` branches predate the convention.

### Required fields: `_template.md`

The template has these fields:

- slug/branch, tier, status, confidence + rationale, goal;
- user decisions table;
- open questions;
- assumptions (user-confirmed or not);
- layers touched, as a checklist: migration, RLS, docs/database, prisma, middleware, procedures, routes, UI, stories, tests, Sentry, design record;
- design refs;
- out of scope;
- verification/DoD;
- audit log;
- scope-change log.

## Out of scope

- Building any of these; the first feature that needs one bootstraps it:
  - the org middleware;
  - `withRls`;
  - SSR auth and the server route guard;
  - the unit Vitest project;
  - the test user;
  - the Sentry tRPC middleware;
  - the Prisma client.
- Retro-documenting the existing `_authed/*` pages.

## Verification

- `pnpm check` and `pnpm lint` pass.
- `pnpm exec tsc --noEmit`: only the two TS2307 Prisma-client errors remain.
- Link check: a one-liner in node that resolves every relative `](…)` link in
  the changed markdown files.
- `git check-attr filter docs/x/shots/a.png` reports `lfs`.
- `devenv shell` evaluates and creates `.pre-commit-config.yaml`. In that shell,
  `prek run --files <changed files>` passes; the real commits then go through
  the hook.

## Open questions / assumptions

- None open. The round 2 auditor verified the `git-hooks.hooks.nixfmt` and
  `prettier` option names against the locked git-hooks.nix.

## Audit log

### Round 1 (fresh general-purpose agent): DEFEATED, 12 material and 6 minor

| #   | Finding                                          | Resolution                                    |
| --- | ------------------------------------------------ | --------------------------------------------- |
| 1   | Doc content unspecified                          | Fixed: Required content and fields sections   |
| 2   | No small-change rule                             | Fixed: Q12 tiers (user)                       |
| 3   | Audit protocol undefined                         | Fixed: Phase 3 bullet                         |
| 4   | Gate gameable; this plan claimed "audited" early | Fixed: gate definition, status flow, header   |
| 5   | No scope-change rule                             | Fixed: Scope changes bullet                   |
| 6   | Remote migrations vs one-PR; `feat/` vs `db/`    | Fixed: Q13 (user), branch rule                |
| 7   | Tenancy rule unsafe                              | Fixed in round 2 (M1)                         |
| 8   | `origin/feature/trpc-auth` in flight             | Fixed: D2                                     |
| 9   | Pre-commit hook broken                           | Fixed: Q14 (user), change 6, no `--no-verify` |
| 10  | `pnpm check` already fails                       | Fixed: change 7, plan reformatted             |
| 11  | No Sentry rule for tRPC                          | Fixed: D1                                     |
| 12  | Running-app verification impossible              | Fixed: Q15 (user), D4                         |
| 13  | Shot capture details missing (minor)             | Fixed: Design record bullet, change 3         |
| 14  | `git lfs install` not run (minor)                | Fixed: change 6 `enterShell`                  |
| 15  | CLAUDE.md fix mis-aimed (minor)                  | Fixed: change 8                               |
| 16  | PR mechanics missing (minor)                     | Fixed: Git/PR bullet                          |
| 17  | Other agents won't see rules (minor)             | Fixed: D3                                     |
| 18  | Intent skill check missing (minor)               | Fixed: Phase 1 bullet                         |

### Round 2 (fresh general-purpose agent): DEFEATED, 6 material and 13 minor

| #   | Finding                                        | Resolution                                       |
| --- | ---------------------------------------------- | ------------------------------------------------ |
| M1  | Tenancy rule contradicts ADR 0007 (`withRls`)  | Fixed: Middleware bullet, change 8, per-role DoD |
| M2  | Multi-org users need an active-org choice      | Fixed: D5                                        |
| M3  | `.gitattributes` brace expansion doesn't work  | Fixed: change 5, one line per extension          |
| M4  | tsc/lint already red on main                   | Fixed: Q16 (user), change 10, bootstrapping list |
| M5  | Light tier skipped the gate                    | Fixed: Tiers bullet                              |
| M6  | Shared remote + concurrent branches            | Fixed: Schema bullet                             |
| m1  | Branch created too late                        | Superseded by Q18: branch at Phase 4 start       |
| m2  | D2 path if the auth branch is unmerged; claims | Fixed: D2                                        |
| m3  | Plan still fails prettier                      | Fixed: prettier --write before commit            |
| m4  | CLAUDE.md direnv/hook-list claims              | Fixed: change 8                                  |
| m5  | Commit ordering with the broken hook           | Fixed: change 6 order                            |
| m6  | Hook prettier version                          | Fixed: binPath                                   |
| m7  | Verification not executable                    | Fixed: Verification                              |
| m8  | AGENTS.md intent markers                       | Fixed: D3                                        |
| m9  | Sentry trpcMiddleware server-only              | Fixed: D1                                        |
| m10 | LFS guard and quota                            | Fixed: change 6 guard; quota in change 3         |
| m11 | UI tests undefined                             | Fixed: DoD                                       |
| m12 | D4 against shared remote                       | Fixed: D4 mentions branching                     |
| m13 | `docs/<feature>` name clash                    | Fixed: D6                                        |

### Round 3 (fresh general-purpose agent): DEFEATED, 3 material and 12 minor; cap reached, escalated to the user

| #   | Finding                                                        | Resolution                                            |
| --- | -------------------------------------------------------------- | ----------------------------------------------------- |
| M1  | SSR loader prefetch has no auth cookies; client-only guard     | Fixed: bootstrapping item, UI rule (verified)         |
| M2  | "`organization_id` is defence in depth" is wrong for multi-org | Fixed: Middleware rule, multi-org DoD test (verified) |
| M3  | Revert rule leaves remote and repo out of sync                 | Fixed: Q17 (user)                                     |
| 1   | Change 10 leaves prettier failing                              | Fixed: `pnpm format`                                  |
| 2   | `src/generated` not ignored                                    | Fixed: change 7                                       |
| 3   | Phase 2 hard-codes `feat/`                                     | Fixed: `<prefix>/<slug>`                              |
| 4   | Roles in the DoD incomplete                                    | Fixed: DoD roles                                      |
| 5   | Raw-prisma rule vs seed and `withRls`                          | Fixed: Middleware rule                                |
| 6   | Claude Design encouragement weakened                           | Fixed: Phase 1, Design record                         |
| 7   | Approval gate undeclared                                       | Fixed: Q18 (user, plan mode)                          |
| 8   | `[ -d .git ]` guard fragile                                    | Fixed: `git rev-parse`                                |
| 9   | Profile nixfmt vs pinned                                       | Fixed: `prek run nixfmt`                              |
| 10  | `.devcontainer` wording ambiguous                              | Fixed: change 8                                       |
| 11  | Migration check false positives; version rename                | Fixed: Schema rule                                    |
| 12  | Auditor fallback for non-Claude tools                          | Fixed: D7                                             |

### Round 4 (fresh general-purpose agent): DEFEATED, 4 material and 13 minor; escalated, user said go

User decisions: apply the fixes and implement now (the go for this plan), and
`db/revert-<slug>` PRs are light tier (Q19).

| #   | Finding                                                     | Resolution (amends the required content)                                                                                                                              |
| --- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Scope change after approval skips the user                  | Fixed: a material scope change re-enters plan mode and needs the user's approval again, which is logged                                                               |
| M2  | Edits after the clean round are not re-audited              | Fixed: a material edit after the last clean round resets the status to draft, and a new round runs (unless the user waives it, which is logged)                       |
| M3  | Session not in plan mode; the fallback can't be carried out | Fixed: enter plan mode at the start (`EnterPlanMode`, or ask the user for Shift+Tab). Without a plan mode, write the plan uncommitted to `docs/plans/<slug>.md`       |
| M4  | Template has no "what gets built"                           | Fixed: template gets a Changes section (per layer: files, procedures, routes, migrations, acceptance criteria), and the light-tier plan gets "what changes"           |
| 5   | No verbatim original request                                | Fixed: template field                                                                                                                                                 |
| 6   | D1–D6 vs D7                                                 | Fixed: header                                                                                                                                                         |
| 7   | Migration rename vs README step 2                           | Fixed: `docs/database/README.md` step 2 and CLAUDE.md updated in this PR                                                                                              |
| 8   | CLAUDE.md env facts stale; service-role key                 | Fixed: CLAUDE.md env line; service-role clients only in trusted code                                                                                                  |
| 9   | Nothing generates the Prisma client                         | Partly rejected: a `postinstall` would throw without `DATABASE_URL` (`prisma.config.ts` uses `env()`). CLAUDE.md says to run `pnpm db:generate` after install instead |
| 10  | This PR breaks its own approval rule                        | Fixed: bootstrapping exemption in the header                                                                                                                          |
| 11  | Escalation inside plan mode                                 | Fixed: escalate with a question, not the plan-mode exit; an approval with a MATERIAL finding open is logged as a user override                                        |
| 12  | Light tier and plan mode, PR link                           | Fixed: the light tier uses plan mode too, and its PR body pastes the plan                                                                                             |
| 13  | Auditor read-only only by prompt                            | Fixed: the prompt says "make no edits", and the planner checks `git status` after each round                                                                          |
| 14  | Plan-mode file not findable                                 | Fixed: tell the user the plan file path, and resume from it                                                                                                           |
| 15  | Revert PR tier                                              | Fixed: Q19, light                                                                                                                                                     |
| 16  | Reverting other models breaks back-relations                | Fixed: remove the back-relation fields too, and run `prisma validate`                                                                                                 |
| 17  | Stale round-2 m1 entry                                      | Fixed                                                                                                                                                                 |

## Scope-change log

_None._
