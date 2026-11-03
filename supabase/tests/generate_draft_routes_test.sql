-- pgTAP tests for the generate_draft_routes migration. Hermetic: its own orgs
-- ('pgtap-gdr-a', 'pgtap-gdr-b') and users. See supabase/tests/README.md.
--
-- 2026-06-03 is a Wednesday (ISO weekday 3), 06-04 a Thursday.
-- route_stops.sequence is deferrable initially deferred; the test rolls back,
-- so `set constraints all immediate` forces the check before asserting.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
create temp table _res (key text primary key, doc jsonb);
grant all on _tap, _tap_n_seq, _ids, _res to authenticated, anon, service_role;
select no_plan();

create function pg_temp.sq(w float8, s float8, e float8, n float8)
returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'Polygon', 'coordinates',
    jsonb_build_array(jsonb_build_array(
      jsonb_build_array(w, s), jsonb_build_array(e, s), jsonb_build_array(e, n),
      jsonb_build_array(w, n), jsonb_build_array(w, s))))
$$;
create function pg_temp.id(p_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from pg_temp._ids where key = p_key
$$;
-- The _ids key of a uuid ('?' when unknown), readable whichever role is active.
create function pg_temp.keyof(p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select key from pg_temp._ids where id = p_id), '?')
$$;
-- 'key1,key2,...' for the visits on a route, in stop order. Reads as the owner.
create function pg_temp.stops(p_route_key text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(pg_temp.keyof(rs.visit_id), ',' order by rs.sequence), '')
  from public.route_stops rs where rs.route_id = (select id from pg_temp._ids where key = p_route_key)
$$;
-- The route id for a crew and date, or null. Reads as the owner.
create function pg_temp.route_of(p_crew_key text, p_date date)
returns uuid language sql stable security definer set search_path = '' as $$
  select r.id from public.routes r
  where r.crew_id = (select id from pg_temp._ids where key = p_crew_key) and r.route_date = p_date
$$;
-- visit key → reason, for a result's unassigned list.
create function pg_temp.reasons(p_doc jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(pg_temp.keyof((u ->> 'visit_id')::uuid), u ->> 'reason'), '{}'::jsonb)
  from jsonb_array_elements(p_doc -> 'unassigned') u
$$;
grant execute on function pg_temp.sq(float8, float8, float8, float8), pg_temp.id(text), pg_temp.keyof(uuid),
  pg_temp.stops(text), pg_temp.route_of(text, date), pg_temp.reasons(jsonb)
  to authenticated, anon, service_role;

------------------------------------------------------------------------------
-- private.order_stops (pure): called as the owner of the test
------------------------------------------------------------------------------

insert into _tap (line) select is(private.order_stops(null, null), '{}'::integer[], 'order_stops of nothing is empty');
insert into _tap (line) select is(
  private.order_stops('SRID=4326;POINT(0 0)'::geography, array['SRID=4326;POINT(0.01 0.01)'::geography]),
  array[1], 'a single point is returned as is');
-- Nearest neighbour from the origin gives 5,2,4,3,1 here (about 44 km);
-- the 2-opt pass finds 4,2,5,3,1 (about 36 km), which is the optimum.
insert into _tap (line) select is(
  private.order_stops('SRID=4326;POINT(0 0)'::geography, array[
    'SRID=4326;POINT(0.04 0.09)', 'SRID=4326;POINT(0.09 -0.05)', 'SRID=4326;POINT(0.06 0.06)',
    'SRID=4326;POINT(0.02 -0.09)', 'SRID=4326;POINT(0.08 -0.01)']::geography[]),
  array[4, 2, 5, 3, 1], '2-opt untangles a nearest-neighbour path');
-- No origin: point 1 stays first, the rest follow nearest-first.
insert into _tap (line) select is(
  private.order_stops(null, array[
    'SRID=4326;POINT(0 0)', 'SRID=4326;POINT(0.3 0)', 'SRID=4326;POINT(0.1 0)', 'SRID=4326;POINT(0.2 0)']::geography[]),
  array[1, 3, 4, 2], 'with no origin the first point starts the path');

