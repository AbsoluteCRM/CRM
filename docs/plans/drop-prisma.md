# Plan: Drop Prisma for Supabase-JS

- **Slug / branch**: `drop-prisma` / `chore/drop-prisma`
- **Tier**: full. It touches more than one layer: data access, tooling,
  `docs/database`, ADRs, and the workflow rules.
- **Status**: draft, **paused** (2026-10-05) while `chore/agent-roster`
  lands. Resumes with a fresh round 1 under the new `plan-auditor`.
- **Confidence**: 95%. Q1–Q6 come from the user. The repo facts were verified:
  - nothing in `src/` uses Prisma;
  - the remote has drifted (MCP `list_migrations`, `information_schema`);
  - `supabase-cli` 2.111 is in nixpkgs;
  - the `@supabase/ssr` 0.12.7 generics were checked by the auditor.
- **Plan-mode file**: `~/.claude/plans/fluttering-wishing-reef.md`

## Original request

> Should we ditch prisma for just raw sql with supabase?
>
> (after the recommendation) Drop prisma
>
> (mid-planning, about the remote drift) Merge in changes from supabase if
> neded

## Context

Prisma was a scaffold add-on. The schema is hand-written SQL (ADR 0001), so
Prisma's schema language and migrations go unused. It connects as `postgres`
and bypasses RLS, which forced ADR 0007's `withRls()` wrapper. Nothing in
`src/` uses it. The replacement:

- **Request path**: supabase-js with the user's session, so RLS applies
  natively.
- **Types**: generated from the schema.
- **Multi-step writes**: `public` SQL functions called with `.rpc()`.
- **Trusted work**: a service-role client.

During planning, the audit found that **the remote has drifted from the repo**:

- **Migrations**: the remote has 8, re-applied on 2026-10-02, and their
  content differs from the repo's 13.
- **Missing from the remote**:
  - the migrations `drop_legacy_tables`, `fix_accept_invitation_email_match`,
    `fix_visit_actuals_check`, `invoices_payments`, and `time_tracking`;
  - all seed data (it has 0 orgs, but 2 auth users and profiles).
- **Only on the remote**:
  - the table `job_line_item_taxes`;
  - the function `rls_auto_enable`, which is in no migration and is
    executable by `anon`;
  - remote-specific content in `routing` and `tenancy_identity`.
- **Stranded in neither place**: PR #6 (`db/capture-drift`, merge commit
  `6ba2fc4`) captured a dashboard policy on `organization_members`, "Enable
  users to view their own data only", as
  `supabase/migrations/20261002011300_capture_dashboard_member_policy.sql`,
  plus a README edit. It merged into `db/schema-foundation` _after_ that
  branch had already merged to `main`. So it is in neither `main` nor the
  remote, which re-applied its migrations at 01:41. The policy matters
  because it lets invited and disabled members see their own membership rows.
- `rls_auto_enable` is already documented in `rls.md`'s accepted-advisor
  table as a Supabase-managed event-trigger function, so it isn't
  unexplained drift. Dropping `public` would cascade-drop it.

Types generated from it now would be wrong, so this PR stops at removal and
tooling. A follow-up `db/reconcile-remote` task fixes the remote and then
generates and wires the types.

## Decisions

| #   | Question                      | Answer                                                                                                                                                                                                     |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —   | Drop Prisma?                  | Yes: "Drop prisma"                                                                                                                                                                                         |
| Q1  | Type generation               | Supabase CLI via devenv, plus `pnpm db:types` (`supabase login` or `SUPABASE_ACCESS_TOKEN`); agents may use the MCP `generate_typescript_types`. Output committed                                          |
| Q2  | `DATABASE_URL`                | Remove it. Trusted work uses the service-role client; a future direct-SQL need adds its own client with an ADR                                                                                             |
| Q3  | Generate and wire types now   | Originally yes. **Revised by Q5**: deferred to `db/reconcile-remote`                                                                                                                                       |
| Q4  | Remote drift origin           | Unknown, and safe to reset. Before resetting, merge in anything on the remote that the repo needs ("Merge in changes from supabase if neded")                                                              |
| Q5  | Sequencing                    | Split: this PR drops Prisma and adds the tooling and docs. `db/reconcile-remote` reconciles the remote, then generates and wires the types                                                                 |
| Q6  | Types rule on a shared remote | Mirror the remote. Before generating, remote migrations must equal main's plus this branch's plus other open PRs'; otherwise stop and tell the user. After merging main, regenerate rather than hand-merge |

Agent defaults (minor; the user may veto them):

