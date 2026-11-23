# 0013. Geocoding: a provider chain, stored results, a shared cache

- **Status**: Accepted (2026-11-02)
- **Date**: 2026-11-02
- **Context doc**: [maps-service-areas roadmap](https://github.com/AbsoluteCRM/CRM/pull/89),
  [property-geocoding plan](../../plans/property-geocoding.md)

## Context

Service areas (roadmap phase 3) decide which crew owns an address with
`ST_Covers` in Postgres, so every property needs a stored point. Turning an
address into a point is the one step that needs an outside provider. The
choice is constrained by licensing: we must be allowed to **store** results
permanently, and by quality, because a wrong point sends the wrong crew.

- Google's and Mapbox's standard geocoding terms restrict storing results
  (Mapbox sells "permanent" geocoding separately). They are not used.
- MapTiler says results of its Geocoding API may be stored permanently "for
  most use cases" (maptiler.com/search), on its free and paid Cloud plans,
  subject to its terms. It also hosts the map tiles from phase 1, so one
  account covers both. Its feature ids aren't stable across re-indexes.
- Public OSM Nominatim is free, and its data is ODbL (attribution; stored
  results are fine), but its usage policy allows at most 1 request/second,
  requires an identifying User-Agent, forbids autocomplete, and discourages
  production use by apps.

## Decision

- **Server-side only.** `src/server/geo/` defines a `Geocoder` interface
  (`geocode(address)` → `{ lon, lat, accuracy, normalizedAddress, source }`
  or null, optional `suggest`). Keys never reach the browser.
- **A chain**, set by `GEOCODER_CHAIN` (default `maptiler`). It returns the
  first trusted result, falls back on errors, timeouts, empty or
  low-confidence answers, and never throws. Each provider call has a short
  timeout and a Sentry span. Nominatim is dropped from the app's chain in
  production and is used for dev and the backfill script, throttled to
  1 request/second.
- **Accuracy is recorded** in `properties.geocode_accuracy` (`rooftop`,
  `street`, `postal`, `locality`, `unknown`). `locality` and `unknown` are
  stored but flagged as low confidence.
- **Results are stored** on the property (`location`, `geocoded_at`,
  `geocode_source`), and trusted results also go into `geocode_cache`, keyed
  by a SHA-256 of the normalized address with no tenant id. The cache is a
  `public` table with RLS on and no policies (service role only, like
  `optimization_run_payloads`), read and written only from
  `src/server/trusted/geocode-cache.ts`. The property write stays on the
  user's `ctx.supabase` ([ADR 0009](0009-supabase-js-data-access.md)).
- **Manual pins win** until the address changes.

## Consequences

- Saving a property costs at most one provider round trip (cache misses only)
  and never fails because of geocoding.
- One `MAPTILER_API_KEY` (server-only, separate from the public tile key) is
  needed in production. Without it the app saves properties with no point.
- MapTiler's storage terms must be re-checked against the plan actually
  purchased; if they change, the chain lets us swap providers (Stadia,
  self-hosted Pelias/Nominatim, or Calgary/Edmonton open-data address points)
  without touching callers.
- Cached results are shared across tenants. That's safe because the cache
  holds only a hash and a point, but it means one tenant's lookup speeds up
  another's.
- Low-confidence points need a human to drop a pin; the map UI that does
  this comes in a later phase.
