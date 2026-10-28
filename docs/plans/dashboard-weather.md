# Plan: Live dashboard weather

- **Slug / branch**: `dashboard-weather` / existing `feature/weather-data-api` (user-created; retain it).
- **Tier**: full; server API and dashboard UI.
- **Status**: approved
- **Confidence**: 95%; scope and display choices confirmed, integration patterns verified in repo.
- **Plan-mode file**: this file (native plan mode unavailable).

## Original request

> I would like to integrate a weather api into this platform. I've created the branch and add the key from weatherapi.com.
>
> For now let's just integrate it into dashboard.tsx where the weather card is displayed using real data. We can use the calgary lng and lat for the data hardcoded for now until we connect our geocoding service.

## Goal

Replace simulated dashboard weather with WeatherAPI current conditions and available forecast days for Calgary, using the existing card layout in manager and worker views and the header badge.

## Decisions

| Question | Answer |
| --- | --- |
| Forecast length | User: use available forecast days. |
| Displays and units | User: update both card and header, retain layout, show Calgary, °C and km/h. |
| Location | User: hardcoded Calgary until geocoding is connected. |
| Branch | User already created branch; retain it. |

Agent defaults: coordinates 51.0447,-114.0719; request five days and render only returned days; ten-minute freshness; no new dependency. No new mock needed for preserving this layout.

## Open questions

None material. User approval of this audited plan is required before implementation.

## Assumptions

| Assumption | User-confirmed? |
| --- | --- |
| Existing key is intended for WeatherAPI server calls | yes, user supplied key for this integration |
| Specific coordinates and ten-minute refresh are acceptable implementation defaults | no; minor defaults, user may veto |

## Design refs

- Built without a mock; preserve existing dashboard layout.
- Add `docs/dashboard/ui.md`, desktop and phone screenshots under `docs/dashboard/shots/`, and record confirmed display decisions in `docs/design/decisions.md`.

## Layers touched

- tRPC procedure, server fetch helper, env validation, dashboard UI, stories/tests, design record.
- No schema, RLS, migrations, generated database types, or new auth middleware.
- Security gates: `src/server/**`, `src/integrations/trpc/**`, `src/env.ts`, `src/routes/**`; `.env.example` only if needed, preserving the user's existing edit.

## Changes

### Server and procedure

- Add optional server-only `WEATHER_API_KEY` in `src/env.ts`; existing `.env.example` already contains its name. Never print the key or commit `.env.local`.
- Add `src/server/weather.ts`: HTTPS fetch of `https://api.weatherapi.com/v1/forecast.json` with fixed coordinates, days=5, aqi=no, alerts=no and an eight-second abort timeout. Validate upstream fields with Zod; normalize current temperature/condition/wind, update epoch, location timezone and forecast dates, highs/lows, rain/snow probability and conditions. Request no browser-supplied URL or coordinates.
- Use WeatherAPI condition codes for icon categories with safe cloudy fallback; retain provider condition text. Mixed snow/rain and thunder must not be mistaken for clear weather. Precipitation probability is max(rain chance, snow chance).
- Process-local successful-result cache for ten minutes and deduplicated in-flight fetches, with cleanup on failure; cache only public Calgary weather, never membership/job data. Auth/membership checks execute before accessing cache. Expired cache is not served silently.
- Errors (missing key, timeout, quota/auth upstream failures, malformed/empty forecast) return generic weather-unavailable errors without upstream URL/body/cause containing secrets. No raw fetch exceptions reach logging/Sentry; existing tRPC Sentry middleware supplies observability.
- Add `weather.forecast` in `src/integrations/trpc/weather.ts`, register in `router.ts`. Input `{ organizationId: UUID }`, using existing `organizationProcedure`; owner/admin/dispatcher/worker allowed, portal users/non-members rejected. No tenant records returned; membership is the only database read.

### Routes and UI

