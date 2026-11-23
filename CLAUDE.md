# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

A multi-tenant CRM for contractor businesses, built on a scaffolded TanStack Start app (created with `create-tsrouter-app`; add-ons listed in `.cta.json`). The database schema is in place (see `docs/database/`). Supabase sign-in and sign-up, invitations, the client request portal, and tRPC routers for clients, crews, services, requests, quotes, teams, and weather exist, with `_authed` pages over them. Some pages still render client-side demo data from a mock store (being moved from `src/components/crm/store.ts` to `src/mocks/`). Never mix demo and live data on one screen without a visible "sample data" label. The scaffold's `todos` tRPC router is not to be built on.

## Feature workflow

Every change follows [docs/process/feature-workflow.md](docs/process/feature-workflow.md). Read it before starting work. In short:

- **Ask before planning.** Work in native plan mode (call `EnterPlanMode` if you aren't in it). Ask the user questions until at least 95% of the plan's material choices rest on their answers or on verified repo facts. List the open questions and assumptions; don't guess.
- **Plan, then try to defeat the plan.** Write the plan from [docs/plans/\_template.md](docs/plans/_template.md). For full-tier work, a fresh `plan-auditor` agent (never a fork) audits it each round until it returns `pass`. A blocking finding must be grounded (location, evidence, the written rule it breaks, the concrete failure). A recurring finding, or one saying the approach is wrong, goes to the user at once; otherwise escalate after 3 rounds. Small single-layer `fix/` or `chore/` work (the light tier) skips only the audit.
- **The user's approval on leaving plan mode is the go.** Only then create the branch (`feat/<slug>`, `fix/`, `db/`, `chore/`) from `origin/main`, commit the plan as `docs/plans/<slug>.md`, and open a draft PR.
- **One PR per feature, end to end.** Migration, `docs/database`, middleware, procedures, routes and UI, stories and tests, and the design record (`docs/<feature>/ui.md` plus screenshots, see [docs/design/](docs/design/README.md)) ship together, across as many commits as needed.
- **Agents** ([.claude/agents/](.claude/agents/)): `plan-auditor` (plans), `implementer` (builds in a worktree and pushes to the PR branch), `reviewer` (every diff before merge), and `security` (a hard gate on the security-gated paths listed in the workflow's Agents section: migrations, auth, organization context, tRPC, Supabase clients, server-only code, routes, env, and `rls.md`). Dispatch them by `subagent_type` without a `model`. Only the main agent writes to the remote database; the read-only agents get Supabase list and inspect tools only.
- **Done** means: tsc, lint and prettier pass; procedure tests (cross-tenant, multi-org, per-role); stories with interaction tests; verified in the running app; reviewer (and security, if gated) passed; docs updated.
- **Merge autonomously only through the gate**: verify passes fresh on the PR head, the reviewer passed, security passed if gated, `main` merged in cleanly, the plan is `implemented`, and the PR is out of draft. Then `gh pr merge --merge`. Otherwise stop and report.
- **Tenancy**: user requests use `ctx.supabase`, the per-request Supabase client, so RLS is the access control (ADR 0009), and also filter by the active org. Never use `publicProcedure` for domain data.
- **No surprises.** If the plan turns out wrong mid-build, stop, update the plan, and re-ask. Never use `--no-verify`.

## Commands

Package manager is **pnpm**. Env vars come from `.env.local` (gitignored). It holds the Supabase keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), and the Sentry `VITE_SENTRY_*` / `SENTRY_AUTH_TOKEN` values. Scripts that need these values wrap themselves in `dotenv -e .env.local`.

The toolchain comes from **devenv** (`devenv.nix`: Node 22, TypeScript, git-lfs, supabase-cli). Enter it with `devenv shell`; the repo has no `.envrc` for direnv. devenv generates the gitignored `.pre-commit-config.yaml`, so change `devenv.nix` rather than that file. `.devcontainer/devcontainer.json` is committed by hand. On commit, the git hooks run prettier (the repo's pinned version) on staged files and nixfmt on `.nix` files. Entering the shell also runs `git lfs install --local`, because screenshots under `docs/` are stored in Git LFS.

```bash
pnpm dev                 # dev server on :3000 (loads Sentry via instrument.server.mjs)
pnpm build               # vite build → .output/ (Nitro); copies instrument.server.mjs in
pnpm start               # run the built server from .output/server
pnpm lint                # eslint
pnpm format              # prettier --write + eslint --fix
pnpm check               # prettier --check
pnpm typecheck           # tsc --noEmit

pnpm db:types            # supabase gen types → src/types/database.ts (inside devenv shell; needs `supabase login` or `SUPABASE_ACCESS_TOKEN`)

pnpm storybook           # Storybook on :6006
pnpm test                # vitest run: all projects
pnpm test:unit           # vitest run --project unit
pnpm exec vitest run src/server/weather.test.ts   # single file
```

Vitest has two projects in `vite.config.ts`:

- `unit`: `src/**/*.test.ts` in Node. `src/test/setup.ts` sets dummy `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` when unset, so tests need no `.env.local`.
- `storybook`: runs stories as tests in headless Chromium through Playwright, so Playwright's Chromium must be installed (`pnpm exec playwright install chromium`).

CI (`.github/workflows/ci.yml`) runs on every pull request and push to `main`: `tsc --noEmit`, lint, `pnpm check`, the unit project, and (in a second job) the storybook project.

## Architecture

- **Framework**: TanStack Start (React 19, SSR) on Vite 8 + Nitro. React Compiler is enabled through the babel plugin in `vite.config.ts`.
- **Routing**: file-based routes in `src/routes/`. `src/routeTree.gen.ts` is generated, so don't edit it by hand (it regenerates on dev, or run `pnpm generate-routes`). `__root.tsx` is the HTML shell and devtools host. It also declares the router context type `{ queryClient, trpc }`.
- **Data flow (tRPC + TanStack Query)**:
  - The root router is `src/integrations/trpc/router.ts`; each domain has its own file beside it (`clients.ts`, `quotes.ts`, ...) with tests in `*.test.ts`. Procedures are built from `init.ts` (superjson transformer, per-request context with `ctx.supabase`). It exports `publicProcedure`, `protectedProcedure` (signed-in user), `organizationProcedure` (takes `organizationId` input and verifies active membership, adding `ctx.organizationId` and `ctx.role`), and `requireOrgPermission(permission)` (checks `can` from `src/integrations/organization/permissions.ts`).
  - They're served by the catch-all API route `src/routes/api.trpc.$.tsx` at `/api/trpc`.
  - `src/integrations/tanstack-query/root-provider.tsx` creates the tRPC client (`httpBatchStreamLink`; absolute `localhost:$PORT` URL during SSR). It also creates a `QueryClient` per request with superjson (de)hydration and a `createTRPCOptionsProxy`.
  - `src/router.tsx` passes these into router context and wires `setupRouterSsrQueryIntegration`. In route loaders, use `context.trpc.x.y.queryOptions()` with `context.queryClient`. In components, use `useTRPC()` from `src/integrations/trpc/react.ts`.
  - The SSR tRPC link sends no cookies yet, so loaders can't prefetch authenticated procedures until that is fixed. See Bootstrapping in the workflow doc.
- **Auth**:
  - Supabase Auth, via `@supabase/ssr` clients in `src/lib/supabase/` (`server.ts` per request, `client.ts` for the browser).
  - `src/integrations/auth/context.tsx` provides `useAuth()`, and `src/integrations/organization/context.tsx` loads the user's memberships and provides the active org (remembered per user in `localStorage`) and its permissions.
  - `src/routes/_authed.tsx` is the layout for signed-in pages. Its guard is client-only.
- **Schema design**: `docs/database/` is the design record. It holds the conventions, ERD, per-table reference, RLS model, and ADRs. Read it before touching the schema, and update it in the same change.
  - The schema's source of truth is hand-written SQL in `supabase/migrations/`. It is applied to the remote Supabase project through the Supabase MCP `apply_migration` tool under the same name, and then the local file is renamed to the version the tool assigned.
  - The remote matches the migrations (rebaselined 2026-10-07, [ADR 0010](docs/database/decisions/0010-pre-launch-rebaseline.md)). Compare `list_migrations` with `supabase/migrations/` before applying anything.
  - Service-role Supabase clients bypass RLS, so they are for trusted code only (`src/server/trusted/`). See ADR 0009.
- **Database access**: supabase-js with the user's session, so RLS applies ([ADR 0009](docs/database/decisions/0009-supabase-js-data-access.md)). Use the per-request `createSupabaseServerClient()` in `src/lib/supabase/server.ts`. Multi-step or transactional writes are SQL functions called with `.rpc()`. There is no ORM and no direct Postgres connection. Generated types are in `src/types/database.ts` (from `pnpm db:types`); regenerate them after every schema change.
- **Env**: `src/env.ts` uses t3 `createEnv`. Client vars must be prefixed `VITE_`. Server vars: `SERVER_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEATHER_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `PORTAL_IP_HMAC_KEY`. Client vars: `VITE_APP_TITLE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`. Only the two `VITE_SUPABASE_*` vars are required.
- **UI**: shadcn/ui (new-york, zinc, lucide) in `src/components/ui`, Tailwind v4 through `src/styles.css`, and `cn()` in `src/lib/utils.ts`. Add components with `pnpm dlx shadcn@latest add <name>`.
- **Imports**: use the `#/*` alias for `src/*`. It's defined in both `package.json` `imports` and `tsconfig` paths, and it's what shadcn uses. `@/*` also resolves but is not the convention.

## Conventions

- Prettier: no semicolons, single quotes, trailing commas. ESLint uses `@tanstack/eslint-config` with import-order rules turned off, plus the storybook and unicorn (for `.js` files) configs.
- **Sentry** (from `.cursorrules`): error collection is automatic. tRPC procedures are traced by `Sentry.trpcMiddleware` in `init.ts`, so don't wrap them in spans by hand. Wrap `createServerFn` handlers in a Sentry span:
  ```ts
  import * as Sentry from '@sentry/tanstackstart-react'
  Sentry.startSpan({ name: 'Describe the operation' }, async () => {
    /* ... */
  })
  ```
  Sentry is initialized server-side in `instrument.server.mjs`, which is loaded with `node --import`. It is a no-op when `VITE_SENTRY_DSN` is unset. `.cursorrules` says client-side error collection is set up in `src/router.tsx`, but that file has no Sentry code yet, so only the server reports errors.
- **TanStack Intent skills** (from `AGENTS.md`): before a substantial change, run `pnpm dlx @tanstack/intent@latest list`. If a listed skill matches the task, load it with `pnpm dlx @tanstack/intent@latest load <package>#<skill>` and follow its `SKILL.md`.
