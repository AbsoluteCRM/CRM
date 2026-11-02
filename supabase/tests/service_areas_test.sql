-- Service areas, regions, rotations, and the derived properties.service_area_id.
-- Hermetic: all fixtures roll back.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;
select no_plan();

-- GeoJSON Polygon for a lon/lat box.
create function pg_temp.sq(w float8, s float8, e float8, n float8)
returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'Polygon', 'coordinates',
    jsonb_build_array(jsonb_build_array(
      jsonb_build_array(w, s), jsonb_build_array(e, s), jsonb_build_array(e, n),
      jsonb_build_array(w, n), jsonb_build_array(w, s))))
$$;
-- The _ids key of a property's current service area ('none' when null). Reads
-- as the test owner, so it works whichever role is active.
create function pg_temp.area_of(p_key text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select a.key from pg_temp._ids a where a.id = p.service_area_id), 'none')
  from public.properties p where p.id = (select id from pg_temp._ids where key = p_key)
$$;
create function pg_temp.id(p_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from pg_temp._ids where key = p_key
$$;
grant execute on function pg_temp.sq(float8, float8, float8, float8), pg_temp.area_of(text), pg_temp.id(text)
  to authenticated, anon;

------------------------------------------------------------------------------
-- Fixtures: org A (owner 1, admin 2, dispatcher 3, worker 4), nonmember 5,
-- org B (owner 6). Users 1..6: ...0000c0N.
------------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
select ('00000000-0000-0000-0000-00000000c00' || n)::uuid,
       'areas-' || n || '@test.local', 'authenticated', 'authenticated'
from generate_series(1, 6) n;
insert into public.organizations (name, slug) values
  ('Areas A', 'pgtap-areas-a'), ('Areas B', 'pgtap-areas-b');
insert into _ids select 'org-a', id from public.organizations where slug = 'pgtap-areas-a';
insert into _ids select 'org-b', id from public.organizations where slug = 'pgtap-areas-b';
insert into public.organization_members (organization_id, user_id, role, display_name)
select pg_temp.id(org), ('00000000-0000-0000-0000-00000000c00' || n)::uuid, role::public.org_role, role
from (values (1, 'owner', 'org-a'), (2, 'admin', 'org-a'), (3, 'dispatcher', 'org-a'),
             (4, 'worker', 'org-a'), (6, 'owner', 'org-b')) r(n, role, org);

insert into public.crews (organization_id, name) values (pg_temp.id('org-a'), 'Crew A1'), (pg_temp.id('org-b'), 'Crew B1');
insert into _ids select 'crew-a', id from public.crews where organization_id = pg_temp.id('org-a');
insert into _ids select 'crew-b', id from public.crews where organization_id = pg_temp.id('org-b');
insert into public.clients (organization_id, display_name) values (pg_temp.id('org-a'), 'Client A'), (pg_temp.id('org-b'), 'Client B');
insert into _ids select 'client-a', id from public.clients where organization_id = pg_temp.id('org-a');
insert into _ids select 'client-b', id from public.clients where organization_id = pg_temp.id('org-b');

-- Area A will be the box (-114.10, 51.00)-(-114.00, 51.10); area B the smaller
-- box (-114.05, 51.00)-(-113.97, 51.10). They overlap in -114.05..-114.00.
insert into public.properties (organization_id, client_id, address_line1, city, location)
values
  (pg_temp.id('org-a'), pg_temp.id('client-a'), '1 Inside A', 'Calgary', 'SRID=4326;POINT(-114.08 51.05)'),
  (pg_temp.id('org-a'), pg_temp.id('client-a'), '2 Overlap', 'Calgary', 'SRID=4326;POINT(-114.03 51.05)'),
  (pg_temp.id('org-a'), pg_temp.id('client-a'), '3 Edge', 'Calgary', 'SRID=4326;POINT(-114.10 51.05)'),
  (pg_temp.id('org-a'), pg_temp.id('client-a'), '4 Outside', 'Calgary', 'SRID=4326;POINT(-113.80 51.05)'),
  (pg_temp.id('org-a'), pg_temp.id('client-a'), '5 No location', 'Calgary', null),
  (pg_temp.id('org-b'), pg_temp.id('client-b'), '1 Inside A (org B)', 'Calgary', 'SRID=4326;POINT(-114.08 51.05)');
insert into _ids select v.key, p.id from public.properties p
join (values ('p-in', '1 Inside A'), ('p-overlap', '2 Overlap'), ('p-edge', '3 Edge'),
             ('p-out', '4 Outside'), ('p-noloc', '5 No location'), ('p-b', '1 Inside A (org B)')) v(key, addr)
  on v.addr = p.address_line1;

------------------------------------------------------------------------------
-- Owner creates area A
------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into _ids select 'a', public.upsert_service_area(
  pg_temp.id('org-a'), null, 'Area A', pg_temp.id('crew-a'), null, '#16a34a', 0,
  pg_temp.sq(-114.10, 51.00, -114.00, 51.10));
insert into _tap (line) select isnt(pg_temp.id('a'), null, 'owner creates a service area');
insert into _tap (line) select is(pg_temp.area_of('p-in'), 'a', 'a property inside the area is assigned to it');
insert into _tap (line) select is(pg_temp.area_of('p-edge'), 'a', 'a property on the boundary matches (ST_Covers)');
insert into _tap (line) select is(pg_temp.area_of('p-out'), 'none', 'a property outside every area has none');
insert into _tap (line) select is(pg_temp.area_of('p-noloc'), 'none', 'a property with no location has none');
insert into _tap (line) select is(pg_temp.area_of('p-b'), 'none', 'another org''s property at the same point is not assigned');
insert into _tap (line) select is(
  (select geometrytype(boundary) || '/' || st_srid(boundary) from public.service_areas where id = pg_temp.id('a')),
  'MULTIPOLYGON/4326', 'a Polygon is stored as a 4326 MultiPolygon');

-- Overlapping area B, higher priority.
insert into _ids select 'b', public.upsert_service_area(
  pg_temp.id('org-a'), null, 'Area B', null, null, null, 5,
  pg_temp.sq(-114.05, 51.00, -113.97, 51.10));
insert into _tap (line) select is(pg_temp.area_of('p-overlap'), 'b', 'overlaps are allowed; the higher priority wins');
insert into _tap (line) select is(pg_temp.area_of('p-in'), 'a', 'a property only in A stays in A');

update public.service_areas set priority = -5 where id = pg_temp.id('b');
insert into _tap (line) select is(pg_temp.area_of('p-overlap'), 'a', 'lowering priority recomputes the overlap');
update public.service_areas set priority = 0 where id = pg_temp.id('b');
insert into _tap (line) select is(pg_temp.area_of('p-overlap'), 'b', 'on a priority tie the smaller area wins');

update public.service_areas set archived_at = now() where id = pg_temp.id('b');
insert into _tap (line) select is(pg_temp.area_of('p-overlap'), 'a', 'archiving an area releases its properties');
update public.service_areas set archived_at = null where id = pg_temp.id('b');
insert into _tap (line) select is(pg_temp.area_of('p-overlap'), 'b', 'unarchiving takes them back');

insert into _tap (line) select is(
  (select jsonb_array_length(public.service_areas_geojson(pg_temp.id('org-a')) -> 'features')), 2,
  'service_areas_geojson returns both areas');
insert into _tap (line) select is(
  (select f -> 'properties' -> 'overlapping_area_ids'
   from jsonb_array_elements(public.service_areas_geojson(pg_temp.id('org-a')) -> 'features') f
   where f ->> 'id' = pg_temp.id('a')::text),
  jsonb_build_array(pg_temp.id('b')), 'geojson lists overlapping areas');
insert into _tap (line) select is(
  (select (f -> 'properties' ->> 'property_count')::int
   from jsonb_array_elements(public.service_areas_geojson(pg_temp.id('org-a')) -> 'features') f
   where f ->> 'id' = pg_temp.id('a')::text),
  2, 'geojson counts the area''s properties');
insert into _tap (line) select is(
  public.service_area_coverage(pg_temp.id('org-a')) - 'areas',
  '{"covered_count": 3, "uncovered_count": 1, "no_location_count": 1}'::jsonb,
  'coverage counts covered, uncovered, and unlocated properties');

------------------------------------------------------------------------------
-- Preview (dry run) and recompute when a polygon moves
------------------------------------------------------------------------------

insert into _tap (line) select is(
  (select jsonb_agg(c ->> 'address_line1' || ':' || coalesce(c ->> 'to_area_id', 'none') order by c ->> 'address_line1')
   from jsonb_array_elements(public.preview_service_area(
     pg_temp.id('org-a'), pg_temp.id('a'), 'Area A', null, null, null, 0,
     pg_temp.sq(-114.30, 51.00, -114.20, 51.10)) -> 'changes') c),
  '["1 Inside A:none", "3 Edge:none"]'::jsonb, 'preview lists properties a move would release');
insert into _tap (line) select is(
  (select p -> 'overlapping_area_ids' from public.preview_service_area(
     pg_temp.id('org-a'), null, 'Small', null, null, null, 10,
     pg_temp.sq(-114.09, 51.04, -114.07, 51.06)) p),
  jsonb_build_array(pg_temp.id('a')), 'preview reports overlapping areas');
insert into _tap (line) select is(
  (select jsonb_agg(c -> 'to_preview') from jsonb_array_elements(public.preview_service_area(
     pg_temp.id('org-a'), null, 'Small', null, null, null, 10,
     pg_temp.sq(-114.09, 51.04, -114.07, 51.06)) -> 'changes') c),
  '[true]'::jsonb, 'preview of a new area shows the property it would take');
insert into _tap (line) select is(pg_temp.area_of('p-in'), 'a', 'preview writes nothing');

select public.upsert_service_area(
  pg_temp.id('org-a'), pg_temp.id('a'), 'Area A', pg_temp.id('crew-a'), null, '#16a34a', 0,
  pg_temp.sq(-114.30, 51.00, -114.20, 51.10));
insert into _tap (line) select is(pg_temp.area_of('p-in'), 'none', 'moving a polygon releases properties it left');
insert into _tap (line) select is(pg_temp.area_of('p-edge'), 'none', 'moving a polygon releases its edge property');
insert into _tap (line) select is(pg_temp.area_of('p-overlap'), 'b', 'a property in another area is unaffected');

update public.properties set location = 'SRID=4326;POINT(-114.25 51.05)' where id = pg_temp.id('p-in');
insert into _tap (line) select is(pg_temp.area_of('p-in'), 'a', 'moving a property''s location reassigns it');
update public.properties set location = 'SRID=4326;POINT(-114.00 51.05)' where id = pg_temp.id('p-out');
insert into _tap (line) select is(pg_temp.area_of('p-out'), 'b', 'a property moved into B joins B');
update public.properties set location = null where id = pg_temp.id('p-out');
insert into _tap (line) select is(pg_temp.area_of('p-out'), 'none', 'clearing a location clears the area');

delete from public.service_areas where id = pg_temp.id('b');
insert into _tap (line) select is(pg_temp.area_of('p-overlap'), 'none', 'deleting an area releases its properties');

------------------------------------------------------------------------------
-- Geometry validation
------------------------------------------------------------------------------

insert into _ids select 'bowtie', public.upsert_service_area(
  pg_temp.id('org-a'), null, 'Bowtie', null, null, null, 0,
  '{"type":"Polygon","coordinates":[[[-113.6,51.0],[-113.5,51.1],[-113.5,51.0],[-113.6,51.1],[-113.6,51.0]]]}');
insert into _tap (line) select is(
  (select st_isvalid(boundary) and st_numgeometries(boundary) = 2 from public.service_areas where id = pg_temp.id('bowtie')),
  true, 'a self-intersecting polygon is made valid (two parts)');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Line', null, null, null, 0,
    '{"type":"LineString","coordinates":[[-114,51],[-113.9,51.1]]}')$$,
  '22023', null, 'a non-polygon is rejected');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Flat', null, null, null, 0,
    '{"type":"Polygon","coordinates":[[[-114,51],[-113.9,51],[-113.8,51],[-114,51]]]}')$$,
  '22023', 'boundary has no area', 'a zero-area polygon is rejected');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Garbage', null, null, null, 0,
    '{"type":"Polygon","coordinates":"nope"}')$$,
  '22023', null, 'malformed GeoJSON is rejected');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Projected', null, null, null, 0,
    pg_temp.sq(500000, 5650000, 501000, 5651000))$$,
  '22023', 'boundary coordinates must be longitude/latitude', 'projected coordinates are rejected');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Huge', null, null, null, 0,
    pg_temp.sq(-115, 50, -113, 52))$$,
  '22023', null, 'an area over 5,000 km² is rejected');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'World', null, null, null, 0,
    pg_temp.sq(-180, -90, 180, 90))$$,
  '22023', null, 'a whole-world box is rejected as too large (not a GEOS error)');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Antipodal', null, null, null, 0,
    pg_temp.sq(-90, -10, 90, 10))$$,
  '22023', null, 'a polygon with a 180-degree edge is rejected');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_region(pg_temp.id('org-a'), null, 'World', pg_temp.sq(-180, -90, 180, 90), null, null, null, null)$$,
  '22023', null, 'a whole-world region boundary is rejected');
