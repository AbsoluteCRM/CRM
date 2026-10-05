# Plan: Agent roster (plan-auditor, reviewer, security, implementer)

- **Slug / branch**: `agent-roster` / `chore/agent-roster`, from `origin/main` (`6cd8386`)
- **Tier**: full. It changes the workflow rules and adds agents.
- **Status**: approved (2026-10-05, on plan-mode exit)
- **Confidence**: 96%. Every material choice rests on R1–R7 (the user) or on
  the orchestrator sources read this session.
- **Plan-mode file**: `~/.claude/plans/fluttering-wishing-reef.md`. This plan
  is on top; the paused drop-prisma plan is below. On approval each one is
  committed as its own `docs/plans/*.md`.

## Original request

> I think our auditor needs some work. Lets go look at the agents from
> `git.s10y.ca/claude/orchestrator` for ideas on how to improve our flow.

(Earlier, standing: "Merge the PRs autonomously.")

## Context

Seven audit rounds across two plans never converged:

- every round came back DEFEATED;
- some MATERIAL findings were preferences ("add owner role");
- some auditors re-raised items that were already settled;
- read-only was a promise in the prompt, never enforced;
- every audit prompt was re-written by hand;
- nothing reviews the _code_ before merge, and the user now wants autonomous
  merges.

The orchestrator (`git.s10y.ca/claude/orchestrator`, which redirects to
`forgejo.singerfamily.ca/claude/orchestrator`; files
`home/.claude/agents/*.md` and `home/.config/claude-orch/protocol.md`) solves
these with:

- pinned agent definitions with tool-level read-only;
- a four-part standard of proof;
- named doubt;
- mandatory `checked_clean`;
- JSON verdicts;
- a recurring-finding rule that escalates;
- separate reviewer and security gates;
- an implementer in a worktree;
- explicit merge conditions.

## Decisions

| #   | Question                    | Answer                                                                                                                                                           |
| --- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Which agents                | `plan-auditor`, `reviewer` (diff, pre-merge), `security` (hard gate), and `implementer` (worktree)                                                               |
| R2  | Sequencing                  | Build the agents first; drop-prisma is paused and is then re-audited from round 1 by the new `plan-auditor`                                                      |
| R3  | Loop end                    | Orchestrator-style: a pass ends it. A recurring finding, or "the approach is wrong", escalates at once. Otherwise up to 3 cycles, then escalate with the history |
| R4  | Merging                     | Autonomous when every gate passes, checked fresh on the PR head; otherwise stop and report                                                                       |
| R5  | MCP for read-only agents    | List and inspect tools only, no `execute_sql`. A needed query goes in `unresolved` with the exact SQL, and the main agent runs it                                |
| R6  | Who writes to the remote DB | Only the main agent: `apply_migration`, data writes, advisors, pgTAP, and version renames                                                                        |
| R7  | Merge permission (standing) | "Merge the PRs autonomously"                                                                                                                                     |

Agent defaults (minor):

- **D1**: models are pinned in the agent frontmatter, using aliases only:
  - `opus`, effort `high`: `plan-auditor`, `reviewer`, `security`;
  - `sonnet`, effort `medium`: `implementer`.

  When dispatching, leave `model` out, so the pin applies.

- **D2**: read-only agents use a `tools` **allowlist**: `Read`, `Bash`,
  `WebFetch`, plus the R5 MCP list.
  - The R5 list is `mcp__supabase__list_migrations`, `list_tables`,
    `list_extensions`, and `generate_typescript_types`, all with the full
    `mcp__supabase__` IDs.
  - `get_advisors` is left out, because R6 assigns advisors to the main
    agent. A read-only agent that wants advisor output puts it in
    `unresolved`.
  - Grep and Glob are left out, because they aren't available in this
    environment; Bash covers searching. An unresolved MCP name doesn't block
    launch, since Read, Bash, and WebFetch always resolve; that tool is just
    missing.
  - Anything not on the allowlist is unavailable, so no `disallowedTools`
    are needed.
  - Bash can still write, so the main agent still runs `git status` after
    each run.
  - The Supabase MCP is project-configured in `.mcp.json`, so the names
    exist for every contributor.
- **D3**: commit style stays this repo's imperative sentences, not
  Conventional Commits.
- **D4**: the roles are adapted to this repo's documented model, not copied
  from cleros:
  - the cleros-specific parts are dropped (FGAC docs, container images,
    Flux);
  - the "rules" they check against are CLAUDE.md, `feature-workflow.md`,
    `docs/database/*` (`rls.md`, ADRs), and the plan.
