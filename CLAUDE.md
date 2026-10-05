# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

A multi-tenant CRM for contractor businesses, built on a scaffolded TanStack Start app (created with `create-tsrouter-app`; add-ons listed in `.cta.json`). The database schema is in place (see `docs/database/`). Supabase sign-in and sign-up and the `_authed` page shells exist, but most domain code has not been written yet. The `todos` tRPC router, the Prisma `Todo` model, the `messagesCollection`, and `src/stories/*` are scaffold examples. Replace them rather than building on them.

## Feature workflow

Every change follows [docs/process/feature-workflow.md](docs/process/feature-workflow.md). Read it before starting work. In short:

- **Ask before planning.** Work in native plan mode (call `EnterPlanMode` if you aren't in it). Ask the user questions until at least 95% of the plan's material choices rest on their answers or on verified repo facts. List the open questions and assumptions; don't guess.
- **Plan, then try to defeat the plan.** Write the plan from [docs/plans/\_template.md](docs/plans/_template.md). For full-tier work, a fresh `plan-auditor` agent (never a fork) audits it each round until it returns `pass`. A blocking finding must be grounded (location, evidence, the written rule it breaks, the concrete failure). A recurring finding, or one saying the approach is wrong, goes to the user at once; otherwise escalate after 3 rounds. Small single-layer `fix/` or `chore/` work (the light tier) skips only the audit.
- **The user's approval on leaving plan mode is the go.** Only then create the branch (`feat/<slug>`, `fix/`, `db/`, `chore/`) from `origin/main`, commit the plan as `docs/plans/<slug>.md`, and open a draft PR.
- **One PR per feature, end to end.** Migration, `docs/database`, middleware, procedures, routes and UI, stories and tests, and the design record (`docs/<feature>/ui.md` plus screenshots, see [docs/design/](docs/design/README.md)) ship together, across as many commits as needed.
- **Agents** ([.claude/agents/](.claude/agents/)): `plan-auditor` (plans), `implementer` (builds in a worktree and pushes to the PR branch), `reviewer` (every diff before merge), and `security` (a hard gate on migrations, auth, tRPC, Supabase clients, routes and env). Dispatch them by `subagent_type` without a `model`. Only the main agent writes to the remote database; the read-only agents get Supabase list and inspect tools only.
- **Done** means: tsc, lint and prettier pass; procedure tests (cross-tenant, multi-org, per-role); stories with interaction tests; verified in the running app; reviewer (and security, if gated) passed; docs updated.
- **Merge autonomously only through the gate**: verify passes fresh on the PR head, the reviewer passed, security passed if gated, `main` merged in cleanly, the plan is `implemented`, and the PR is out of draft. Then `gh pr merge --merge`. Otherwise stop and report.
- **Tenancy**: user requests reach Prisma only through `withRls` (ADR 0007) and also filter by the active org. Never use `publicProcedure` for domain data.
- **No surprises.** If the plan turns out wrong mid-build, stop, update the plan, and re-ask. Never use `--no-verify`.

## Commands

Package manager is **pnpm**. Env vars come from `.env.local` (gitignored). It holds `DATABASE_URL`, the Supabase keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), and the Sentry `VITE_SENTRY_*` / `SENTRY_AUTH_TOKEN` values. Scripts that need these values wrap themselves in `dotenv -e .env.local`. After a fresh install, run `pnpm db:generate`. The Prisma client in `src/generated/` is gitignored, and tsc fails without it.

