# Plan: Property geocoding

- **Slug / branch**: `property-geocoding` / `feat/property-geocoding`
- **Tier**: full (schema, tRPC procedures, trusted server code)
- **Status**: implemented (phase 2 of the approved
  [maps-service-areas roadmap](https://github.com/AbsoluteCRM/CRM/pull/89))
- **Confidence**: 95%. The behaviour (chain, cache, manual-pin rule, no
  blocking on failure) comes from Eric's approved roadmap and the phase brief.
  The provider details and the column/grant design are verified against the
  repo and the provider docs. The remaining agent defaults are listed under
  Decisions, and Eric may veto them.
- **Plan-mode file**: none. Approval was given on the roadmap (Eric,
  2026-11-02), which covers this phase. This file is the phase plan.

## Original request

> Instead of Google maps, let's look at openlayers. We also want to be able to
> take a city and draw polygons for our various teams "service area" a team
> will automatically get routes within this polygon. Let's look at postgis so
> we don't have to call out to Google or openstreetmaps or whoever we make our
> mapping provider. Plan this out thoroughly before implementing.

The roadmap's phase 2 row: "`feat/property-geocoding`: `Geocoder` chain,
`geocode_cache`, geocoding on property save, backfill script, 'needs
location' state."

## Goal

Every property gets a stored point, geocoded once on the server when its
address is saved, so later phases (service areas, auto-assignment) can match
addresses in Postgres without calling a provider. Geocoding never blocks a
save. A manual pin wins until the address changes. Low-confidence results are
stored but flagged. This phase is server-side only: no map UI.

## Decisions

| #   | Question                 | Answer (Eric, roadmap 2026-11-02, or the phase brief)                                                                                              |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Which geocoder           | A chain set by `GEOCODER_CHAIN`. MapTiler first (its terms allow storing results). Public Nominatim for dev and backfill only. No Google or Mapbox |
| Q2  | When to geocode          | On property create/update when the address changed, on the server                                                                                  |
| Q3  | Failure                  | Never block the save. Save with `location = null`                                                                                                  |
| Q4  | Manual pin               | `geocode_source = 'manual'` is not overwritten unless the address text changes                                                                     |
| Q5  | Where results are stored | A service-role-only `geocode_cache` keyed by a hash of the normalized address, with no tenant ids                                                  |
| Q6  | Low-confidence results   | Stored with the accuracy recorded, and flagged                                                                                                     |
| Q7  | Backfill                 | A script using the service role, rate-limited, dry-run by default, with an `--org` filter                                                          |

Agent defaults (minor; Eric may veto them):

- **D1 Property procedures are new.** `main` has no property create/update
  procedures yet (properties are only seeded or read from the mock store).
  This phase adds `clients.properties.{list,create,update,setLocation}`
  (office roles via `manageClients`), which the brief assumed existed. No UI
  calls them yet.
- **D2 What counts as low confidence.** `locality` and `unknown` are flagged
  (a city centroid is useless for routing and service areas). `rooftop`,
  `street`, and `postal` are trusted (a Canadian full postal code is
  block-level). The procedures return `location_status`:
  `ok | low_confidence | missing`. A manual pin is always `ok`.
- **D3 The chain keeps looking after a low-confidence hit.** It returns the
  first trusted result. If every provider is low confidence, it returns the
  most precise one.
- **D4 Only trusted results are cached.** Low-confidence and empty results are
  not, so a later attempt (or a better provider) can improve them. No TTL in
  v1; MapTiler feature ids aren't stored, because they aren't stable.
- **D5 Address identity.** The hash and the "address changed" test use
  `address_line1`, `city`, `region`, `postal_code`, `country`: lowercased,
  punctuation and repeated whitespace collapsed, postal code without spaces.
  `address_line2` (unit, suite) is excluded: it doesn't move the point and
  usually confuses geocoders.
- **D6 Retry on update.** An update also geocodes when the property has no
  location yet and isn't a manual pin, so a past failure heals on the next
  save.
- **D7 Manual pin accuracy** is stored as `rooftop`. Rows pinned before this
  change keep `geocode_accuracy = null`; that's allowed.
- **D8 Nominatim is dropped from the app's chain in production**
  (`NODE_ENV=production`), per its usage policy. The backfill script may use
  it, throttled to 1 request/second with an identifying `User-Agent`
  (`NOMINATIM_USER_AGENT`, defaulting to the repo URL). Nominatim has no
  `suggest`, because its policy forbids autocomplete.
- **D9 No `geocode_source` check constraint.** Existing rows may hold
  `google`/`mapbox`/`manual` (documented values). New values are `maptiler`,
  `nominatim`, `manual`.
- **D10 Scripts run under Node's type stripping** with a small resolve hook
  (`scripts/register-ts.mjs`) so they can import `#/…` modules, including the
  existing trusted admin client. No new dependency (no `tsx`).
- **D11 Dashboard weather stays on Calgary** (brief item 8 skipped): the
  forecast cache is process-wide and Calgary-only, and making it per-location
  would grow this PR.

## Open questions

- None that change the outcome. MapTiler's exact storage terms per plan are
  noted below and should be confirmed by Eric when choosing a plan.

## Assumptions

| Assumption                                                                                                                    | User-confirmed?           |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| MapTiler allows permanent storage of geocoding results ("for most use cases", per maptiler.com/search) on the plan Eric picks | no; Eric to confirm       |
| A separate server-side MapTiler key is used for geocoding (not the public tile key from phase 1)                              | no; recommended           |
| The migration is applied by the main agent after review, then `pnpm db:types` is regenerated                                  | yes (workflow, the brief) |

## Design refs

- Mock: none. No UI in this phase.
- Screens: none. `docs/<feature>/ui.md` is N/A.

## Layers touched

- [x] Migration (`supabase/migrations/20261102193330_geocoding.sql`)
- [x] RLS / grants / pgTAP test (`supabase/tests/geocoding_test.sql`)
- [x] `docs/database` (clients.md, README, ADR)
- [x] Types (hand-edited in the generated style until `pnpm db:types` runs)
- [ ] Middleware (unchanged)
- [x] tRPC procedures
- [ ] Routes / loaders (none)
- [ ] UI components (none)
- [ ] Stories (no UI)
- [x] Tests (Vitest unit)
- [x] Sentry (spans per provider call and per procedure)
- [ ] Design record (no UI)

Security-gated paths touched: `supabase/migrations/**`,
`src/integrations/trpc/**`, `src/server/**` (including
`src/server/trusted/`), `src/env.ts`, `.env.example`. The `security` agent
gates the merge.

## Changes

### Schema

Migration `geocoding`:

- `public.geocode_cache` (service role only, following
  `optimization_run_payloads`; a `private` table can't be reached through
  PostgREST):
  - `normalized_address_hash text primary key` (check: 64 lowercase hex chars,
    a SHA-256)
  - `provider text not null` (check: `^[a-z][a-z0-9_]*$`)
  - `lon double precision not null` (check −180..180), `lat double precision
not null` (check −90..90)
  - `accuracy text not null` (check in the five values)
  - `fetched_at timestamptz not null default now()`
  - No tenant id and no address text. `revoke all … from authenticated, anon`;
    RLS enabled with no policies.
- `properties.geocode_accuracy text` (null allowed), check in `rooftop`,
  `street`, `postal`, `locality`, `unknown`.
- Grants: add `geocode_accuracy` to the existing `insert` and `update` column
  grants for `authenticated`. `location`, `geocoded_at`, and `geocode_source`
  are already granted, and RLS still limits writes to office staff
  (owner/admin/dispatcher), so no other grant changes.

### Server (`src/server/geo/`, server-only)

- `types.ts`: `GeocodeAccuracy`, `AddressInput`, `GeocodeResult
{ lon, lat, accuracy, normalizedAddress, source }`, `Geocoder
{ name, geocode(address, { signal? }), suggest?(q, near?) }`.
- `address.ts`: `normalizeAddress`, `addressHash` (SHA-256 hex),
  `formatAddressQuery`, `geocodeKeyChanged`, `isLowConfidence`,
  `locationStatus`, `toEwkt`.
- `maptiler.ts`: `GET https://api.maptiler.com/geocoding/{q}.json?key=…&limit=1&country=…&autocomplete=false`,
  Zod-validated; `place_type` → accuracy (`address`/`poi` → rooftop, `road` →
  street, `postal_code` → postal, municipality/locality/neighbourhood/place →
  locality, else unknown). `suggest` uses `autocomplete=true&limit=5` with
  optional `proximity`. 3 s timeout.
- `nominatim.ts`: `GET /search?format=jsonv2&limit=1&countrycodes=…&q=…`,
  identifying `User-Agent`, per-instance 1 req/s throttle; `place_rank`/
  `addresstype` → accuracy. 5 s timeout.
- `fake.ts`: deterministic table-driven provider with a call counter, for
  tests.
- `chain.ts`: `createGeocoderChain(providers)`, each call in a
  `Sentry.startSpan({ op: 'geocode', name: 'geocode.<provider>' })`, all
  errors caught (sanitized, never the URL, which holds the key), coordinates
  range-checked; `parseChain`/`createGeocoderFromConfig`.
- `index.ts`: `getGeocoder()` memoized from `env` (`GEOCODER_CHAIN`, default
  `maptiler`; providers missing their key are skipped; Nominatim dropped in
  production).
- `src/server/trusted/geocode-cache.ts`: `geocodeAddressCached(address,
{ geocoder?, client? })` reads `geocode_cache` by hash with the
  service-role client, calls the geocoder on a miss, writes trusted results
  back (upsert), and never throws (a missing service-role key or a cache error
  falls through to the provider; a provider failure returns `null`).

### Env

- `src/env.ts` (server, optional): `MAPTILER_API_KEY`, `GEOCODER_CHAIN`,
  `NOMINATIM_USER_AGENT`. Added to `.env.example`.

### Procedures

| Procedure                        | Input                                                                                                                                              | Output                          | Roles allowed            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------ |
| `clients.properties.list`        | `organizationId, clientId`                                                                                                                         | property rows + location_status | owner, admin, dispatcher |
| `clients.properties.create`      | `organizationId, clientId, address_line1, city, country (default CA), name?, address_line2?, region?, postal_code?, access_notes?, lot_size_sqft?` | row + location_status           | owner, admin, dispatcher |
| `clients.properties.update`      | `organizationId, propertyId`, any of the create fields (at least one)                                                                              | row + location_status           | owner, admin, dispatcher |
| `clients.properties.setLocation` | `organizationId, propertyId, lon, lat`                                                                                                             | row + location_status           | owner, admin, dispatcher |

All use `ctx.supabase` (RLS) plus `.eq('organization_id', ctx.organizationId)`;
only the cache uses the service role. The returned columns never include the
raw `location` (generated `latitude`/`longitude` are returned instead).

Update logic: read the row (org-scoped) → `NOT_FOUND` if missing → if the
geocode key changed, or the row has no location and isn't manual → geocode
(cache first) and write the four location fields (or clear them to null on
failure when the address changed) → otherwise leave the location columns out
of the update. A manual pin with an unchanged address is never touched.

### Backfill

`scripts/geocode-backfill.ts`, run with `pnpm geocode:backfill [--apply]
[--org <uuid>] [--limit N] [--chain maptiler,nominatim] [--interval-ms 1100]
[--include-low-confidence]`:

- service-role client from `src/server/trusted/supabase-admin.ts`;
- selects non-archived properties with `location is null` (optionally also
  low-confidence non-manual ones), oldest first, filtered by org;
- dry run (default) prints the candidates and makes no provider calls or
  writes;
- `--apply` geocodes through the cache, waits `--interval-ms` between provider
  calls, and updates each row guarded by `geocode_source is distinct from
'manual'` (and `location is null` unless re-geocoding low confidence), so a
  pin dropped meanwhile isn't overwritten.

### Acceptance criteria

1. The chain falls back to the next provider when one fails, returns nothing,
   or returns low confidence; it returns `null` when all fail and never
   throws.
2. A property saves with `location = null` when geocoding fails.
3. A manual pin survives an update that doesn't change the address, and is
   replaced when the address changes.
4. A cache hit makes no provider call; a trusted miss is written to the cache;
   a low-confidence miss is not.
5. MapTiler and Nominatim parse the fixture responses, with `fetch` stubbed
   (no live network).
6. Workers, non-members, and unauthenticated callers can't call the property
   procedures; office roles can; every write is scoped to the active org.
7. `geocode_cache` is unreachable for `authenticated` and `anon`.

## Commits

1. `Add property geocoding plan` (main agent)
2. `Add geocoding migration and types`
3. `Add geocoder chain, providers and trusted cache`
4. `Geocode properties on save and add manual pin procedure`
5. `Add geocode backfill script`
6. `Document geocoding in docs/database and ADR`

## Unhappy paths

- Provider down, slow, over quota, or 4xx: span marked, caught, next provider;
  all fail → `null` → save with no location.
- Malformed provider payload: Zod rejects → treated as a failure.
- No `MAPTILER_API_KEY`: MapTiler is skipped; with no providers the chain
  always returns `null`.
- No `SUPABASE_SERVICE_ROLE_KEY` or cache error: geocode without the cache.
- Property not in the active org or not visible under RLS: `NOT_FOUND`.
- Concurrent update and pin: last write wins; the backfill guards on
  `geocode_source` so it never overwrites a manual pin.
- Out-of-range coordinates from a provider or for a manual pin: rejected.

## Out of scope

- Map UI, pin dragging UI, address autocomplete UI (phase 3b / later).
- Service areas and `properties.service_area_id` (phase 3a).
- Dashboard weather location (D11).
- Calgary/Edmonton open-data address providers.

## Dependencies not to add

- `tsx`, `node-geocoder`, any Google or Mapbox SDK.

## Verify command

```
pnpm install && pnpm lint && pnpm check && pnpm exec tsc --noEmit && pnpm exec vitest run
```

## Verification

- The Definition of done, except: no UI (stories, running-app shots N/A);
  the migration, advisors, pgTAP and `pnpm db:types` are run by the main agent
  after it applies the migration (no database access in the implementing
  session).

## Audit log

### Round 1 (`plan-auditor`): not run (the approved roadmap covered this phase)

The brief came with the approved roadmap and asked for direct implementation;
the implementing session has no sub-agents. The reviewer and security agents
run on the PR before merge.

### Review (`reviewer`, and `security`): pass

| Agent      | Verdict | Blocking findings |
| ---------- | ------- | ----------------- |
| `reviewer` | pass    | none              |
| `security` | pass    | none              |

Follow-up from review: a retry geocode (address unchanged, row had no point)
now writes the point in a separate update guarded by `location is null`, so a
manual pin set meanwhile can't be overwritten.

## Scope-change log

- 2026-11-02: the brief said property create/update existed in `clients.ts`;
  they don't on `main`. Added them (D1) as the smallest way to geocode on save.