- **D5**: the security gate's paths:
  - `supabase/migrations/**`;
  - `src/integrations/trpc/**`, `src/integrations/auth/**`,
    `src/integrations/organization/**`;
  - `src/lib/supabase/**`, `src/server/**`, `src/env.ts`;
  - `src/routes/**` (new or changed routes);
  - `docs/database/rls.md`;
  - `.env.example`.

## Goal

Audits that converge: every blocking finding is grounded in evidence, and a
clean pass is allowed. Code gets reviewed before merge, with a security gate
on tenancy and auth changes. Implementation is delegated to an isolated
implementer. Merges are autonomous, but only through explicit gates.

## Open questions

- None open for the user. Two tool-resolution questions from round 1 are
  settled empirically by Verification step 2.

## Assumptions

| Assumption                                                    | Confirmed?                                   |
| ------------------------------------------------------------- | -------------------------------------------- |
| Worktree isolation branches from the default branch, not HEAD | Yes: Claude Code docs, quoted by the auditor |
| A new agents directory needs a session restart to load        | Yes: Claude Code docs, quoted by the auditor |
| `disallowedTools: ["mcp__supabase"]` removes the whole server | Yes: sub-agents docs; also smoke-tested      |
| `gh` is authenticated for `AbsoluteCRM/CRM`                   | Yes: PR #7 was opened with it                |

## Layers touched

- Agents (`.claude/agents/`), workflow docs, template, CLAUDE.md, and
  AGENTS.md.
- No code, schema, UI, or tests.
- No security-gated (D5) paths.

## Commits

1. `Add plan for the agent roster` (`docs/plans/agent-roster.md`), plus the
   paused `docs/plans/drop-prisma.md` (status: draft, paused) so it survives
   outside plan mode.
2. `Add plan-auditor, reviewer, security, and implementer agents`
   (`.claude/agents/*.md`).
3. `Wire the agent roster into the feature workflow`: `feature-workflow.md`,
   `_template.md`, `CLAUDE.md`, `AGENTS.md`.

Every commit builds; it's docs and markdown only.

## Changes

### `.claude/agents/plan-auditor.md`

- **Role**: defeat a written plan before code exists.
- **Inputs from the caller**: the plan path, the original request verbatim,
  the user decisions (fixed), what the caller already verified, and, on a
  re-audit, the previous findings plus what changed.
- **Checks, in order**:
  1. Does the plan do what the _request_ asked?
  2. Contradictions with user decisions or written rules.
  3. Unhappy paths the plan doesn't handle.
  4. Factual claims about the repo or remote; verify them.
  5. Steps that can't be carried out as written (commands, flags, ordering).
  6. Missing template sections: commits, verify command, non-goals,
     dependencies not to add.
  7. Scope creep.
- **Standard of proof**: a blocking finding carries all four parts, or it is
  not blocking:
  1. location (a plan section, or `file:line`);
  2. evidence read or run;
  3. the written rule or user decision it breaks, or a demonstrated broken
     contract;
  4. the concrete failure that follows.
- **Never blocking on their own**:
  - style;
  - an approach you'd have taken differently;
  - "could be fragile" with no failure constructed;
  - pre-existing defects (these go in `pre_existing`);
  - wanting more generality;
  - consolation findings.

  "Absence of a written rule is not a finding."

- **Doubt**: `unresolved` entries carry `{question, tried, would_settle_it}`.
  Low confidence requires at least one. With R5, a query the auditor can't
  run goes here with its exact SQL.
- **Re-audit**: check the _whole_ plan again. A previous finding that isn't
  closed is reported as `recurring: true`.
- **Return JSON only**:
  - `verdict`: `pass` or `needs-changes`;
  - `blocking`: a list of `{section, problem, rule, evidence, failure, recurring}`;
  - `non_blocking`: a list;
  - `unresolved`: a list;
  - `pre_existing`: a list;
  - `checked_clean`: required;
  - `confidence`.

  `needs-changes` if and only if `blocking` is non-empty, or confidence is
  low.

### `.claude/agents/reviewer.md`

The orchestrator's `reviewer`, adapted:

- **Input**: the plan, the request, and the branch. It reads
  `git diff origin/main...HEAD`.
