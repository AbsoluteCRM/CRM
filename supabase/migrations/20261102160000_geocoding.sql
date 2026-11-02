-- Property geocoding: a shared, service-role-only cache of geocoder results,
-- and the accuracy of each property's stored point. See
-- docs/plans/property-geocoding.md and docs/database/tables/clients.md.

------------------------------------------------------------------------------
-- geocode_cache
------------------------------------------------------------------------------

-- One row per normalized address (SHA-256 of the address fields that move the
-- point). No tenant id and no address text: the same street address geocodes
-- the same way for every org. Only trusted results are cached. Service role
-- only, like optimization_run_payloads; `private` isn't reachable through
-- PostgREST, so it lives in `public` with RLS on and no policies.
create table public.geocode_cache (
  normalized_address_hash text primary key check (normalized_address_hash ~ '^[0-9a-f]{64}$'),
  provider text not null check (provider ~ '^[a-z][a-z0-9_]*$'),
  lon double precision not null check (lon between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  accuracy text not null
    check (accuracy in ('rooftop', 'street', 'postal', 'locality', 'unknown')),
  fetched_at timestamptz not null default now()
);

revoke all on public.geocode_cache from authenticated, anon;

alter table public.geocode_cache enable row level security;
-- geocode_cache: no policies (service role only).

comment on table public.geocode_cache is
  'Geocoder results keyed by a hash of the normalized address. Service role only; no tenant data.';

------------------------------------------------------------------------------
-- properties.geocode_accuracy
------------------------------------------------------------------------------

alter table public.properties
  add column geocode_accuracy text
    check (geocode_accuracy in ('rooftop', 'street', 'postal', 'locality', 'unknown'));

comment on column public.properties.geocode_accuracy is
  'Precision of location: rooftop, street, postal, locality, or unknown. locality and unknown are low confidence. Null when not geocoded or pinned before this column existed.';
comment on column public.properties.geocode_source is
  'Who set location: maptiler, nominatim, or manual (a dropped pin). Older rows may say google or mapbox.';

-- location, geocoded_at, and geocode_source are already writable by office
-- staff (RLS limits writes to owner/admin/dispatcher). The accuracy is
-- written alongside them by the property procedures.
grant insert (geocode_accuracy) on public.properties to authenticated;
grant update (geocode_accuracy) on public.properties to authenticated;