------------------------------------------------------------------------------
-- Fixtures. Org A: owner d001, admin d002, dispatcher d003, worker d004.
-- Org B: owner d005. Non-member d006.
------------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
select ('00000000-0000-0000-0000-00000000d00' || n)::uuid,
       'gdr-' || n || '@test.local', 'authenticated', 'authenticated'
from generate_series(1, 6) n;
insert into public.organizations (name, slug) values ('GDR A', 'pgtap-gdr-a'), ('GDR B', 'pgtap-gdr-b');
insert into _ids select 'org-a', id from public.organizations where slug = 'pgtap-gdr-a';
insert into _ids select 'org-b', id from public.organizations where slug = 'pgtap-gdr-b';
insert into public.organization_members (organization_id, user_id, role, display_name)
select pg_temp.id(org), ('00000000-0000-0000-0000-00000000d00' || n)::uuid, role::public.org_role, 'gdr-' || role
from (values (1, 'owner', 'org-a'), (2, 'admin', 'org-a'), (3, 'dispatcher', 'org-a'),
             (4, 'worker', 'org-a'), (5, 'owner', 'org-b')) r(n, role, org);
insert into _ids select 'm-worker', id from public.organization_members where display_name = 'gdr-worker';

insert into public.crews (organization_id, name, default_start_location) values
  (pg_temp.id('org-a'), 'North', 'SRID=4326;POINT(-114.10 51.00)'),
  (pg_temp.id('org-a'), 'South', null),
  (pg_temp.id('org-a'), 'Rotation', null),
  (pg_temp.id('org-a'), 'Overlap', null),
  (pg_temp.id('org-a'), 'Preferred', null),
  (pg_temp.id('org-a'), 'Gone', null),
  (pg_temp.id('org-b'), 'B crew', null);
insert into _ids select 'crew-' || case name when 'North' then 'n' when 'South' then 's' when 'Rotation' then 'r'
    when 'Overlap' then 'o' when 'Preferred' then 'p' when 'Gone' then 'g' else 'b' end, id
from public.crews where organization_id in (pg_temp.id('org-a'), pg_temp.id('org-b'));
insert into public.crew_members (organization_id, crew_id, member_id)
values (pg_temp.id('org-a'), pg_temp.id('crew-p'), pg_temp.id('m-worker'));

insert into public.clients (organization_id, display_name) values (pg_temp.id('org-a'), 'Client A'), (pg_temp.id('org-b'), 'Client B');
insert into _ids select 'client-a', id from public.clients where organization_id = pg_temp.id('org-a');
insert into _ids select 'client-b', id from public.clients where organization_id = pg_temp.id('org-b');

-- Areas, created by the owner: an (North), as (South), ao (Overlap, priority 5,
-- inside an), ax (no crew), ag (Gone, archived below), and org B's bn.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _ids select 'an', public.upsert_service_area(pg_temp.id('org-a'), null, 'North area', pg_temp.id('crew-n'), null, null, 0, pg_temp.sq(-114.20, 51.00, -114.00, 51.20));
insert into _ids select 'as', public.upsert_service_area(pg_temp.id('org-a'), null, 'South area', pg_temp.id('crew-s'), null, null, 0, pg_temp.sq(-114.20, 50.80, -114.00, 50.99));
insert into _ids select 'ao', public.upsert_service_area(pg_temp.id('org-a'), null, 'Overlap area', pg_temp.id('crew-o'), null, null, 5, pg_temp.sq(-114.12, 51.08, -114.08, 51.12));
insert into _ids select 'ax', public.upsert_service_area(pg_temp.id('org-a'), null, 'No crew area', null, null, null, 0, pg_temp.sq(-114.40, 51.00, -114.30, 51.10));
insert into _ids select 'ag', public.upsert_service_area(pg_temp.id('org-a'), null, 'Gone area', pg_temp.id('crew-g'), null, null, 0, pg_temp.sq(-114.60, 51.00, -114.50, 51.10));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d005","role":"authenticated"}', true);
insert into _ids select 'bn', public.upsert_service_area(pg_temp.id('org-b'), null, 'B area', pg_temp.id('crew-b'), null, null, 0, pg_temp.sq(-114.20, 51.00, -114.00, 51.20));
select set_config('role', 'postgres', true);