- **Checks, in order**:
  1. Does the change do what the request and plan asked?
  2. Unhappy paths.
  3. Regressions: grep for callers.
  4. Suppression this diff introduces (`--no-verify`, `@ts-ignore`,
     `eslint-disable`, skipped tests). Each one blocks automatically.
  5. Scope creep.
  6. CLAUDE.md and workflow conventions. This includes tenancy:
     - procedures use the org-scoped procedure;
     - queries filter by the active org;
     - no service role outside `src/server/trusted/`.
  7. Secrets.
  8. Tests that actually exercise the change.
  9. A commit that doesn't build (merge commits get bisected).
  10. The DoD items the plan claims.
- **Standard of proof, doubt, re-review, and JSON shape**: as in
  `plan-auditor`, with `file:line`.

### `.claude/agents/security.md`

The orchestrator's `security` agent, adapted:

- **Dispatch**: for any diff touching the D5 paths. Its verdict is a hard
  gate.
- **Read first**:
  - `docs/database/rls.md`;
  - ADRs 0002, 0007, and 0009 when it exists;
  - the workflow's Middleware and tenancy rules;
  - `docs/database/tables/*`.
    Cite only documents it actually opened.
- **Hunt for**:
  - a tenant derived from the request rather than the session;
  - a missing active-org filter;
  - RLS bypass: the service role or a raw connection in a request path;
  - grants: a new `public` function executable by `anon`, or a
    `security definer` without an `auth.uid()` or membership check;
  - a policy that widens access;
  - new routes without a server-side guard;
  - IDOR;
  - injection in `.rpc()` or `.from().or()` filter strings;
  - secrets in files;
  - `VITE_`-prefixed secrets, which leak to the client.
    If advisor output would settle a question, it puts that in
    `could_not_verify`, and the main agent runs `get_advisors` (R6).
- **Doubt rule**: unsure means reject, but only with a specific named
  question.
- **Scope**: `pre_existing` items never block.
- **Re-review**: covers the whole diff, and confirms each previous finding is
  closed by the same means it was found.
- **Return JSON**: `verdict` (`pass` or `reject`), plus `findings` with
  severity and attack path, `pre_existing`, `checked_clean`,
  `could_not_verify`, and `confidence`.

### `.claude/agents/implementer.md`

The orchestrator's `implementer`, adapted:

- **Runs as**: `isolation: worktree`, with all tools inherited, and
  `disallowedTools: ["mcp__supabase"]`, which removes the whole server. That
  enforces R6 for the MCP path. The brief covers the rest: never read
  `.env.local` or connect to the database by any other route, because the
  remote database is the main agent's job.
- **Setup**: the worktree has no `node_modules` and no `.env.local`. Run
  `pnpm install --frozen-lockfile` first. Checks that need `.env.local` are
  left to the main agent in Phase 5.
- **Branch handling** (fixes round 1, blocker B1): the worktree is cut from
  the default branch, on a temporary branch of its own.
  - First, `git fetch origin && git reset --hard origin/<pr-branch>`, using
    the PR branch name the caller supplies. The worktree then holds the PR
    head without checking out the PR branch itself, which the main checkout
    may hold.
  - Push every commit with `git push origin HEAD:<pr-branch>`. This is a
    fast-forward, because the main agent doesn't commit to the PR branch
    while an implementer is dispatched.
  - Never push the worktree's own branch name.
- **Follow the plan's commit list.**
  - Push after every commit (as above).
  - Every commit builds.
  - One logical change per commit.
  - Tests land with their code.
  - Never amend.
  - It may deviate from the list, but reports the actual list and why.
- **If the plan is wrong**, stop and report. Don't improvise.
- **Build only what was asked.**
  - Never suppress a failure.
  - Use the toolchain through `devenv shell -- …` if PATH misses a tool.
- **Before finishing**, run the plan's verify command and paste its output.
- **Return**: the files changed, the commits, the verify output,
  deviations, things noticed but not touched, and uncertainties.

### `docs/process/feature-workflow.md`

- **Phase 3 (Audit)**:
  - Dispatch `subagent_type: "plan-auditor"`, without `model`, and give it
    the caller inputs listed above.
  - Each finding goes into the Audit log, using the JSON fields.
  - The planner still checks the auditor's factual claims and runs
    `git status` after each run.
- **Retire the old vocabulary.** Replace every MATERIAL/MINOR and
  DEFEATED/NOT DEFEATED with blocking/non-blocking and pass/needs-changes:
  - "What it returns";
  - "may not reject a MATERIAL finding without the user";
  - "no MATERIAL findings";
  - the "Who audits: general-purpose" bullet;
  - the matching wording in CLAUDE.md's summary.