insert into _tap (line) select throws_ok(
  $$select public.preview_service_area(pg_temp.id('org-a'), null, 'World', null, null, null, 0, pg_temp.sq(-180, -90, 180, 90))$$,
  '22023', null, 'preview rejects a whole-world box too');
insert into _tap (line) select throws_ok(
  format($$select public.upsert_service_area(%L, null, 'Dense', null, null, null, 0, %L)$$,
    pg_temp.id('org-a'),
    jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(
      (select jsonb_agg(jsonb_build_array(-114 + 0.01 * cos(2 * pi() * (i % 5001) / 5001),
                                          51 + 0.01 * sin(2 * pi() * (i % 5001) / 5001)) order by i)
       from generate_series(0, 5001) i)))),
  '22023', null, 'more than 5,000 vertices is rejected');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Bad colour', null, null, 'green', 0,
    pg_temp.sq(-113.4, 51.0, -113.3, 51.1))$$,
  '23514', null, 'a non-hex colour is rejected');
insert into _tap (line) select lives_ok(
  $$select public.upsert_service_area(p_organization_id => pg_temp.id('org-a'), p_name => 'Named args',
    p_geojson => pg_temp.sq(-113.2, 51.0, -113.1, 51.1))$$,
  'optional arguments can be omitted (API callers send only what they have)');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(p_organization_id => pg_temp.id('org-a'),
    p_geojson => pg_temp.sq(-113.2, 51.2, -113.1, 51.3))$$,
  '22023', 'name is required', 'a name is required');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'area a', null, null, null, 0,
    pg_temp.sq(-113.4, 51.0, -113.3, 51.1))$$,
  '23505', null, 'names are unique per org (case-insensitive) among live areas');