- **D1**: ADR 0009 supersedes 0007 and amends 0001's Prisma bullet. Old ADR
  bodies are untouched; only status lines and the index change.
- **D2**: types go in `src/types/database.ts`, for the `public` schema only.
  eslint ignores the file.
- **D3**: remove these, which existed only for Prisma:
  - `tsx` (only the Prisma seed used it);
  - the `post-cta-init` script (Prisma's `create-db`);
  - the Prisma entries in `.cta.json` and in `pnpm-workspace.yaml` `allowBuilds`;
  - the whole dead `package.json` `pnpm` field (pnpm warns it's ignored; `allowBuilds` replaces it);
  - the `src/generated` ignores.
- **D4**: demo data stays in `supabase/seed.sql`, and `db:seed` is removed.
- **D5**: `dotenv-cli` stays, because `dev` and `db:types` use it.
- **D6**: the project ref is hard-coded in `db:types`. ADR 0009 notes that
  Supabase branches would need `--project-id` overridden.

## Layers touched

- [ ] Migration / RLS: none. The remote isn't touched (`db/reconcile-remote` handles it).
- [x] `docs/database`: README, `rls.md`, `tables/crews-routing.md`, ADRs
- [x] Data-access rules (ADR 0009, workflow, CLAUDE.md)
- [x] Tooling: `package.json`, `pnpm-workspace.yaml`, `devenv.nix`, ignores, `.env.example`, `.cta.json`
- [ ] Procedures, routes, UI, types wiring: none
- [ ] Stories / tests: none. There is no behaviour change.

## Changes

### 1. Remove Prisma

- Delete `prisma/`, `prisma.config.ts`, `src/db.ts`, `src/database-url.ts`, and
  `public/prisma.svg`, an unreferenced scaffold asset.
- `.gitignore`: drop the `# Prisma client (pnpm db:generate)` comment along
  with the `src/generated` entry.
- `package.json`:
  - remove the dependencies `prisma`, `@prisma/client`, `@prisma/adapter-pg`, and `tsx`;
  - remove the scripts `db:generate`, `db:push`, `db:migrate`, `db:studio`, `db:seed`, and `post-cta-init`;
  - remove the whole `pnpm` field;
  - add the `db:types` script (section 2).
- `pnpm-workspace.yaml`: drop `@prisma/engines` and `prisma` from `allowBuilds`.
- `.cta.json`: drop the `prisma` add-on and its options.
- `.env.example`:
  - drop `DATABASE_URL`;
  - add a commented `# SUPABASE_ACCESS_TOKEN=`, needed by `pnpm db:types` unless you ran `supabase login`.
- `.gitignore`, `.prettierignore`, `eslint.config.js`: drop `src/generated`. eslint ignores `src/types/database.ts`.
- `pnpm install` updates the lockfile.
- I'll tell the user to delete `DATABASE_URL` from their own `.env.local`.

### 2. Type tooling (not run in this PR)

- `devenv.nix`: add `pkgs.supabase-cli`.
- `package.json` script, which writes to a temp file so a failed run doesn't empty the tracked file:

  ```
  "db:types": "dotenv -e .env.local -- sh -c 'mkdir -p src/types && { supabase gen types typescript --project-id skygtamcakhoirlrqlnq --schema public > src/types/database.ts.tmp || { rm -f src/types/database.ts.tmp; exit 1; }; } && mv src/types/database.ts.tmp src/types/database.ts' && prettier --write src/types/database.ts"
  ```

  The CLI is the canonical generator. Use the MCP `generate_typescript_types`
  only as a fallback; its output must be trimmed to the `public` schema and run
  through prettier, so `database.ts` doesn't churn.

  Before committing, check the flags with `supabase gen types --help` inside
  `devenv shell`, and confirm the CLI's progress output goes to stderr. If the
  flags differ, adjust them.

- `.gitignore`: `src/types/database.ts.tmp`.

### 3. ADR 0009 and database docs

New `docs/database/decisions/0009-supabase-js-data-access.md` (Accepted,
2026-10-05):

- **Context**:
  - Prisma's schema language and migrations are unused, and it bypasses RLS.
  - `withRls` costs a transaction per request.
  - Logic already lives in SQL: 16 `public` RPCs, plus `private` helpers and
    triggers.
- **Decision**:
  - **Request path**:
    - User requests use the per-request Supabase server client
      (`src/lib/supabase/server.ts`), carrying the user's session, so RLS is
      the access control.
    - It's exposed to procedures as `ctx.supabase`, which extends
      `origin/feature/trpc-auth`'s context.
  - **Multi-step or transactional writes** are SQL functions called with
    `.rpc()` and tested with pgTAP. App-callable functions:
    - live in `public`; `private` isn't exposed by PostgREST;
    - `revoke execute … from public, anon`, and grant to `authenticated`.
      Supabase's default privileges already grant `service_role` execute on
      every `public` function (verified on the remote). To deny it, write an
      explicit `revoke … from service_role`;
    - default to `security invoker`. `security definer` needs an explicit
      `auth.uid()` or membership check and an entry in `rls.md`'s
      accepted-advisor table.
  - **Types**: `pnpm db:types`, committed. The file mirrors the remote (Q6).
  - **Service role**: service-role clients only in `src/server/trusted/`.
    That includes webhooks, cron, the optimizer write-back, and public token
    pages such as the pay-invoice link.
  - **Direct Postgres**: none until a feature needs it; that feature adds it
    with its own ADR.
- **Consequences**:
  - There's an HTTP hop to PostgREST.
  - Complex reads become views or functions.
  - The active-org filter is still required.
  - Column REVOKEs break `select('*')`.
  - `bigint` cents arrive as JS `number`, which is safe below 2^53 cents
    (ADR 0004).
  - Service-role code can call every `public` function, but `auth.uid()` is
    null there. Functions that rely on it then fail their own checks or
    misbehave, so trusted code must not call user-scoped RPCs.
  - The project ref is hard-coded, so branches need `--project-id`
    overridden.
  - Enforcement: an eslint rule should ban `SUPABASE_SERVICE_ROLE_KEY` outside
    `src/server/trusted/`. This is added with the first trusted client.

Other ADR and doc changes:

- **ADR 0007**: status becomes "Superseded by 0009".
- **ADR 0001**: status becomes "Accepted (Prisma bullet superseded by 0009)".
- **`decisions/README.md`**: update the index rows, and add a 0009 row.
- **`docs/database/README.md`**:
  - The Toolchain intro sentence and code block: drop the Prisma lines, and add `src/types/database.ts`.
  - Step 5 becomes: check the remote migrations (Q6), run `pnpm db:types`, then `pnpm exec tsc --noEmit`.
  - Remove "Do not use prisma migrate" and "Prisma setup (pending)".
  - Reword line 90 (PostGIS) so it doesn't mention Prisma.
  - The demo-data paragraph: the seed is **not currently applied**; the remote has drifted (see `db/reconcile-remote`).
  - The migration-plan table: add a note that the remote doesn't match it until reconciled.
- **`rls.md`**: "Prisma and RLS" becomes "App access and RLS", following ADR 0009.
- **`tables/crews-routing.md`**: "which Prisma issues by default (ADR 0007)" becomes "which supabase-js `select('*')` issues (ADR 0009)".

### 4. Workflow rules and CLAUDE.md

`docs/process/feature-workflow.md`:

- **Schema**:
  - Drop the `db pull` and `schema.prisma` rules.
  - Add the Q6 pre-generation check, `pnpm db:types`, and "regenerate after merging `main` in; don't hand-merge `database.ts`".
  - Add the RPC exposure and grant rules from ADR 0009.
- **Middleware**:
  - `withRls` is replaced by `ctx.supabase`, the per-request server client, with RLS as the access control.
  - Delete the sub-bullet that names `withRls`, `prisma/seed.ts`, and the raw `prisma` client as trusted locations.
  - Docs outside the ADR folder link only to ADR 0009, never to the superseded 0007.
  - The active-org filter rule stays.
  - Service-role clients are allowed only in `src/server/trusted/`.
- **Layer order**: "Prisma pull/generate" becomes "`pnpm db:types`".
- **Bootstrapping**:
  - The Prisma client row becomes "Generate and wire types: done by `db/reconcile-remote`".
  - The org-procedure row: add `ctx.supabase` and verified claims to the tRPC context, extending `feature/trpc-auth`.
  - A new row, trusted client: read `SUPABASE_SERVICE_ROLE_KEY` from `process.env` on the server only (`src/env.ts` reads `import.meta.env`, which carries only `VITE_` values), and add the eslint restriction.
  - The test-project row: fixtures use the service-role client and the auth admin API, not a direct connection.
  - A new row, remote reconciliation: done by `db/reconcile-remote`. Until it lands, the Q6 pre-check fails, so stop and point the user at it.
- **DoD**: the tsc caveat is removed, because tsc is now clean.

`docs/plans/_template.md`: the layer list's "Prisma pull / generate" becomes
"Types (`pnpm db:types`)", and "`withRls`" becomes "`ctx.supabase`".

`CLAUDE.md`:

- **Project state**: drop "the Prisma `Todo` model".
- **Commands**: the db lines become `pnpm db:types`, run inside `devenv shell`. Remove the `db:generate` after-install note.
- **`.env.local` contents**: drop `DATABASE_URL`.
- **devenv line**: add `supabase-cli`.
- **Schema and Database bullets**: switch to ADR 0009, and remove `prisma db pull`.
- **Trusted-code list**: drop "seeds".
- **Tenancy summary**: replace `withRls`.
- **Env bullet**: drop `src/database-url.ts`.
- **Add a warning**: the remote has drifted from the migrations until `db/reconcile-remote` lands.

`docs/plans/ai-workflow.md` stays as-is, because it's a historical record.
`docs/plans/drop-prisma.md` is this plan, committed first.

## Follow-up: `db/reconcile-remote`

This is a separate full-tier task with its own plan and audit. It is listed
here so nothing is lost.

1. **Diff the live schema, not just the migration text.** Compare the remote
   with a fresh apply of `main`'s migrations, for example on a Supabase
   branch built from `main`, or with a schema-only dump or `supabase db diff`.
   Cover:
   - tables, columns, and functions;
   - event triggers, policies, and grants;
   - storage buckets and their policies.

   List every difference. Known so far:
   - `job_line_item_taxes`;
   - the remote-specific `routing` and `tenancy_identity` content;
   - PR #6's stranded member policy (commit `6ba2fc4`). Decide whether to
     restore it;
   - `rls_auto_enable` and its event trigger: keep or recreate explicitly,
     since `rls.md` documents them as intended.

2. **Bring in what the repo needs** (Q4): add those changes as new
   migrations, with docs. Before anything destructive, summarize for the user
   what is kept and what is discarded.
3. **Reset procedure.** No MCP tool resets the main project, so the plan must
   spell out:
   - which schemas and objects are dropped: `public`, `private`, the
     `org-files` objects and policies, and the `supabase_migrations` rows;
   - preserving `auth.users` and backfilling `profiles`. The remote has 2
     users; the profile trigger fires only on insert;
   - how versions are aligned: rename the local files to the versions
     `apply_migration` assigns, or insert history rows, and update the README
     migration table to match;
   - re-running the advisors, pgTAP, and the seed.
4. **Types**: run `pnpm db:types`, wire `createServerClient<Database>` and
   `createBrowserClient<Database>`, and verify in the app with a test user.

## Out of scope

- Touching the remote.
- Any procedure, the org middleware, or SSR cookie forwarding.
- Deduping `dotenv-cli`.

## Verification

1. Run
   `grep -rniE "prisma|withRls|DATABASE_URL|database-url|db:generate|create-db" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.agents --exclude=pnpm-lock.yaml --exclude=.env.local .`.
   It should hit only:
   - the ADR bodies of 0001, 0002, 0004 and 0007, ADR 0009, and the ADR index;
   - `docs/plans/ai-workflow.md`, and `docs/plans/drop-prisma.md`.
2. `pnpm install` succeeds, and `pnpm-lock.yaml` has no `prisma` or
   `@prisma` entries.
3. `pnpm exec tsc --noEmit` reports **0 errors**; it was 2 before.
4. `pnpm lint` and `pnpm check` pass.
5. `pnpm build` succeeds.
6. In `devenv shell`, `supabase --version` prints 2.111.0 (verified for the
   pinned nixpkgs), and `supabase gen types --help` confirms the script's
   flags. `db:types` is **not** run against the drifted remote.
7. Smoke check: `pnpm dev` starts. If `.env.local` has the `VITE_SUPABASE_*`
   values, `/sign-in` loads. Otherwise the in-app DoD item is waived for this
   PR, because it makes no runtime change and that check moves to the
   follow-up; log the waiver in the PR.
8. The relative links in the changed docs resolve.
9. Commits go through the hooks.
10. Merge: the user said "Merge the PRs autonomously". Once verification
    passes, merge the PR with a merge commit.

## Audit log

### Round 1 (fresh general-purpose agent): DEFEATED, 6 material and 10 minor

| #   | Finding                                                        | Resolution                                                                 |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| M1  | The remote has drifted, so the types would be wrong            | Verified. Escalated: Q4/Q5 (user). Types deferred to `db/reconcile-remote` |
| M2  | "Only this branch's changes" rule can't be followed            | Escalated: Q6 (user), mirror plus pre-check                                |
| M3  | RPC exposure and grants unspecified; "72 functions" overstated | Fixed: ADR 0009 RPC rules, workflow Schema rule, corrected count           |
| M4  | `db:types` doesn't load env; a failed run truncates the file   | Fixed: `dotenv` wrapper, temp-file write, `.env.example` entry             |
| M5  | Prisma `post-cta-init` (`create-db`) script left behind        | Fixed: removed; added to the grep                                          |
| M6  | In-app verification impossible (env, no user)                  | Fixed: no runtime change in this PR; dropped. Moved to the follow-up       |
| 7   | Grep allowlist wrong                                           | Fixed: ADR index allowed; `.env.local` excluded                            |
| 8   | Unlisted doc edits                                             | Fixed: listed in section 4 / 3                                             |
| 9   | Dead `pnpm` field                                              | Fixed: D3                                                                  |
| 10  | Test fixtures without `DATABASE_URL`                           | Fixed: Bootstrapping row                                                   |
| 11  | Service-role key unreadable via `import.meta.env`              | Fixed: Bootstrapping row                                                   |
| 12  | ADR 0007's enforcement idea dropped                            | Fixed: ADR 0009 consequence and Bootstrapping                              |
| 13  | bigint and grant consequences                                  | Fixed: ADR 0009                                                            |
| 14  | Hard-coded project id vs branching                             | Fixed: D6, ADR 0009                                                        |
| 15  | Relationship to `trpc-auth`                                    | Fixed: ADR 0009, Bootstrapping                                             |
| 16  | CLI flags unverified                                           | Fixed: Verification step 6, and a check before committing                  |

### Round 2 (fresh general-purpose agent): DEFEATED, 4 material and 9 minor

| #   | Finding                                                    | Resolution                                                                                                             |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| M1  | `service_role` grant claim is false                        | Verified on the remote (all `public` functions are executable by `service_role`). Fixed: ADR 0009 rule and consequence |
| M2  | `db:types` fails because `src/types/` doesn't exist        | Fixed: `mkdir -p`, and `rm` the temp file on failure                                                                   |
| M3  | Follow-up diff misses objects that aren't in any migration | Fixed: the follow-up step 1 diffs the live schema; `rls_auto_enable` listed                                            |
| M4  | Follow-up reset under-specified (auth users, versions)     | Fixed: the follow-up step 3 lists what its plan must cover. The follow-up gets its own full plan and audit             |
| 1   | `.gitignore` comment                                       | Fixed                                                                                                                  |
| 2   | `public/prisma.svg`                                        | Fixed: deleted                                                                                                         |
| 3   | Links to ADR 0007 trip the grep                            | Fixed: link only to 0009 outside the ADR folder                                                                        |
| 4   | Middleware sub-bullet deletion                             | Fixed: explicit                                                                                                        |
| 5   | MCP and CLI output differ                                  | Fixed: the CLI is canonical; MCP is a trimmed fallback                                                                 |
| 6   | CLI version                                                | Verified 2.111.0 at the pinned rev                                                                                     |
| 7   | DoD in-app item                                            | Fixed: smoke check, or a logged waiver                                                                                 |
| 8   | Follow-up only recorded here                               | Fixed: Bootstrapping row                                                                                               |
| 9   | Drift summary incomplete                                   | Fixed: Context                                                                                                         |

### Round 3 (fresh general-purpose agent): DEFEATED, 1 material and 9 minor; the flow was then paused

The user found the auditor flow weak and paused this plan to build a proper
agent roster first (`chore/agent-roster`). When this plan resumes, a fresh
round 1 under the new `plan-auditor` must also address the round 3 items:

- **M1**: PR #6's policy is stranded. Verified with the GitHub compare API.
  Already recorded in Context and the follow-up.
- **Branch base**: branch from `origin/main`. Local `main` is behind.
- **Grep**: exclude `.output`, `.devenv`, and `.tanstack`.
- **Bootstrapping row title**: rename the title that names `withRls`.
- **Bookkeeping before merge**: move the plan's status along, and mark the
  N/A DoD items in the PR body.
- **ADR 0009**: point it at `init.ts`, not at a branch.
- **`security invoker`**: the default applies to _new_ functions; 14 of the
  16 existing RPCs are definer.
- **`.env.example`**: recommend `supabase login` over the account-wide token.
- **Follow-up**: the first `db:types` run checks the exit code and that
  progress output goes to stderr.

## Scope-change log

- Planning: types generation and wiring (Q3) were split out to
  `db/reconcile-remote` after the round 1 audit found the remote had drifted
  (Q5, user).