- **Loop end (R3)**, replacing "after 3 rounds that still find something":
  - a `pass` ends the loop;
  - `recurring: true`, or a finding that the _approach_ is wrong, escalates
    at once with a question;
  - otherwise up to 3 cycles, then escalate with the full history;
  - a low-confidence verdict with an `unresolved` query: the main agent runs
    it, or asks the user, then re-audits once.
- **Phase 4 (Implement)**:
  - The main agent creates the branch, commits the plan, and opens a
    **draft PR**.
  - It dispatches `implementer` with the plan, the commit list, the canonical
    files to imitate, the non-goals, and the DoD.
  - Pass the implementer the PR branch name; it pushes to that branch.
  - **One writer at a time on the PR branch.** While an implementer is
    dispatched, the main agent doesn't commit to the branch. Before and after
    each dispatch, it runs `git pull --ff-only`.
  - Remote-DB steps stay with the main agent (R6). It does them between
    implementer dispatches, in the plan's layer order: the migration file
    plus `apply_migration` plus the version rename plus types first, then the
    implementer builds the code layers on top. Each of these is an ordinary
    commit on the PR branch.
  - On review failure: the first goes back to the implementer; on the
    second, re-dispatch with `model: "opus"`; the third escalates. A
    reviewer or security finding with `recurring: true`, or one saying the
    approach is wrong, escalates at once (R3).
  - After the merge, remove the implementer's worktree and its temporary
    branch.
- **New Phase 5, Review**:
  1. Run the DoD verify on the integrated branch.
  2. Dispatch `reviewer`.
  3. If D5 paths changed, dispatch `security` after the reviewer.
  4. Any fix makes the earlier passes void: re-verify, then send a _fresh_
     reviewer (and security) over the whole diff, with the findings as
     history.
- **New Merge section (R4, R7)**: merge only when all of these hold, checked
  fresh on the PR head:
  1. The plan's exact verify command passes, and so do the DoD checks that
     apply: tsc, lint, check, `vitest run`, and build. tsc keeps the
     existing "no new errors" caveat until drop-prisma removes the 2
     Prisma errors.
  2. The `reviewer` passed.
  3. `security` passed, if D5 paths changed. A pass with `confidence: low`
     doesn't count.
  4. `main` is merged in with no conflicts, and verify was re-run after that.
  5. The plan's status is `implemented`, and the PR body has the ticked DoD
     with N/A reasons.
  6. The PR is out of draft.

  Then `gh pr merge --merge`. If any condition fails, stop and report;
  "probably unrelated" never justifies a merge.

- **Layer rules**: the remote DB is written only by the main agent (R6).
  Read-only agents use list and inspect MCP tools only (R5).

### `docs/plans/_template.md`

- Add the sections **Commits**, **Unhappy paths**, **Verify command**
  (exact), and **Dependencies not to add**.
- Add a line for **Security-gated paths touched** (D5).
- The audit log table gets columns for verdict, blocking (with the
  recurring flag), unresolved, and resolution.

### `CLAUDE.md` and `AGENTS.md`

- The Feature-workflow summary: name the four agents, the merge gate, and R5
  and R6.
- `AGENTS.md`: one line naming the `.claude/agents/` roster.

## Unhappy paths

- **Agents not loaded**: `.claude/agents/` is a new directory, and Claude
  Code only loads it after a session restart. Restarting is a planned step
  (Verification 1), not a fault.
- **An agent file fails to load after the restart** (bad frontmatter, or an
  unresolved tool name): the step 2 smoke test catches it. The cause could
  be an unresolved `mcp__supabase__*` name while the MCP is disconnected or
  unauthenticated. In that case, reconnect the MCP with `/mcp` rather than
  editing the agent.
- **An implementer push is rejected as non-fast-forward**: someone committed
  to the PR branch during dispatch, which breaks the one-writer rule. The
  implementer stops and reports; it never force-pushes.
- **The auditor needs a SQL answer (R5)**: it goes in `unresolved`, and the
  main agent runs the query.

## Verify command

```
pnpm check && pnpm lint && node -e 'const fs=require("fs"),p=require("path");let b=0;for(const f of process.argv.slice(1))for(const m of fs.readFileSync(f,"utf8").matchAll(/\]\(([^)\s]+)\)/g)){let t=m[1];if(/^(https?:|mailto:|#)/.test(t))continue;t=t.split("#")[0];if(!fs.existsSync(p.resolve(p.dirname(f),t))){b++;console.log(f,"->",m[1])}}process.exit(b?1:0)' docs/process/feature-workflow.md docs/plans/_template.md docs/plans/agent-roster.md CLAUDE.md AGENTS.md .claude/agents/*.md
```