------------------------------------------------------------------------------
-- Derived and geometry columns are not writable through the API
------------------------------------------------------------------------------

insert into _tap (line) select throws_ok(
  $$update public.properties set service_area_id = pg_temp.id('a') where id = pg_temp.id('p-overlap')$$,
  '42501', null, 'properties.service_area_id is not updatable');
insert into _tap (line) select throws_ok(
  $$insert into public.properties (organization_id, client_id, address_line1, city, service_area_id)
    values (pg_temp.id('org-a'), pg_temp.id('client-a'), '9 Sneaky', 'Calgary', pg_temp.id('a'))$$,
  '42501', null, 'properties.service_area_id is not insertable');
insert into _tap (line) select throws_ok(
  $$update public.service_areas set boundary = 'SRID=4326;MULTIPOLYGON(((-114 51,-113 51,-113 52,-114 51)))' where id = pg_temp.id('a')$$,
  '42501', null, 'service_areas.boundary is not directly updatable');
insert into _tap (line) select throws_ok(
  $$insert into public.service_areas (organization_id, name, boundary)
    values (pg_temp.id('org-a'), 'Direct', 'SRID=4326;MULTIPOLYGON(((-114 51,-113.9 51,-113.9 51.1,-114 51)))')$$,
  '42501', null, 'service areas cannot be inserted directly');
