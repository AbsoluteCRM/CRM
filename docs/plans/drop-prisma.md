# Plan: Drop Prisma for Supabase-JS

- **Slug / branch**: `drop-prisma` / `chore/drop-prisma`, from `origin/main`
  (`cd44828`, after PR #8)
- **Tier**: full. It touches more than one layer: tooling, `docs/database`,
  ADRs, the workflow rules, and the agent briefs.
- **Plan-mode file**: `~/.claude/plans/fluttering-wishing-reef.md`
- **Status**: approved (2026-10-05, on plan-mode exit). It was paused for `chore/agent-roster` (merged as PR #8)
  and is now re-audited from round 1 by `plan-auditor`. Rounds 1–3 under the
  old auditor are in `docs/plans/drop-prisma.md` on `main`.
- **Confidence**: 96%. Q1–Q7 come from the user. The repo and remote facts
  were verified:
  - nothing in `src/` imports Prisma (`src/db.ts` and `prisma/seed.ts` only);
  - the remote has drifted (`list_migrations`, `information_schema`, the
    `has_function_privilege` queries);
  - PR #6 is stranded (GitHub compare API);
  - `supabase-cli` 2.111.0 is at the pinned nixpkgs revision.

## Original request

> Should we ditch prisma for just raw sql with supabase?
>
> (after the recommendation) Drop prisma
>
> (mid-planning, about the remote drift) Merge in changes from supabase if
> neded

Standing instruction: "Merge the PRs autonomously."

## Goal

Remove Prisma completely. Make supabase-js, with the user's session, the
documented data-access path (ADR 0009), and add the tooling for generated
types. Leave tsc clean on `main`, and retire every rule and caveat that
assumed Prisma. **Don't touch the remote database.** It has drifted, and
reconciling it, then generating and wiring the types, is the follow-up
`db/reconcile-remote`.

## Context

Prisma was a scaffold add-on. The schema is hand-written SQL (ADR 0001), so
Prisma's schema language and migrations go unused. It connects as `postgres`
and bypasses RLS, which forced ADR 0007's planned `withRls()` wrapper. That
wrapper was never built, and the Prisma client was never generated. That's
why tsc on `main` has 2 errors (`prisma/seed.ts`, `src/db.ts`), and why the
workflow, the template, and the implementer brief carry a "2 known errors"
caveat.

The remote drift, which the earlier rounds found and verified:

- **Migrations**: the remote has 8, re-applied on 2026-10-02 with content
  that differs from the repo's 13.
- **Missing from the remote**:
  - the migrations `drop_legacy_tables`, `fix_accept_invitation_email_match`,
    `fix_visit_actuals_check`, `invoices_payments`, and `time_tracking`;
  - the seed data (it has 0 orgs, but 2 auth users and profiles).
- **Only on the remote**:
  - the table `job_line_item_taxes`;
  - remote-specific content in `routing` and `tenancy_identity`.
- **Stranded in neither place**: PR #6 (`db/capture-drift`, merge commit
  `6ba2fc4`) captured the dashboard policy "Enable users to view their own
  data only" on `organization_members`. It merged into `db/schema-foundation`
  after that branch had already merged to `main`.
- **Not drift**: `rls_auto_enable` and its event trigger are documented in
  `rls.md`'s accepted-advisor table. Dropping `public` would cascade-drop
  them.

## Decisions

| #   | Question                        | Answer                                                                                                                                                                                                     |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | Drop Prisma?                    | Yes: "Drop prisma"                                                                                                                                                                                         |
| Q1  | Type generation                 | Supabase CLI via devenv, plus `pnpm db:types` (`supabase login` or `SUPABASE_ACCESS_TOKEN`); agents may use the MCP `generate_typescript_types`. Output committed                                          |
| Q2  | `DATABASE_URL`                  | Remove it. Trusted work uses the service-role client; a future direct-SQL need adds its own client with an ADR                                                                                             |
| Q3  | Generate and wire types now     | Originally yes. **Revised by Q5**: deferred to `db/reconcile-remote`                                                                                                                                       |
| Q4  | Remote drift                    | Origin unknown; safe to reset. Before resetting, merge in anything on the remote the repo needs ("Merge in changes from supabase if neded")                                                                |
| Q5  | Sequencing                      | Split: this PR drops Prisma, adds the tooling and docs. `db/reconcile-remote` reconciles the remote, then generates and wires the types                                                                    |
| Q7  | Lockfile vs `latest` specifiers | Pin `latest` to the currently locked versions first, as its own commit in this PR, so the Prisma removal only removes entries and the PR stays behaviour-neutral. Upgrades become a deliberate later chore |
| Q6  | Types rule on a shared remote   | Mirror the remote. Before generating, remote migrations must equal main's plus this branch's plus other open PRs'; otherwise stop and tell the user. After merging main, regenerate rather than hand-merge |

Agent defaults (minor; the user may veto them):

- **D1**: ADR 0009 supersedes 0007 and amends 0001's Prisma bullet. Old ADR
  bodies are untouched; only their status lines and the index change.
- **D2**: types go in `src/types/database.ts`, for the `public` schema only.
  eslint ignores that file.
- **D3**: remove these, which existed only for Prisma:
  - `tsx`;
  - the `post-cta-init` script (Prisma's `create-db`);
  - the Prisma entries in `.cta.json` and in `pnpm-workspace.yaml`
    `allowBuilds`;
  - the whole dead `package.json` `pnpm` field;
  - the `src/generated` ignores;
  - `public/prisma.svg`.
- **D4**: demo data stays in `supabase/seed.sql`, and `db:seed` is removed.
- **D5**: `dotenv-cli` stays, because `dev` and `db:types` use it.
- **D6**: the project ref is hard-coded in `db:types`. ADR 0009 notes that
  branches need `--project-id` overridden.
- **D7**: the main agent makes these commits itself rather than dispatching
  the `implementer`. This **departs** from the workflow, which gives the code
  layers to the implementer. The user may veto it. The reasons:
  - the only code change is _deleting_ `src/db.ts`, `src/database-url.ts`,
    and `prisma/seed.ts`, with no new code;
  - the rest is config and prose that needs the plan's exact wording.

## Open questions

- None open for the user.
- The pre-existing environment gap (Playwright Chromium isn't installed, so
  vitest can't run) is handled in Verification.

## Assumptions

| Assumption                                                                     | Confirmed?                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Nothing outside `src/db.ts` and `prisma/seed.ts` imports Prisma                | Yes: grep, and two auditors                            |
| `supabase gen types --lang typescript --project-id … --schema public` is valid | Partly: checked in Verification step 4 before commit 4 |
| After section 0, removing Prisma changes no surviving package's version        | Checked by Verification step 2 at commits 2 and 3      |
| The remote may stay drifted while this PR merges (no runtime code uses it yet) | Yes: Q5 (user)                                         |

## Design refs

- None, because there is no UI.

## Layers touched

- [ ] Migration / RLS: none. The remote is not touched.
- [x] `docs/database`: README, `rls.md`, `tables/crews-routing.md`, ADRs
- [x] Data-access rules: ADR 0009, the workflow, the template, CLAUDE.md,
      and the implementer brief
- [x] Tooling: `package.json`, `pnpm-workspace.yaml`, `devenv.nix`, ignore
      files, `.env.example`, `.cta.json`
- [ ] Procedures, routes, UI, types wiring: none
- [ ] Stories / tests: none, because there is no behaviour change

**Security-gated paths touched**: `docs/database/rls.md` and `.env.example`.
So `security` gates the merge.

## Changes

### 0. Pin the `latest` specifiers (Q7)

There are 22 `latest` specifiers in `package.json`. Each one is replaced with
the version currently in `pnpm-lock.yaml`.

**dependencies** (14):

| Package                            | Locked version |
| ---------------------------------- | -------------- |
| `@tanstack/match-sorter-utils`     | 9.1.2          |
| `@tanstack/query-db-collection`    | 1.2.15         |
| `@tanstack/react-db`               | 0.4.1          |
| `@tanstack/react-devtools`         | 0.10.13        |
| `@tanstack/react-form`             | 1.33.5         |
| `@tanstack/react-query`            | 5.104.0        |
| `@tanstack/react-query-devtools`   | 5.104.0        |
| `@tanstack/react-router`           | 1.170.40       |
| `@tanstack/react-router-devtools`  | 1.167.2        |
| `@tanstack/react-router-ssr-query` | 1.167.3        |
| `@tanstack/react-start`            | 1.168.59       |
| `@tanstack/react-store`            | 0.11.1         |
| `@tanstack/react-table`            | 9.2.4          |
| `@tanstack/store`                  | 0.11.1         |

**devDependencies** (8):

| Package                           | Locked version |
| --------------------------------- | -------------- |
| `@chromatic-com/storybook`        | 5.3.1          |
| `@tanstack/devtools-event-client` | 0.5.0          |
| `@tanstack/devtools-vite`         | 0.8.5          |
| `@tanstack/eslint-config`         | 0.4.0          |
| `@vitest/browser-playwright`      | 5.0.2          |
| `@vitest/coverage-v8`             | 5.0.2          |
| `playwright`                      | 1.63.0         |
| `vitest`                          | 5.0.2          |

How to pin:

1. Try `^<version>` first.
2. Run `pnpm install --lockfile-only`.
3. The lockfile diff may change **only** `specifier:` lines; every `version:`
   line must stay the same.
4. For any package pnpm re-resolved to a newer in-range version, use the
   exact version instead, and repeat until no `version:` line changes.

The goal (Q7) is "pin to current, behaviour-neutral", so an exact pin is
acceptable wherever a caret can't hold.

### 1. Remove Prisma

- Delete `prisma/`, `prisma.config.ts`, `src/db.ts`, `src/database-url.ts`,
  and `public/prisma.svg`.
- `package.json`:
  - remove the dependencies `prisma`, `@prisma/client`, `@prisma/adapter-pg`,
    and `tsx`;
  - remove the scripts `db:generate`, `db:push`, `db:migrate`, `db:studio`,
    `db:seed`, and `post-cta-init`;
  - remove the whole `pnpm` field.
- `pnpm-workspace.yaml`: drop `@prisma/engines` and `prisma` from
  `allowBuilds`.
- `.cta.json`: drop the `prisma` add-on and its options.
- `.env.example`:
  - drop `DATABASE_URL` and its comment;
  - add a commented `# SUPABASE_ACCESS_TOKEN=`, with a comment that
    `supabase login` is preferred and the token is account-wide.
- `.gitignore`: drop the `# Prisma client (pnpm db:generate)` comment and
  `src/generated`.
- `.prettierignore`: drop `src/generated`.
- `eslint.config.js`: drop `src/generated/**` from `ignores`.
- `pnpm install` updates `pnpm-lock.yaml`. Because of section 0, the
  `version:` lines that change are the removed Prisma packages' and their
  now-unused transitive dependencies'. No surviving package changes version.
- `tsx` stays in the lockfile as vite's optional peer. Only its
  devDependency entry goes.

### 2. Type tooling (added, not run, because the remote has drifted)

All of this lands in commit 4.

- `devenv.nix`: add `pkgs.supabase-cli` to `packages`.
- `.gitignore`: add `src/types/database.ts.tmp`, and `supabase/.temp/` (the
  CLI's scratch directory, already untracked on `main`).
- `eslint.config.js`: add `src/types/database.ts` to `ignores`.
- The `package.json` script uses the documented `--lang` flag, so the
  `--help` check in Verification step 4 confirms it:

  ```
  "db:types": "dotenv -e .env.local -- sh -c 'mkdir -p src/types && { supabase gen types --lang typescript --project-id skygtamcakhoirlrqlnq --schema public > src/types/database.ts.tmp || { rm -f src/types/database.ts.tmp; exit 1; }; } && mv src/types/database.ts.tmp src/types/database.ts' && prettier --write src/types/database.ts"
  ```

  The CLI is the canonical generator. The MCP `generate_typescript_types` is
  a fallback only, and its output must be trimmed to `public` and run through
  prettier.

### 3. ADR 0009 and the database docs

New `docs/database/decisions/0009-supabase-js-data-access.md` (Accepted,
2026-10-05):

- **Context**:
  - Prisma is unused and bypasses RLS.
  - `withRls` would cost a transaction per request.
  - The logic already lives in SQL: 16 `public` RPCs, plus `private` helpers
    and triggers.
- **Decision**:
  - **Request path**: user requests use the per-request server client
    (`src/lib/supabase/server.ts`), so RLS is the access control. Procedures
    get it as `ctx.supabase`, added to the tRPC context in
    `src/integrations/trpc/init.ts` (pending; the `TRPCContext` /
    `protectedProcedure` work is on the unmerged `feature/trpc-auth`).
  - **Multi-step or transactional writes**: SQL functions called with
    `.rpc()` and tested with pgTAP. **New** app-callable functions:
    - live in `public`;
    - `revoke execute … from public, anon`, and grant to `authenticated`.
      Supabase also grants `service_role` execute on every `public` function
      by default (verified on the remote); revoke it explicitly to deny;
    - default to `security invoker`. A `security definer` function needs an
      `auth.uid()` or membership check and an entry in `rls.md`'s
      accepted-advisor table.

    Of the 16 existing `public` RPCs, 13 are `security definer` (the ones
    `rls.md`'s accepted-advisor row lists: `create_organization`,
    `accept_invitation`, `approve_quote`, `decline_quote`, and the 9
    `portal_*`) and 3 are `security invoker` (`generate_visits`,
    `reset_job_schedule`, `create_invoice_for_visits`). `rls_auto_enable` is
    a Supabase-managed event-trigger function, not an RPC.

  - **Types**: `pnpm db:types`, committed. The file mirrors the remote (Q6).
  - **Service role**: service-role clients live only in
    `src/server/trusted/`. That covers webhooks, cron, the optimizer
    write-back, and public token pages.
  - **Direct Postgres**: none until a feature needs it, with its own ADR.
- **Consequences**:
  - There's an HTTP hop to PostgREST.
  - Complex reads become views or functions.
  - The active-org filter is still required, because RLS admits every org
    the user belongs to.
  - Column REVOKEs break `select('*')`.
  - `bigint` cents arrive as JS `number`, which is safe below 2^53 (ADR 0004).
  - In service-role code `auth.uid()` is null, so trusted code must not call
    user-scoped RPCs.
  - The project ref is hard-coded.
  - Enforcement: an eslint ban on `SUPABASE_SERVICE_ROLE_KEY` outside
    `src/server/trusted/`, added with the first trusted client.

Other ADR and doc changes:

- **ADR 0007**: status becomes "Superseded by 0009".
- **ADR 0001**: status becomes "Accepted (Prisma bullet superseded by 0009)".
- **`decisions/README.md`**: update the index rows, and add a 0009 row.
- **`docs/database/README.md`**:
  - the Toolchain intro sentence and code block drop Prisma and add
    `src/types/database.ts`;
  - step 5 becomes "check the remote migrations (Q6); `pnpm db:types`;
    `pnpm exec tsc --noEmit`";
  - remove "Do not use prisma migrate" and "Prisma setup (pending)";
  - reword the PostGIS line so it doesn't mention Prisma;
  - the demo-data paragraph: the seed is **not currently applied**, because
    the remote has drifted (see `db/reconcile-remote`);
  - the migration-plan table: add a note that the remote doesn't match it
    until reconciled.
- **`rls.md`**: "Prisma and RLS" becomes "App access and RLS", following ADR 0009.
- **`tables/crews-routing.md`**: "which Prisma issues by default (ADR 0007)"
  becomes "which supabase-js `select('*')` issues (ADR 0009)".
- The docs this PR edits, outside `docs/database/decisions/`, link only to
  ADR 0009. The historical plans keep their 0007 links.

### 4. Workflow, template, agent brief, CLAUDE.md

`docs/process/feature-workflow.md`:

- **Phase 4 layer order**: "Prisma pull/generate" becomes "`pnpm db:types`".
- **Merge condition 1**: remove the "Until drop-prisma lands…" caveat.
- **Schema rules**:
  - delete the `prisma db pull`/`validate` bullet;
  - add the Q6 pre-generation check, plus `pnpm db:types`;
  - add "regenerate after merging `main` in; don't hand-merge
    `database.ts`";
  - add the ADR 0009 RPC exposure and grant rules for new functions.
- **Middleware and tenancy**:
  - the `withRls` bullet becomes: `ctx.supabase`, the per-request server
    client, with RLS as the access control (link ADR 0009);
  - delete the raw-`prisma` sub-bullet;
  - keep the service-role sub-bullet;
  - keep the active-org rule.
- **Definition of done**:
  - remove the tsc caveat;
  - the reviewer bullet's "Verdicts are recorded in the plan's Audit log"
    gains "(light tier: the PR body)". This is the deferred note from PR #8,
    Review 2.
- **Bootstrapping**:
  - the "Prisma client" row becomes "Types: generate and wire
    `createServerClient<Database>` / `createBrowserClient<Database>`; done by
    `db/reconcile-remote`";
  - the "Org-scoped procedure + `withRls`" row is retitled "Org-scoped
    procedure + `ctx.supabase`", with notes to add `ctx.supabase` and the
    verified claims to the `feature/trpc-auth` context;
  - a new row, "Trusted client": read `SUPABASE_SERVICE_ROLE_KEY` from
    `process.env` server-side (`src/env.ts` uses `import.meta.env`, which
    carries only `VITE_` values), plus the eslint ban;
  - the test-project row: fixtures use the service-role client and the auth
    admin API, not a direct connection;
  - a new row, "Remote reconciliation": `db/reconcile-remote`. Until it
    lands, the Q6 pre-check fails; stop and point the user at it.

`docs/plans/_template.md`:

- Layers: "Prisma pull / generate" becomes "Types (`pnpm db:types`)", and
  "`withRls`" becomes "`ctx.supabase`".
- Remove the drop-prisma caveat from the Verify-command comment, keeping
  "tsc runs last" harmless.

`.claude/agents/implementer.md`: remove the drop-prisma tsc caveat and the
`pnpm db:generate` sentence. Any tsc error is now a failure.

`CLAUDE.md`:

- **Project state**: drop "the Prisma `Todo` model".
- **Feature-workflow summary**: the tenancy bullet changes from `withRls` to
  `ctx.supabase` with RLS (ADR 0009).
- **Commands**:
  - the `.env.local` contents drop `DATABASE_URL`;
  - remove the "after a fresh install, run `pnpm db:generate`" note;
  - the devenv line adds `supabase-cli`;
  - the db commands become `pnpm db:types` (inside `devenv shell`).
- **Architecture**:
  - the Schema bullets drop `prisma db pull` and switch to ADR 0009;
  - the Database bullet is rewritten for supabase-js and `.rpc()`. Generated
    types are explicitly **pending** (`src/types/database.ts` doesn't exist
    until `db/reconcile-remote`);
  - the trusted-code list drops "seeds";
  - the Env bullet drops `src/database-url.ts`.
- **A warning line**: the remote has drifted from the migrations until
  `db/reconcile-remote` lands.

`docs/plans/ai-workflow.md` and `docs/plans/agent-roster.md` stay as-is,
because they're historical records. This plan replaces the committed
`docs/plans/drop-prisma.md`. Its old rounds 1–3 are kept in the Audit log
below as history.

## Commits

All are made by the main agent (D7), in this order. Each one builds: tsc
gets clean in commit 3 and stays clean.

1. `Revise the drop-prisma plan`: `docs/plans/drop-prisma.md` gets this plan.
2. `Pin dependencies that were set to latest`: section 0. Only `specifier:`
   lines change in the lockfile.
3. `Remove Prisma and its scaffolding`: section 1 and the lockfile.
4. `Add Supabase CLI and the db:types script`: section 2. This includes the
   `database.ts.tmp` and `supabase/.temp/` gitignore entries and the
   `database.ts` eslint ignore.
5. `Add ADR 0009 for supabase-js data access`: section 3.
6. `Update the workflow, template, implementer brief, and CLAUDE.md for
supabase-js`: section 4.
7. Bookkeeping, after Phase 5: `Record reviews and mark the drop-prisma plan
implemented`. It records the `reviewer` and `security` verdicts in the
   Audit log, and sets the status to `implemented`. Recording verdicts isn't
   a fix, so it doesn't void them; verify is re-run on the new head before
   merging.

## Unhappy paths

- **`supabase gen types --help` shows different flags** than the script uses:
  fix the script before commit 4, and log it in the Scope-change log.
- **The lockfile changes a surviving package's version** (at commit 2 or 3):
  stop. Section 0 didn't hold for that package, so pin it exactly in the
  pinning commit, and redo the commits after it. A surviving package's
  version must never change in this PR.
- **The grep in Verification step 1 finds a Prisma reference** outside the
  allowlist: fix it in the commit that owns that file.
- **`pnpm build` fails** after the removals: stop, find the importer, and fix
  it in commit 3. Never suppress the error.
- **Playwright Chromium can't be installed or launched here** (Verification
  step 3): this environment gap is pre-existing on `main`, which never ran
  vitest. Record it in the PR as a waived DoD item. No stories change in this
  PR.

## Out of scope

- Touching the remote, including the seed and the stranded PR #6 policy.
- Generating or wiring types.
- Any procedure, the org middleware, or SSR cookie forwarding.
- Deduping `dotenv-cli`.

## Dependencies not to add

- No new runtime packages. `supabase-cli` comes from nixpkgs through devenv,
  not npm.

## Follow-up: `db/reconcile-remote`

This is a separate full-tier plan and audit, recorded here so nothing is
lost.

1. **Diff the live schema** against a fresh apply of `main`'s migrations
   (a Supabase branch built from `main`, a schema-only dump, or
   `supabase db diff`). Cover:
   - tables, columns, and functions;
   - event triggers, policies, and grants;
   - storage buckets and their policies.

   Known items so far:
   - `job_line_item_taxes`;
   - the remote-only `routing` and `tenancy_identity` content;
   - PR #6's stranded member policy (`6ba2fc4`): decide whether to restore
     it;
   - `rls_auto_enable` and its event trigger: keep or recreate them
     explicitly.

2. **Bring in what the repo needs** (Q4) as migrations, with docs. Summarize
   for the user what is kept and what is discarded before anything
   destructive.
3. **Reset procedure.** No MCP tool resets the main project, so the plan must
   cover:
   - the drop list;
   - preserving `auth.users` and backfilling `profiles`;
   - aligning versions, plus the README table;
   - re-running the advisors, pgTAP, and the seed.
4. **Types**: the first `pnpm db:types` run confirms the exit code, the auth
   flow, and that progress output goes to stderr. Then wire the clients and
   verify in the app.

## Verify command

```
pnpm install --frozen-lockfile && pnpm lint && pnpm check && pnpm build && pnpm exec tsc --noEmit
```

## Verification

1. Run
   `grep -rniE "prisma|withRls|DATABASE_URL|database-url|db:generate|create-db" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.agents --exclude-dir=.output --exclude-dir=.devenv --exclude-dir=.tanstack --exclude-dir=.claude --exclude=pnpm-lock.yaml --exclude=.env.local .`.
   It should hit only:
   - the ADR bodies of 0001, 0002, 0004 and 0007, ADR 0009, and the ADR
     index;
   - `docs/plans/ai-workflow.md`, `docs/plans/agent-roster.md`, and
     `docs/plans/drop-prisma.md`.

   Separately, `grep -rni "prisma\|drop-prisma" .claude/agents` must find
   nothing.

2. `pnpm-lock.yaml` has no `prisma` or `@prisma` entries. Two lockfile checks
   (lockfile v9 keeps `version:` lines only under `importers:`; transitive
   packages appear only as `name@version` keys under `packages:` and
   `snapshots:`):
   - **Commit 2**: `git diff HEAD~1 -- pnpm-lock.yaml` changes only
     `specifier:` lines. Round 3 simulated this: exactly 22.
   - **Commit 3**: no _new_ package key appears. Check with
     `diff <(git show HEAD~1:pnpm-lock.yaml | grep -E '^  [^ ].*:$' | sort) <(grep -E '^  [^ ].*:$' pnpm-lock.yaml | sort) | grep '^>'`,
     which must print nothing; removed keys must all be Prisma-related.
   - **Expected noise, not failures**:
     - the `-        version: 4.23.15` line for the `tsx` devDependency,
       because `tsx` survives as vite's peer at the same version;
     - a few snapshots (`denque`, `long`, and others) switching from `{}` to
       `optional: true` at the same version.
3. The verify command passes, with **0** tsc errors. Then, as a separate
   check (it isn't in the verify command, because it needs a browser): run
   `pnpm exec playwright install chromium`, then `pnpm exec vitest run`.
   That confirms removing the dependencies didn't break Storybook. If
   Chromium can't run, see Unhappy paths.
4. In `devenv shell`, `supabase --version` prints 2.111.0, and
   `supabase gen types --help` confirms the flags. `db:types` is **not** run.
5. Smoke check:
   - if `.env.local` has the `VITE_SUPABASE_*` values, `pnpm dev` starts and
     `/sign-in` loads;
   - otherwise the in-app DoD item is waived (there's no runtime change), and
     the waiver is noted in the PR.
6. The link check exits 0:

   ```
   node -e 'const fs=require("fs"),p=require("path");let b=0;for(const f of process.argv.slice(1))for(const m of fs.readFileSync(f,"utf8").matchAll(/\]\(([^)\s]+)\)/g)){let t=m[1];if(/^(https?:|mailto:|#)/.test(t))continue;t=t.split("#")[0];if(!fs.existsSync(p.resolve(p.dirname(f),t))){b++;console.log(f,"->",m[1])}}process.exit(b?1:0)' CLAUDE.md docs/process/feature-workflow.md docs/plans/_template.md docs/plans/drop-prisma.md docs/database/README.md docs/database/rls.md docs/database/tables/crews-routing.md docs/database/decisions/README.md docs/database/decisions/0009-supabase-js-data-access.md .claude/agents/implementer.md
   ```

7. Phase 5:
   - `reviewer` passes;
   - `security` passes, because `rls.md` and `.env.example` are gated.
8. Merge (the user's standing instruction): every Merge-section condition
   holds, then `gh pr merge --merge`.
9. Remind the user to delete `DATABASE_URL` from their own `.env.local`.

## Audit log

### History: rounds 1–3 under the old general-purpose auditor (before PR #8)

- **Round 1**: 6 material and 10 minor findings.
- **Round 2**: 4 material and 9 minor findings.
- **Round 3**: 1 material and 9 minor findings.

All were resolved into this plan; the details are in the previous revision of
`docs/plans/drop-prisma.md` (commit `faceca8`). The flow was then paused
(R2 of the agent-roster plan).

### Round 1 (`plan-auditor`): needs-changes, confidence high

| #   | Blocking finding                                                      | Resolution                                                                                                                                                                   |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | ADR 0009 says "14 existing `security definer` RPCs", but there are 13 | Verified by grepping the migrations: 16 unique `public` functions, 13 definer and 3 invoker. Fixed: ADR text names all 13 and the 3, and says `rls_auto_enable` isn't an RPC |

**Non-blocking notes, all adopted:**

- the `db:types` script and the type-file ignores moved to commit 3;
- the script uses `--lang typescript`;
- the link-check command is written out;
- a bookkeeping commit 6 was added;
- the Open questions, Assumptions, and Design refs sections were added;
- D7 now states plainly that it departs from the workflow;
- CLAUDE.md marks the types as pending;
- the ADR-link sentence is scoped to the docs this PR edits;
- a vitest check was added. Running it showed Playwright's Chromium isn't
  installed on this machine, a pre-existing gap, so it is a separate
  verification step with a waiver path.

**Pre-existing**, noted and not fixed here:

- `src/env.ts` can't populate `SUPABASE_SERVICE_ROLE_KEY` (covered by the
  Bootstrapping row);
- `@faker-js/faker` is unused;
- tsconfig `**/*.ts` could include agent worktrees. That directory is empty
  except during implementer runs; follow-up candidate.

### Round 2 (`plan-auditor`): needs-changes, confidence high

| #   | Blocking finding                                                                                  | Resolution                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | `pnpm install` also re-resolves every `latest` dependency, so the lockfile can't be removals-only | Verified: there are 22 `latest` specifiers. Escalated, and the user decided Q7: pin to the current versions first (commit 2, section 0), using exact pins wherever a caret would re-resolve. Assumptions row, Unhappy path, and Verification step 2 updated |

- **Round 1's B1** (13 vs 14) is confirmed closed.
- **Non-blocking notes adopted**:
  - the Plan-mode file line was added;
  - the agents grep is now `-i`;
  - `supabase/.temp/` is gitignored in commit 4;
  - `tsx` stays in the lockfile as vite's peer.

  The Acceptance criteria are covered by the Verification list (noted).

- **Process note for later**: this auditor wrote scratch copies to `/tmp` to
  simulate the lockfile, which breaks its brief ("do not create files"). No
  harm resulted (`git status` stayed clean), and the simulation was
  valuable. The `plan-auditor` brief should explicitly allow scratch-only
  writes under the session scratchpad. That's a follow-up for the roster,
  not this PR.

### Round 3 (`plan-auditor`): **pass**, confidence high

- **Both previous blockers are closed**, and round 3 confirmed it by
  simulation in the session scratchpad (the repo was untouched):
  - the caret pins change exactly 22 `specifier:` lines and nothing else, so
    no exact-pin fallback is needed;
  - the commit-3 removal deletes only Prisma-related keys, and `tsx@4.23.15`
    survives as vite's peer.
- **Non-blocking notes adopted after the pass.** These tighten bookkeeping
  and the verification method with no change in behaviour, so they aren't
  material and don't reset the status:
  - commit numbers fixed (section 2 lands in commit 4, the script check
    happens before commit 4, and a build fix goes in commit 3);
  - Verification step 2 is rewritten to compare package keys, because lockfile
    v9 has no transitive `version:` lines, and it lists the expected `tsx` and
    `optional` noise.

## Scope-change log

- Planning: types generation and wiring (Q3) were split out to
  `db/reconcile-remote` after the remote drift was found (Q5, user).
- Re-planning after PR #8: the plan was rebuilt in the new template shape
  (Commits, Unhappy paths, Verify command, Dependencies not to add,
  security-gated paths). It also absorbs every drop-prisma caveat that PR #8
  added, and the deferred PR #8 Review 2 note.
