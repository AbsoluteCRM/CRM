-- Geocoding: the cache is service-role only, and geocode_accuracy is checked
-- and writable by office staff only. All fixtures roll back.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;
select no_plan();

insert into auth.users (id, email, aud, role)
select ('00000000-0000-0000-0000-00000000ac0' || n)::uuid,
       'geocode-' || n || '@test.local', 'authenticated', 'authenticated'
from generate_series(1, 4) n;
insert into public.organizations (name, slug) values ('Geocoding A', 'pgtap-geocode-a');
insert into _ids select 'a', id from public.organizations where slug = 'pgtap-geocode-a';
insert into public.organization_members (organization_id, user_id, role, display_name)
select (select id from _ids where key = 'a'),
       ('00000000-0000-0000-0000-00000000ac0' || n)::uuid,
       role::public.org_role, role
from (values (1, 'owner'), (2, 'dispatcher'), (3, 'worker')) r(n, role);
insert into public.clients (organization_id, display_name)
values ((select id from _ids where key = 'a'), 'Geo client');
insert into public.properties (organization_id, client_id, address_line1, city)
select organization_id, id, '1 Test St', 'Calgary'
from public.clients where organization_id = (select id from _ids where key = 'a');
insert into _ids select 'property', id from public.properties
where organization_id = (select id from _ids where key = 'a');

insert into public.geocode_cache (normalized_address_hash, provider, lon, lat, accuracy)
values (repeat('a', 64), 'maptiler', -114.07, 51.04, 'rooftop');

insert into _tap (line) select throws_ok(
  $$insert into public.geocode_cache (normalized_address_hash, provider, lon, lat, accuracy)
    values (repeat('b', 64), 'maptiler', -114.07, 51.04, 'exact')$$,
  '23514', null, 'unknown cache accuracy rejected');
insert into _tap (line) select throws_ok(
  $$insert into public.geocode_cache (normalized_address_hash, provider, lon, lat, accuracy)
    values ('not-a-hash', 'maptiler', -114.07, 51.04, 'rooftop')$$,
  '23514', null, 'malformed hash rejected');
insert into _tap (line) select throws_ok(
  $$update public.properties set geocode_accuracy = 'exact' where id = (select id from _ids where key = 'property')$$,
  '23514', null, 'unknown property accuracy rejected');

-- Office staff: no access to the cache, but can write the location columns.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac01","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select count(*) from public.geocode_cache$$, '42501', null, 'owner cannot read the cache');
insert into _tap (line) select throws_ok(
  $$insert into public.geocode_cache (normalized_address_hash, provider, lon, lat, accuracy)
    values (repeat('c', 64), 'maptiler', 0, 0, 'rooftop')$$,
  '42501', null, 'owner cannot write the cache');
insert into _tap (line) select lives_ok(
  $$update public.properties
    set location = 'SRID=4326;POINT(-114.07 51.04)', geocoded_at = now(),
        geocode_source = 'maptiler', geocode_accuracy = 'street'
    where id = (select id from _ids where key = 'property')$$,
  'owner can write the location columns');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac02","role":"authenticated"}', true);
insert into _tap (line) select lives_ok(
  $$update public.properties set geocode_source = 'manual', geocode_accuracy = 'rooftop'
    where id = (select id from _ids where key = 'property')$$,
  'dispatcher can pin a property');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ac03","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select count(*) from public.geocode_cache$$, '42501', null, 'worker cannot read the cache');
insert into _tap (line) select results_eq(
  $$update public.properties set geocode_accuracy = 'unknown'
    where id = (select id from _ids where key = 'property') returning id$$,
  $$select id from _ids where false$$, 'worker cannot update a property');

select set_config('role', 'anon', true);
insert into _tap (line) select throws_ok(
  $$select count(*) from public.geocode_cache$$, '42501', null, 'anon cannot read the cache');

select set_config('role', 'service_role', true);
insert into _tap (line) select is(
  (select accuracy from public.geocode_cache where normalized_address_hash = repeat('a', 64)),
  'rooftop', 'service role reads the cache');

select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select geocode_source || '/' || geocode_accuracy || '/' || round(latitude::numeric, 2)
   from public.properties where id = (select id from _ids where key = 'property')),
  'manual/rooftop/51.04', 'office writes landed; worker write did not');
insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;
rollback;