insert into _tap (line) select throws_ok(
  $$select private.service_area_at(pg_temp.id('org-a'), 'SRID=4326;POINT(-114 51)'::geometry)$$,
  '42501', null, 'the winner lookup is not callable by API users');

-- Trusted code writing the column directly is overridden by the derivation.
select set_config('role', 'postgres', true);
update public.properties set service_area_id = pg_temp.id('bowtie') where id = pg_temp.id('p-in');
insert into _tap (line) select is(pg_temp.area_of('p-in'), 'a', 'a direct write of service_area_id is re-derived');

------------------------------------------------------------------------------
-- Role matrix
------------------------------------------------------------------------------

-- Admin writes.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select lives_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), pg_temp.id('a'), 'Area A (admin)', pg_temp.id('crew-a'), null, null, 0,
    pg_temp.sq(-114.30, 51.00, -114.20, 51.10))$$,
  'admin can edit an area');
insert into _tap (line) select results_eq(
  $$update public.service_areas set color = '#000000' where id = pg_temp.id('a') returning id$$,
  $$select pg_temp.id('a')$$, 'admin can update area columns');
insert into _tap (line) select lives_ok(
  $$select public.set_service_area_rotations(pg_temp.id('org-a'), pg_temp.id('a'),
    jsonb_build_array(jsonb_build_object('weekday', 1, 'crew_id', pg_temp.id('crew-a')),
                      jsonb_build_object('weekday', 3, 'crew_id', pg_temp.id('crew-a'))))$$,
  'admin can set rotations');