-- South's area rotates to the Rotation crew on Wednesdays only.
insert into public.service_area_rotations (organization_id, service_area_id, weekday, crew_id)
values (pg_temp.id('org-a'), pg_temp.id('as'), 3, pg_temp.id('crew-r'));
update public.crews set archived_at = now() where id = pg_temp.id('crew-g');

insert into public.properties (organization_id, client_id, address_line1, city, location)
select pg_temp.id(p.org), pg_temp.id(p.client), p.key, 'Calgary', p.loc::geography
from (values
  ('n1', 'org-a', 'client-a', 'SRID=4326;POINT(-114.10 51.05)'),
  ('n2', 'org-a', 'client-a', 'SRID=4326;POINT(-114.05 51.05)'),
  ('n3', 'org-a', 'client-a', 'SRID=4326;POINT(-114.15 51.15)'),
  ('n4', 'org-a', 'client-a', 'SRID=4326;POINT(-114.02 51.10)'),
  ('n5', 'org-a', 'client-a', 'SRID=4326;POINT(-114.18 51.02)'),
  ('n6', 'org-a', 'client-a', 'SRID=4326;POINT(-114.06 51.12)'),
  ('po', 'org-a', 'client-a', 'SRID=4326;POINT(-114.10 51.10)'),
  ('ps', 'org-a', 'client-a', 'SRID=4326;POINT(-114.10 50.90)'),
  ('px', 'org-a', 'client-a', 'SRID=4326;POINT(-114.35 51.05)'),
  ('pg', 'org-a', 'client-a', 'SRID=4326;POINT(-114.55 51.05)'),
  ('pnone', 'org-a', 'client-a', 'SRID=4326;POINT(-113.00 51.00)'),
  ('pnoloc', 'org-a', 'client-a', null),
  ('pb', 'org-b', 'client-b', 'SRID=4326;POINT(-114.10 51.05)')
) p(key, org, client, loc);
insert into _ids select 'p-' || address_line1, id from public.properties
where organization_id in (pg_temp.id('org-a'), pg_temp.id('org-b'));

-- One-off jobs make one scheduled visit each: (visit key, property, date, preferred crew).
insert into public.jobs (organization_id, client_id, property_id, title, start_date, preferred_crew_id)
select pr.organization_id, pr.client_id, pr.id, v.key, v.d::date,
       case when v.pref is null then null else pg_temp.id(v.pref) end
from (values
  ('vn1', 'n1', '2026-06-03', null), ('vn2', 'n2', '2026-06-03', null),
  ('vn3', 'n3', '2026-06-03', null), ('vn4', 'n4', '2026-06-03', null),
  ('vpref3', 'n5', '2026-06-03', 'crew-g'),
  ('vo', 'po', '2026-06-03', null), ('vs', 'ps', '2026-06-03', null),
  ('vx', 'px', '2026-06-03', null), ('vg', 'pg', '2026-06-03', null),
  ('vnone', 'pnone', '2026-06-03', null), ('vnoloc', 'pnoloc', '2026-06-03', null),
  ('vpref', 'pnone', '2026-06-03', 'crew-p'), ('vpref2', 'n6', '2026-06-03', 'crew-p'),
  ('vparch', 'pnone', '2026-06-03', 'crew-g'),
  ('vs2', 'ps', '2026-06-04', null),
  ('lk1', 'n1', '2026-06-05', null), ('lk2', 'n2', '2026-06-05', null), ('lk3', 'ps', '2026-06-05', null),
  ('k1', 'n1', '2026-06-06', null), ('k2', 'n2', '2026-06-06', null),
  ('k3', 'n3', '2026-06-06', null), ('k4', 'n4', '2026-06-06', null),
  ('o1', 'n1', '2026-06-07', null)
) v(key, prop, d, pref)
join public.properties pr on pr.address_line1 = v.prop and pr.organization_id = pg_temp.id('org-a');
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select pr.organization_id, pr.client_id, pr.id, 'vb', '2026-06-03'::date
from public.properties pr where pr.address_line1 = 'pb' and pr.organization_id = pg_temp.id('org-b');
-- 501 visits on one day for the cap test.
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select pr.organization_id, pr.client_id, pr.id, 'cap' || g, '2026-07-01'::date
from public.properties pr, generate_series(1, 501) g
where pr.address_line1 = 'ps' and pr.organization_id = pg_temp.id('org-a');