## Verification

1. **Restart** (fixes round 1, blocker B2). After commits 1–3 are pushed to
   the draft PR, the main agent asks the user to restart Claude Code
   (`claude --continue`), because a new agents directory loads only on
   restart. This is the one planned interruption. Then it confirms that
   `plan-auditor`, `reviewer`, `security`, and `implementer` appear as
   dispatchable agent types.
2. **Smoke test.** Dispatch `plan-auditor` on the committed
   `docs/plans/agent-roster.md`. It must:
   - launch, which settles round 1's two `unresolved` questions about tool
     resolution;
   - return valid JSON with `checked_clean`;
   - leave `git status` clean.

   Then dispatch `implementer` with a no-op brief ("report your tools; make
   no changes") and confirm that no `mcp__supabase__*` tools are present.

3. The verify command above passes.
4. **Gates.** Dispatch `reviewer` on the PR diff; it must pass. `security`
   is N/A, because no D5 paths changed.
5. **Merge** (R4, R7): once every Merge-section condition holds (main
   merged in and re-verified, the plan's status set to `implemented`, the
   ticked DoD in the PR body), mark the PR ready, then
   `gh pr merge --merge`.

## Non-goals and dependencies not to add

- No `regressor`: there's no e2e suite yet.
- No hooks or settings changes.
- No new packages.
- No cleros-specific rules.

## Audit log

### Round 1 (bootstrap: `general-purpose`/opus given the new standard of proof): needs-changes, confidence medium

| #   | Blocking finding                                                                            | Resolution                                                                                     |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| B1  | Implementer commits can't reach the PR branch (the worktree is cut from the default branch) | Fixed: `reset --hard origin/<pr-branch>`, push to `HEAD:<pr-branch>`, and one writer at a time |
| B2  | A new agents directory needs a restart, so the smoke test and reviewer can't be dispatched  | Fixed: the planned restart (Verification 1); the unhappy path reworded                         |
| B3  | The verify command had a placeholder                                                        | Fixed: the exact one-liner                                                                     |

The non-blocking items were all adopted:

- the false claim that "unknown names are ignored" was removed;
- Grep and Glob were dropped;
- full MCP IDs are used;
- the implementer disallows the whole Supabase server;
- `get_advisors` handling was clarified (in round 2 it was removed from the
  read-only agents, per R6);
- the tsc caveat was added to the merge condition;
- the template sections were added;
- the old vocabulary is retired explicitly;
- the source URL is now consistent;
- remote-DB commit ordering is defined.

`unresolved`: two tool-resolution questions, settled by Verification step 2.
`pre_existing`: tsc on main (the existing caveat), and the checkout being on
a merged branch (the implementation branches from `origin/main`).

### Round 2 (bootstrap: `general-purpose`/opus, re-audit of the whole plan): **pass**, confidence high

- **Blockers B1–B3**: confirmed closed. None recurring.
- **Non-blocking notes, all adopted after the pass.** These are tightening
  edits the auditor itself proposed, with no new behaviour, so they are not
  material and don't reset the status. Specifically:
  - the recurring and approach-wrong escalation also applies to the
    reviewer and security loops;
  - a security pass with low confidence doesn't merge;
  - the wording about unresolved MCP names was corrected;
  - assumption 3 is confirmed by the docs;
  - the implementer's R6 enforcement is stated precisely, with the
    `pnpm install` setup and the worktree cleanup;
  - Verification 5 lists every merge condition;
  - `get_advisors` was removed from the read-only agents, following R6's
    text literally rather than interpreting it.
- **`pre_existing`**: tsc on main; the dead `pnpm` field in `package.json`
  (drop-prisma removes it).

## Scope-change log

- **Verification step 2 (implementer smoke test)**: Claude Code creates
  agent worktrees inside the repo, at `.claude/worktrees/<agent>/`. They were
  not gitignored, and a worktree with commits is not auto-cleaned, so it would
  show up in `git status` and be linted in the main checkout during Phase 5.
  Fixed with `.claude/worktrees/` in `.gitignore` and in the eslint
  `ignores`. This is not material: it only makes the planned mechanism work as
  described, with no behaviour or decision change, so the status is not reset.