insert into _tap (line) select is(
  (select count(*) from public.service_area_rotations where service_area_id = pg_temp.id('a')), 2::bigint,
  'rotations are stored');
insert into _tap (line) select lives_ok(
  $$select public.set_service_area_rotations(pg_temp.id('org-a'), pg_temp.id('a'),
    jsonb_build_array(jsonb_build_object('weekday', 5, 'crew_id', pg_temp.id('crew-a'))))$$,
  'setting rotations again replaces them');
insert into _tap (line) select is(
  (select array_agg(weekday) from public.service_area_rotations where service_area_id = pg_temp.id('a')), '{5}'::smallint[],
  'only the new rotation remains');
insert into _tap (line) select throws_ok(
  $$select public.set_service_area_rotations(pg_temp.id('org-a'), pg_temp.id('a'),
    jsonb_build_array(jsonb_build_object('weekday', 8, 'crew_id', pg_temp.id('crew-a'))))$$,
  '23514', null, 'weekday must be 1-7');
insert into _tap (line) select throws_ok(
  $$select public.set_service_area_rotations(pg_temp.id('org-a'), pg_temp.id('a'),
    jsonb_build_array(jsonb_build_object('weekday', 2, 'crew_id', pg_temp.id('crew-b'))))$$,
  '23503', null, 'a rotation cannot use another org''s crew');
insert into _tap (line) select is(
  (select f -> 'properties' -> 'rotations'
   from jsonb_array_elements(public.service_areas_geojson(pg_temp.id('org-a')) -> 'features') f
   where f ->> 'id' = pg_temp.id('a')::text),
  jsonb_build_array(jsonb_build_object('weekday', 5, 'crew_id', pg_temp.id('crew-a'))), 'geojson includes rotations');

insert into _ids select 'region', public.upsert_service_region(
  pg_temp.id('org-a'), null, 'Calgary', null, '{"type":"Point","coordinates":[-114.0719,51.0447]}', null, 'manual', null);
insert into _tap (line) select is(
  (select f -> 'properties' -> 'center' from jsonb_array_elements(public.service_regions_geojson(pg_temp.id('org-a')) -> 'features') f),
  '[-114.0719, 51.0447]'::jsonb, 'admin can add a region from a center point');
insert into _ids select 'region-2', public.upsert_service_region(
  pg_temp.id('org-a'), null, 'Airdrie', pg_temp.sq(-114.05, 51.25, -113.95, 51.33), null, null, 'manual', null);
insert into _tap (line) select is(
  (select f -> 'properties' -> 'bbox'
   from jsonb_array_elements(public.service_regions_geojson(pg_temp.id('org-a')) -> 'features') f
   where f ->> 'id' = pg_temp.id('region-2')::text),
  '[-114.05, 51.25, -113.95, 51.33]'::jsonb, 'a region with a boundary derives its bbox');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_region(pg_temp.id('org-a'), null, 'calgary', null,
    '{"type":"Point","coordinates":[-114,51]}', null, null, null)$$,
  '23505', null, 'region names are unique per org');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_region(pg_temp.id('org-a'), null, 'Nowhere', null, null, null, null, null)$$,
  '22023', null, 'a region needs a boundary or a center');
insert into _tap (line) select lives_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), pg_temp.id('a'), 'Area A (admin)', pg_temp.id('crew-a'),
    pg_temp.id('region'), null, 0, pg_temp.sq(-114.30, 51.00, -114.20, 51.10))$$,
  'an area can belong to a region');

-- Dispatcher, worker, nonmember: read-only or nothing.
do $$
declare
  actor record;