insert into _ids select j.title, v.id from public.visits v
join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
where j.organization_id in (pg_temp.id('org-a'), pg_temp.id('org-b')) and j.title not like 'cap%';

-- Routes that exist before the run:
--  06-05  North, published, with lk1;
--  06-06  North, draft, with k1 (locked, seq 1, travel 123) and k2 (seq 2);
--  06-07  North, optimized, empty.
insert into public.routes (organization_id, crew_id, route_date, status) values
  (pg_temp.id('org-a'), pg_temp.id('crew-n'), '2026-06-05', 'published'),
  (pg_temp.id('org-a'), pg_temp.id('crew-n'), '2026-06-06', 'draft'),
  (pg_temp.id('org-a'), pg_temp.id('crew-n'), '2026-06-07', 'optimized');
insert into _ids select 'r-0605', pg_temp.route_of('crew-n', '2026-06-05');
insert into _ids select 'r-0606', pg_temp.route_of('crew-n', '2026-06-06');
insert into _ids select 'r-0607', pg_temp.route_of('crew-n', '2026-06-07');
insert into public.route_stops (organization_id, route_id, visit_id, sequence, is_locked, travel_distance_m) values
  (pg_temp.id('org-a'), pg_temp.id('r-0605'), pg_temp.id('lk1'), 1, false, null),
  (pg_temp.id('org-a'), pg_temp.id('r-0606'), pg_temp.id('k1'), 1, true, 123),
  (pg_temp.id('org-a'), pg_temp.id('r-0606'), pg_temp.id('k2'), 2, false, 456);

------------------------------------------------------------------------------
-- Role gating
------------------------------------------------------------------------------

-- Worker
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-03')$$,
  '42501', 'not allowed to build routes', 'a worker can''t generate routes');
-- Non-member
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d006","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-03')$$,
  '42501', 'not allowed to build routes', 'a non-member can''t generate routes');
-- Dispatcher of org A, asking for org B
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.generate_draft_routes(pg_temp.id('org-b'), '2026-06-03')$$,
  '42501', 'not allowed to build routes', 'another org''s dispatcher is refused');
insert into _tap (line) select throws_ok(
  $$select public.generate_draft_routes(null, '2026-06-03')$$,
  '22023', 'organization and date are required', 'a null org is refused');
insert into _tap (line) select throws_ok(
  $$select public.generate_draft_routes(pg_temp.id('org-a'), null)$$,
  '22023', 'organization and date are required', 'a null date is refused');
-- Owner and admin are allowed (an empty day does nothing).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true);
insert into _tap (line) select is(
  public.generate_draft_routes(pg_temp.id('org-a'), '2026-08-01'),
  '{"assigned": 0, "routes_created": 0, "remaining": 0, "unassigned": []}'::jsonb,
  'an owner can generate; a day with no visits does nothing');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}', true);
insert into _tap (line) select is(
  (public.generate_draft_routes(pg_temp.id('org-a'), '2026-08-01') ->> 'assigned')::int, 0,
  'an admin can generate');
-- anon and service_role have no execute grant
select set_config('role', 'anon', true);
insert into _tap (line) select throws_ok(
  $$select public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-03')$$,
  '42501', null, 'anon can''t call generate_draft_routes');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-03')$$,
  '42501', null, 'service_role can''t call generate_draft_routes');