The toolchain comes from **devenv** (`devenv.nix`: Node 22, TypeScript, git-lfs). Enter it with `devenv shell`; the repo has no `.envrc` for direnv. devenv generates the gitignored `.pre-commit-config.yaml`, so change `devenv.nix` rather than that file. `.devcontainer/devcontainer.json` is committed by hand. On commit, the git hooks run prettier (the repo's pinned version) on staged files and nixfmt on `.nix` files. Entering the shell also runs `git lfs install --local`, because screenshots under `docs/` are stored in Git LFS.

```bash
pnpm dev                 # dev server on :3000 (loads Sentry via instrument.server.mjs)
pnpm build               # vite build → .output/ (Nitro); copies instrument.server.mjs in
pnpm start               # run the built server from .output/server
pnpm lint                # eslint
pnpm format              # prettier --write + eslint --fix
pnpm check               # prettier --check
pnpm exec tsc --noEmit   # typecheck (no script for it)

pnpm db:generate         # prisma generate → src/generated/prisma (run after schema changes)
pnpm db:push | db:migrate | db:studio | db:seed

pnpm storybook           # Storybook on :6006
pnpm exec vitest run                                   # all tests
pnpm exec vitest run src/stories/Button.stories.ts     # single file
```

The only Vitest project so far is `storybook`, set up in `vite.config.ts`. It runs stories as tests in headless Chromium through Playwright, so Playwright's Chromium must be installed (`pnpm exec playwright install chromium`). The project has no plain unit-test project yet.

The README says the build output goes to `dist/`. It's wrong: Nitro writes to `.output/`.

## Architecture

- **Framework**: TanStack Start (React 19, SSR) on Vite 8 + Nitro. React Compiler is enabled through the babel plugin in `vite.config.ts`.
- **Routing**: file-based routes in `src/routes/`. `src/routeTree.gen.ts` is generated, so don't edit it by hand (it regenerates on dev, or run `pnpm generate-routes`). `__root.tsx` is the HTML shell and devtools host. It also declares the router context type `{ queryClient, trpc }`.
- **Data flow (tRPC + TanStack Query)**:
  - Procedures live in `src/integrations/trpc/router.ts` and are built from `init.ts` (superjson transformer). `init.ts` has only `publicProcedure` with no context on `main`. `origin/feature/trpc-auth` adds a user context and `protectedProcedure`; build org scoping on that branch rather than writing a second one.
  - They're served by the catch-all API route `src/routes/api.trpc.$.tsx` at `/api/trpc`.
  - `src/integrations/tanstack-query/root-provider.tsx` creates the tRPC client (`httpBatchStreamLink`; absolute `localhost:$PORT` URL during SSR). It also creates a `QueryClient` per request with superjson (de)hydration and a `createTRPCOptionsProxy`.
  - `src/router.tsx` passes these into router context and wires `setupRouterSsrQueryIntegration`. In route loaders, use `context.trpc.x.y.queryOptions()` with `context.queryClient`. In components, use `useTRPC()` from `src/integrations/trpc/react.ts`.
  - The SSR tRPC link sends no cookies yet, so loaders can't prefetch authenticated procedures until that is fixed. See Bootstrapping in the workflow doc.
- **Auth**:
  - Supabase Auth, via `@supabase/ssr` clients in `src/lib/supabase/` (`server.ts` per request, `client.ts` for the browser).
  - `src/integrations/auth/context.tsx` provides `useAuth()`, and `src/integrations/organization/context.tsx` provides the current org (a placeholder shape for now).
  - `src/routes/_authed.tsx` is the layout for signed-in pages. Its guard is client-only.
- **Schema design**: `docs/database/` is the design record. It holds the conventions, ERD, per-table reference, RLS model, and ADRs. Read it before touching the schema, and update it in the same change.
  - The schema's source of truth is hand-written SQL in `supabase/migrations/`. It is applied to the remote Supabase project through the Supabase MCP `apply_migration` tool under the same name, and then the local file is renamed to the version the tool assigned.
  - `prisma/schema.prisma` is generated by `prisma db pull`. Don't use `prisma migrate` or `db push`.
  - Prisma connects as `postgres`, which bypasses RLS. So, per ADR 0007, user requests must go through `withRls(claims, tx => …)`, which isn't built yet. The raw `prisma` client and service-role Supabase clients are for trusted code only (`src/server/trusted/`, seeds).
- **Database**: Prisma 7 with PostgreSQL through the `@prisma/adapter-pg` driver adapter. The client is generated into `src/generated/prisma` (import from `./generated/prisma/client.js`, not `@prisma/client`). `src/db.ts` exports a singleton `prisma` that is cached on `globalThis` in dev. Prisma CLI config (datasource URL, seed command `tsx prisma/seed.ts`) is in `prisma.config.ts`.
- **Client-side collections**: `@tanstack/react-db` collections go in `src/db-collections/`. Only a local-only example exists so far; `@tanstack/query-db-collection` is installed for query-backed collections.
- **Env**: `src/env.ts` uses t3 `createEnv`. Client vars must be prefixed `VITE_`. It validates `SERVER_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_APP_TITLE`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`. `DATABASE_URL` is read directly from `process.env` in `src/database-url.ts`.
- **UI**: shadcn/ui (new-york, zinc, lucide) in `src/components/ui`, Tailwind v4 through `src/styles.css`, and `cn()` in `src/lib/utils.ts`. Add components with `pnpm dlx shadcn@latest add <name>`.
- **Imports**: use the `#/*` alias for `src/*`. It's defined in both `package.json` `imports` and `tsconfig` paths, and it's what shadcn uses. `@/*` also resolves but is not the convention.

## Conventions

- Prettier: no semicolons, single quotes, trailing commas. ESLint uses `@tanstack/eslint-config` with import-order rules turned off, plus the storybook and unicorn (for `.js` files) configs.
- **Sentry** (from `.cursorrules`): error collection is automatic. Wrap server function implementations (`createServerFn` handlers) in a Sentry span:
  ```ts
  import * as Sentry from '@sentry/tanstackstart-react'
  Sentry.startSpan({ name: 'Describe the operation' }, async () => {
    /* ... */
  })
  ```
  Sentry is initialized server-side in `instrument.server.mjs`, which is loaded with `node --import`. It is a no-op when `VITE_SENTRY_DSN` is unset. `.cursorrules` says client-side error collection is set up in `src/router.tsx`, but that file has no Sentry code yet, so only the server reports errors.
- **TanStack Intent skills** (from `AGENTS.md`): before a substantial change, run `pnpm dlx @tanstack/intent@latest list`. If a listed skill matches the task, load it with `pnpm dlx @tanstack/intent@latest load <package>#<skill>` and follow its `SKILL.md`.