begin
  for actor in select * from (values (3, 'dispatcher', 3), (4, 'worker', 3), (5, 'nonmember', 0)) a(n, label, visible)
  loop
    perform set_config('request.jwt.claims', json_build_object(
      'sub', '00000000-0000-0000-0000-00000000c00' || actor.n, 'role', 'authenticated')::text, true);
    insert into _tap (line) select is(
      (select count(*) from public.service_areas), actor.visible::bigint,
      actor.label || ' sees ' || actor.visible || ' areas');
    insert into _tap (line) select is(
      (select count(*) from public.service_regions), (case when actor.visible > 0 then 2 else 0 end)::bigint,
      actor.label || ' region visibility');
    insert into _tap (line) select throws_ok(
      $q$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Nope', null, null, null, 0,
        pg_temp.sq(-113.4, 51.0, -113.3, 51.1))$q$,
      '42501', null, actor.label || ' cannot create an area');
    insert into _tap (line) select throws_ok(
      $q$select public.upsert_service_area(pg_temp.id('org-a'), pg_temp.id('a'), 'Nope', null, null, null, 0,
        pg_temp.sq(-113.4, 51.0, -113.3, 51.1))$q$,
      '42501', null, actor.label || ' cannot edit an area');
    insert into _tap (line) select results_eq(
      $q$update public.service_areas set archived_at = now() where id = pg_temp.id('a') returning id$q$,
      $q$select id from _ids where false$q$, actor.label || ' cannot archive an area');
    insert into _tap (line) select results_eq(
      $q$delete from public.service_areas where id = pg_temp.id('a') returning id$q$,
      $q$select id from _ids where false$q$, actor.label || ' cannot delete an area');
    insert into _tap (line) select throws_ok(
      $q$select public.upsert_service_region(pg_temp.id('org-a'), null, 'Nope', null,
        '{"type":"Point","coordinates":[-114,51]}', null, null, null)$q$,
      '42501', null, actor.label || ' cannot create a region');
    if actor.visible > 0 then
      insert into _tap (line) select throws_ok(
        $q$select public.set_service_area_rotations(pg_temp.id('org-a'), pg_temp.id('a'),
          jsonb_build_array(jsonb_build_object('weekday', 2, 'crew_id', pg_temp.id('crew-a'))))$q$,
        '42501', null, actor.label || ' cannot set rotations');
    end if;
  end loop;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c004","role":"authenticated"}', true);
insert into _tap (line) select is(
  (select (f -> 'properties' ->> 'property_count')::int
   from jsonb_array_elements(public.service_areas_geojson(pg_temp.id('org-a')) -> 'features') f
   where f ->> 'id' = pg_temp.id('a')::text),
  0, 'workers see areas but no property counts (no properties policy)');

select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select name || '/' || coalesce(archived_at::text, 'live') from public.service_areas where id = pg_temp.id('a')),
  'Area A (admin)/live', 'read-only roles changed nothing');
insert into _tap (line) select is(
  (select array_agg(weekday) from public.service_area_rotations where service_area_id = pg_temp.id('a')), '{5}'::smallint[],
  'read-only roles left the rotations alone');

------------------------------------------------------------------------------
-- Cross-org isolation
------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c006","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select is((select count(*) from public.service_areas), 0::bigint, 'org B owner sees none of org A''s areas');
insert into _tap (line) select is(
  public.service_areas_geojson(pg_temp.id('org-a')) -> 'features', '[]'::jsonb,
  'org B owner gets an empty FeatureCollection for org A');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-a'), null, 'Intrusion', null, null, null, 0,
    pg_temp.sq(-113.4, 51.0, -113.3, 51.1))$$,
  '42501', null, 'org B owner cannot create areas in org A');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-b'), pg_temp.id('a'), 'Hijack', null, null, null, 0,
    pg_temp.sq(-113.4, 51.0, -113.3, 51.1))$$,
  'P0002', null, 'org B owner cannot edit org A''s area through their own org');
insert into _tap (line) select throws_ok(
  $$select public.upsert_service_area(pg_temp.id('org-b'), null, 'Borrowed crew', pg_temp.id('crew-a'), null, null, 0,
    pg_temp.sq(-113.4, 51.0, -113.3, 51.1))$$,
  '23503', null, 'an area cannot use another org''s crew');
insert into _tap (line) select results_eq(
  $$update public.service_areas set name = 'Hijack' where id = pg_temp.id('a') returning id$$,
  $$select id from _ids where false$$, 'org B owner cannot update org A''s area');
insert into _ids select 'area-b1', public.upsert_service_area(
  pg_temp.id('org-b'), null, 'B1', pg_temp.id('crew-b'), null, null, 0,
  pg_temp.sq(-114.10, 51.00, -114.00, 51.10));
insert into _tap (line) select is(pg_temp.area_of('p-b'), 'area-b1', 'org B''s own area covers org B''s property');
insert into _tap (line) select is(pg_temp.area_of('p-overlap'), 'none', 'org B''s area does not touch org A''s properties');

select set_config('role', 'anon', true);
insert into _tap (line) select throws_ok(
  $$select public.service_areas_geojson(pg_temp.id('org-a'))$$,
  '42501', null, 'anon cannot call the service area RPCs');

select set_config('role', 'postgres', true);
insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;
rollback;