------------------------------------------------------------------------------
-- 2026-06-03 (Wednesday): the dispatcher builds routes
------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _res select 'run1', public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-03');

insert into _tap (line) select is(
  (select doc ->> 'assigned' from _res where key = 'run1'), '9',
  'nine visits are assigned: area, preferred, rotation, overlap-priority');
insert into _tap (line) select is(
  (select doc ->> 'routes_created' from _res where key = 'run1'), '4',
  'a route is created for each owning crew');
insert into _tap (line) select is(
  (select doc ->> 'remaining' from _res where key = 'run1'), '0', 'nothing remains under the cap');
insert into _tap (line) select is(
  pg_temp.reasons((select doc from _res where key = 'run1')),
  '{"vx": "area_has_no_crew", "vg": "crew_archived", "vnone": "no_area", "vnoloc": "no_location", "vparch": "crew_archived"}'::jsonb,
  'each unassigned visit gets its reason');

insert into _ids select 'r-n', pg_temp.route_of('crew-n', '2026-06-03');
insert into _ids select 'r-o', pg_temp.route_of('crew-o', '2026-06-03');
insert into _ids select 'r-r', pg_temp.route_of('crew-r', '2026-06-03');
insert into _ids select 'r-p', pg_temp.route_of('crew-p', '2026-06-03');

insert into _tap (line) select is(
  (select count(*) from public.route_stops where route_id = pg_temp.id('r-n')), 5::bigint,
  'the area''s crew gets the visits in its area, and the archived preferred crew falls through to it');
insert into _tap (line) select is(
  (select count(*) from public.route_stops where route_id = pg_temp.id('r-o')), 1::bigint,
  'a property in two areas goes to the higher priority area''s crew');
insert into _tap (line) select is(pg_temp.stops('r-o'), 'vo', 'the overlap crew has the overlap visit');
insert into _tap (line) select is(pg_temp.stops('r-r'), 'vs', 'the weekday rotation crew beats the area crew on its weekday');
insert into _tap (line) select is(
  (select array_agg(k order by k) from unnest(string_to_array(pg_temp.stops('r-p'), ',')) k), array['vpref', 'vpref2'],
  'a preferred crew gets its jobs, with or without an area');
insert into _tap (line) select is(pg_temp.route_of('crew-s', '2026-06-03'), null, 'the area crew gets no route when the rotation crew has the day');
insert into _tap (line) select is(pg_temp.route_of('crew-g', '2026-06-03'), null, 'an archived crew gets no route');
insert into _tap (line) select is(
  (select count(*) from public.route_stops rs join public.routes r on r.id = rs.route_id
   where r.route_date = '2026-06-03' and rs.visit_id in (pg_temp.id('vx'), pg_temp.id('vg'), pg_temp.id('vnone'), pg_temp.id('vnoloc'), pg_temp.id('vparch'))),
  0::bigint, 'unassigned visits are not routed');

-- Route defaults come from create_route's triggers.
insert into _tap (line) select is(
  (select st_astext(start_location::geometry) from public.routes where id = pg_temp.id('r-n')), 'POINT(-114.1 51)',
  'the new route copies the crew''s depot');
insert into _tap (line) select isnt(
  (select planned_start from public.routes where id = pg_temp.id('r-n')), null, 'the new route gets a planned start');
insert into _tap (line) select is(
  (select status::text from public.routes where id = pg_temp.id('r-n')), 'draft', 'new routes are drafts');
insert into _tap (line) select is(
  (select count(*) from public.route_members where route_id = pg_temp.id('r-p')), 1::bigint,
  'the new route''s roster is seeded from the crew');

-- Ordering and travel figures on North's route.
set constraints all immediate;
insert into _tap (line) select is(
  (select array_agg(sequence order by sequence) from public.route_stops where route_id = pg_temp.id('r-n')),
  array[1, 2, 3, 4, 5], 'stop sequences are 1..n');