- In `src/routes/_authed/dashboard.tsx`, use one shared tRPC React Query request per active organization; query enabled only with active organization, ten-minute stale time and background refresh interval, no protected loader prefetch. Pass the shared result to both worker/manager cards and header, or use a hook sharing the exact query key.
- Replace dashboard `forecastFor` usage only; other screens retain their current behavior. Display current temperature and wind, today's low, provider condition text; forecast uses daily highs and returned dates.
- Label Calgary explicitly even if organization city differs. Forecast job counts remain computed locally from active tenant jobs by returned date. Keep existing calendar link and rain/snow work prompts.
- Render a flexible forecast grid for up to four future days, hide forecast/work-ahead rows when none exist. Never invent missing days. Use provider Calgary dates, not browser-local dates, for forecast matching; avoid date-only UTC weekday shifts.
- Initial loading placeholders, weather-unavailable error with retry, and explicit stale/update warning when a background refresh fails with retained data. Header mirrors shared loading/error/current state; no simulated fallback.
- Add subtle WeatherAPI attribution link. Isolate presentational weather UI under `src/components/crm/` if needed for stories; keep transport/auth in dashboard.

### Acceptance criteria

1. Header and manager/worker weather cards show the same real Calgary current conditions in metric units.
2. Only returned forecast days appear; daily temperatures, precipitation and dates come from provider data.
3. Initial or refresh failures never display fabricated or silently stale weather; retry works.
4. Key stays server-side and absent from client bundles, API responses, logs, screenshots, and committed files.
5. Membership guard runs even on cache hits; changing active organization changes query scope.

## Commits

1. Main agent: commit approved plan and open draft PR on existing branch.
2. Implementer: server helper/env/router plus meaningful helper and procedure tests.
3. Implementer: dashboard connection, presentational stories/interactions, design record.
4. Main agent: app verification screenshots, audit/review records and final plan status.

One writer at a time; implementer uses isolated worktree with no `.env.local`; main checkout runs credentialed checks. Follow repository reviewer/security/merge gates for the single PR.

## Unhappy paths

- Missing/invalid key, exceeded quota, timeout/network failure and malformed response: sanitized unavailable error, retry UI, failed calls never cached.
- Fewer returned days: render available days; no future days hides forecast sections.
- Concurrent users: deduplicate Calgary requests; membership verified independently per call.
- Cached data with failed client refresh: show explicit update failure and retry; never relabel stale data as current.
- Anonymous, portal and foreign-org callers: reject before upstream fetch/cache read.

## Out of scope

Geocoding, configurable locations, other pages' mock weather, schema changes, weather alerts, distributed caching, redesign.

## Dependencies not to add

No weather SDK, state library, HTTP client or database dependency.

## Verify command

```sh
pnpm lint && pnpm check && pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm build
```

## Verification

- Unit tests with mocked fetch: metric normalization/condition categories, provider dates, short forecast, timeout, bad key/missing key, malformed/empty payload, sanitized errors, successful cache/deduplication and recovery after failure.
- Procedure tests matching existing mock patterns: anonymous/non-member/portal rejection, all four org roles allowed, cross-org access denied and multi-org membership scoping before cache access; no writes or real tenant fixtures.
- Story interactions: loading, populated, short forecast, error/retry and stale-refresh failure; include rain/snow job prompts.
- Run exact verify command, signed-in seeded test account via Playwright, inspect real weather request, card/header agreement, mobile/desktop shots, retry behavior, and search built client assets for actual key without printing it.
- Reviewer then security audit; fix and repeat gates as required. No schema steps apply.

## Audit log

- User approved the audited plan on 2026-10-28: "Approved".

### Round 1 — plan-auditor

- **Verdict**: pass, high confidence; no blocking findings or unresolved questions.
- **Checked clean**: request/decisions, workflow/template completeness, dashboard call sites, membership and roles, server env handling, router/test patterns, WeatherAPI contract, failures/cache/query scope.
- **Non-blocking adopted**: verification of key secrecy includes outgoing HTTP spans and breadcrumbs in Sentry, since upstream authentication uses a URL query parameter. Ensure telemetry redacts that parameter if instrumentation records it.
- **Pre-existing**: CLAUDE.md describes Vitest as Storybook-only, while current vite.config.ts also has a unit project; plan uses current configuration.

## Scope-change log

None.
