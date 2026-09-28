# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

A CRM built on a freshly scaffolded TanStack Start app (created with `create-tsrouter-app`; add-ons listed in `.cta.json`). Most domain code has not been written yet. The `todos` tRPC router, the Prisma `Todo` model, the `messagesCollection`, and `src/stories/*` are scaffold examples. Replace them rather than building on them.

## Commands

Package manager is **pnpm**. Env vars come from `.env.local` (gitignored). It holds `DATABASE_URL` and the Sentry `VITE_SENTRY_*` / `SENTRY_AUTH_TOKEN` values. Scripts that need these values wrap themselves in `dotenv -e .env.local`.

The toolchain comes from **devenv** (`devenv.nix`: Node 22 plus TypeScript). Enter it with `devenv shell`, or let direnv load it. devenv also generates `.devcontainer/` and the gitignored `.pre-commit-config.yaml`, so change `devenv.nix` rather than those files. Its git hooks run prettier on staged files at commit time; the rustfmt, nixfmt, and black hooks only fire on `.rs`, `.nix`, and `.py` files.

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
  - Procedures live in `src/integrations/trpc/router.ts` and are built from `init.ts` (superjson transformer, `publicProcedure` only, with no context/auth yet).
  - They're served by the catch-all API route `src/routes/api.trpc.$.tsx` at `/api/trpc`.
  - `src/integrations/tanstack-query/root-provider.tsx` creates the tRPC client (`httpBatchStreamLink`; absolute `localhost:$PORT` URL during SSR). It also creates a `QueryClient` per request with superjson (de)hydration and a `createTRPCOptionsProxy`.
  - `src/router.tsx` passes these into router context and wires `setupRouterSsrQueryIntegration`. In route loaders, use `context.trpc.x.y.queryOptions()` with `context.queryClient`. In components, use `useTRPC()` from `src/integrations/trpc/react.ts`.
- **Database**: Prisma 7 with PostgreSQL through the `@prisma/adapter-pg` driver adapter. The client is generated into `src/generated/prisma` (import from `./generated/prisma/client.js`, not `@prisma/client`). `src/db.ts` exports a singleton `prisma` that is cached on `globalThis` in dev. Prisma CLI config (datasource URL, seed command `tsx prisma/seed.ts`) is in `prisma.config.ts`.
- **Client-side collections**: `@tanstack/react-db` collections go in `src/db-collections/`. Only a local-only example exists so far; `@tanstack/query-db-collection` is installed for query-backed collections.
- **Env**: `src/env.ts` uses t3 `createEnv`. Client vars must be prefixed `VITE_`. The file currently validates only `SERVER_URL` and `VITE_APP_TITLE`. `DATABASE_URL` is read directly from `process.env` in `src/database-url.ts`.
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