insert into _tap (line) select is(
  pg_temp.stops('r-n'), 'vn1,vn2,vn4,vn3,vpref3',
  'stops are ordered from the depot by nearest neighbour then 2-opt');
insert into _tap (line) select is(
  (select travel_distance_m from public.route_stops where route_id = pg_temp.id('r-n') and sequence = 1),
  (select round(st_distance('SRID=4326;POINT(-114.10 51.00)'::geography, location))::int
   from public.properties where id = pg_temp.id('p-n1')),
  'the first stop''s travel is the distance from the depot');
insert into _tap (line) select is(
  (select travel_distance_m from public.route_stops where route_id = pg_temp.id('r-n') and sequence = 2),
  (select round(st_distance(a.location, b.location))::int
   from public.properties a, public.properties b where a.id = pg_temp.id('p-n1') and b.id = pg_temp.id('p-n2')),
  'a later stop''s travel is the distance from the previous stop');
insert into _tap (line) select is(
  (select count(*) from public.route_stops where route_id = pg_temp.id('r-n')
     and (travel_distance_m is null or travel_duration_s is not null or planned_arrival is not null or planned_departure is not null)),
  0::bigint, 'distance is set; duration and planned times are left null (no fake ETAs)');

------------------------------------------------------------------------------
-- Idempotency
------------------------------------------------------------------------------

insert into _res select 'run2', public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-03');
insert into _tap (line) select is(
  (select doc - 'unassigned' from _res where key = 'run2'),
  '{"assigned": 0, "routes_created": 0, "remaining": 0}'::jsonb, 'a second run places nothing and creates nothing');
insert into _tap (line) select is(
  pg_temp.reasons((select doc from _res where key = 'run2')), pg_temp.reasons((select doc from _res where key = 'run1')),
  'a second run reports the same unassigned visits');
insert into _tap (line) select is(
  (select count(*) from public.route_stops rs join public.routes r on r.id = rs.route_id where r.route_date = '2026-06-03'),
  9::bigint, 'a second run leaves the stops as they were');
insert into _tap (line) select is(
  (select count(*) from public.routes where route_date = '2026-06-03'), 4::bigint, 'a second run leaves the routes as they were');

-- Rotation applies on its weekday only: Thursday goes to the area's crew.
insert into _res select 'thu', public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-04');
insert into _tap (line) select is(
  (select string_agg(pg_temp.keyof(rs.visit_id), ',') from public.route_stops rs where rs.route_id = pg_temp.route_of('crew-s', '2026-06-04')),
  'vs2', 'off its weekday the rotation does not apply; the area''s crew gets the visit');

------------------------------------------------------------------------------
-- Existing routes: published untouched, draft appended to, optimized used
------------------------------------------------------------------------------

insert into _res select 'fri', public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-05');
insert into _tap (line) select is(
  pg_temp.reasons((select doc from _res where key = 'fri')), '{"lk2": "route_locked"}'::jsonb,
  'a visit whose crew has a published route is reported as route_locked');
insert into _tap (line) select is(pg_temp.stops('r-0605'), 'lk1', 'the published route is untouched');
insert into _tap (line) select is(
  (select doc ->> 'assigned' from _res where key = 'fri'), '1', 'other crews are still assigned on that day');
insert into _tap (line) select is(
  (select count(*) from public.route_stops where visit_id = pg_temp.id('lk2')), 0::bigint, 'the locked-out visit stays unrouted');

insert into _res select 'sat', public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-06');
set constraints all immediate;
insert into _tap (line) select is(
  (select doc ->> 'routes_created' from _res where key = 'sat'), '0', 'an existing draft route is reused, not duplicated');
insert into _tap (line) select is(
  (select count(*) from public.routes where route_date = '2026-06-06'), 1::bigint, 'still one route for the crew and date');
insert into _tap (line) select is(
  substr(pg_temp.stops('r-0606'), 1, 5), 'k1,k2', 'existing stops keep their positions');
insert into _tap (line) select is(
  (select array_agg(k order by k) from unnest(string_to_array(substr(pg_temp.stops('r-0606'), 7), ',')) k), array['k3', 'k4'],
  'new stops are appended after the existing ones');
insert into _tap (line) select is(
  (select array_agg(sequence order by sequence) from public.route_stops where route_id = pg_temp.id('r-0606')),
  array[1, 2, 3, 4], 'sequences continue after the existing stops');
insert into _tap (line) select is(
  (select is_locked::text || '/' || travel_distance_m from public.route_stops where route_id = pg_temp.id('r-0606') and sequence = 1),
  'true/123', 'a locked stop is not touched');
insert into _tap (line) select is(
  (select travel_distance_m from public.route_stops where route_id = pg_temp.id('r-0606') and sequence = 2),
  456, 'an existing stop is not touched');
insert into _tap (line) select is(
  (select travel_distance_m from public.route_stops s where s.route_id = pg_temp.id('r-0606') and s.sequence = 3),
  (select round(st_distance(a.location, b.location))::int
   from public.properties a, public.properties b, public.route_stops s
   where s.route_id = pg_temp.id('r-0606') and s.sequence = 3
     and a.id = pg_temp.id('p-n2') and b.id = (select property_id from public.visits where id = s.visit_id)),
  'the first new stop is measured from the last existing stop');

insert into _res select 'sun', public.generate_draft_routes(pg_temp.id('org-a'), '2026-06-07');
insert into _tap (line) select is(pg_temp.stops('r-0607'), 'o1', 'an optimized route accepts new stops');
insert into _tap (line) select is(
  (select status::text from public.routes where id = pg_temp.id('r-0607')), 'optimized', 'and keeps its status');

------------------------------------------------------------------------------
-- The cap: 501 eligible visits, 500 per call
------------------------------------------------------------------------------

insert into _res select 'cap1', public.generate_draft_routes(pg_temp.id('org-a'), '2026-07-01');
insert into _tap (line) select is(
  (select doc ->> 'assigned' || '/' || (doc ->> 'remaining') from _res where key = 'cap1'), '500/1',
  'one call places at most 500 visits and reports the rest');
insert into _res select 'cap2', public.generate_draft_routes(pg_temp.id('org-a'), '2026-07-01');
insert into _tap (line) select is(
  (select doc ->> 'assigned' || '/' || (doc ->> 'remaining') || '/' || (doc ->> 'routes_created') from _res where key = 'cap2'), '1/0/0',
  'running again places the remainder on the same route');
insert into _tap (line) select is(
  (select count(*) from public.route_stops rs join public.routes r on r.id = rs.route_id where r.route_date = '2026-07-01'),
  501::bigint, 'all 501 visits end up routed');

------------------------------------------------------------------------------
-- Cross-org isolation
------------------------------------------------------------------------------

select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select count(*) from public.route_stops where visit_id = pg_temp.id('vb')), 0::bigint,
  'org A''s run did not route org B''s visit');
insert into _tap (line) select is(
  (select count(*) from public.routes where organization_id = pg_temp.id('org-b')), 0::bigint,
  'org A''s run created nothing in org B');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d005","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _res select 'b', public.generate_draft_routes(pg_temp.id('org-b'), '2026-06-03');
insert into _tap (line) select is(
  (select doc - 'unassigned' from _res where key = 'b'), '{"assigned": 1, "routes_created": 1, "remaining": 0}'::jsonb,
  'org B''s owner builds org B''s route');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select r.organization_id = pg_temp.id('org-b') from public.route_stops rs join public.routes r on r.id = rs.route_id
   where rs.visit_id = pg_temp.id('vb')), true, 'org B''s stop is on org B''s route');
insert into _tap (line) select is(
  (select count(*) from public.route_stops rs join public.routes r on r.id = rs.route_id
   where r.organization_id = pg_temp.id('org-a') and r.route_date = '2026-06-03'), 9::bigint,
  'org B''s run did not touch org A''s routes');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
