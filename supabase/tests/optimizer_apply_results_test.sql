-- pgTAP tests for the optimizer_apply_results migration. Hermetic: its own
-- orgs ('pgtap-opt-a', 'pgtap-opt-b') and users. See supabase/tests/README.md.
--
-- route_stops.sequence is deferrable initially deferred; the test rolls back,
-- so `set constraints all immediate` forces the check before asserting.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
create temp table _res (key text primary key, doc jsonb);
grant all on _tap, _tap_n_seq, _ids, _res to authenticated, anon, service_role;
select no_plan();

create function pg_temp.id(p_key text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from pg_temp._ids where key = p_key
$$;
create function pg_temp.keyof(p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select key from pg_temp._ids where id = p_id), '?')
$$;
-- 'v1,v2,...': the visit keys on a route in stop order. Reads as the owner.
create function pg_temp.stops(p_route_key text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(pg_temp.keyof(rs.visit_id), ',' order by rs.sequence), '')
  from public.route_stops rs where rs.route_id = (select id from pg_temp._ids where key = p_route_key)
$$;
-- A running run for a date, made as the owner of the test. Returns its id.
create function pg_temp.new_run(p_key text, p_org text, p_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  insert into public.optimization_runs (organization_id, route_date, provider, status, requested_by, started_at)
  values (pg_temp.id(p_org), p_date, 'vroom', 'running', null, now())
  returning id into v;
  insert into pg_temp._ids values (p_key, v);
  return v;
end;
$$;
-- One result stop: (stop key, sequence, arrival, departure, travel m, travel s).
create function pg_temp.rs(p_stop text, p_seq int, p_arr text, p_dep text, p_m int, p_s int)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('stop_id', pg_temp.id(p_stop), 'sequence', p_seq,
    'planned_arrival', p_arr, 'planned_departure', p_dep,
    'travel_distance_m', p_m, 'travel_duration_s', p_s)
$$;
create function pg_temp.rr(p_route text, p_stops jsonb, p_polyline text default '_p~iF~ps|U')
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('route_id', pg_temp.id(p_route),
    'planned_start', '2026-06-10T14:00:00Z', 'planned_end', '2026-06-10T18:00:00Z',
    'total_distance_m', 12345, 'total_duration_s', 9999, 'polyline', p_polyline,
    'stops', p_stops)
$$;
grant execute on function pg_temp.id(text), pg_temp.keyof(uuid), pg_temp.stops(text),
  pg_temp.new_run(text, text, date), pg_temp.rs(text, int, text, text, int, int),
  pg_temp.rr(text, jsonb, text)
  to authenticated, anon, service_role;

------------------------------------------------------------------------------
-- Fixtures. Org A: owner d101, admin d102, dispatcher d103, worker d104.
-- Org B: owner d105. Non-member d106.
------------------------------------------------------------------------------

insert into auth.users (id, email, aud, role)
select ('00000000-0000-0000-0000-00000000d10' || n)::uuid,
       'opt-' || n || '@test.local', 'authenticated', 'authenticated'
from generate_series(1, 6) n;
insert into public.organizations (name, slug) values ('OPT A', 'pgtap-opt-a'), ('OPT B', 'pgtap-opt-b');
insert into _ids select 'org-a', id from public.organizations where slug = 'pgtap-opt-a';
insert into _ids select 'org-b', id from public.organizations where slug = 'pgtap-opt-b';
insert into public.organization_members (organization_id, user_id, role, display_name)
select pg_temp.id(org), ('00000000-0000-0000-0000-00000000d10' || n)::uuid, role::public.org_role, 'opt-' || role
from (values (1, 'owner', 'org-a'), (2, 'admin', 'org-a'), (3, 'dispatcher', 'org-a'),
             (4, 'worker', 'org-a'), (5, 'owner', 'org-b')) r(n, role, org);

insert into public.crews (organization_id, name, default_start_location, max_work_minutes) values
  (pg_temp.id('org-a'), 'North', 'SRID=4326;POINT(-114.10 51.00)', 480),
  (pg_temp.id('org-a'), 'South', 'SRID=4326;POINT(-114.10 50.90)', null),
  (pg_temp.id('org-b'), 'B crew', null, null);
insert into _ids select case name when 'North' then 'crew-n' when 'South' then 'crew-s' else 'crew-b' end, id
from public.crews where organization_id in (pg_temp.id('org-a'), pg_temp.id('org-b'));

insert into public.clients (organization_id, display_name) values (pg_temp.id('org-a'), 'Client A'), (pg_temp.id('org-b'), 'Client B');
insert into _ids select 'client-a', id from public.clients where organization_id = pg_temp.id('org-a');
insert into _ids select 'client-b', id from public.clients where organization_id = pg_temp.id('org-b');

insert into public.properties (organization_id, client_id, address_line1, city, location)
select pg_temp.id(p.org), pg_temp.id(p.client), p.key, 'Calgary', p.loc::geography
from (values
  ('pa', 'org-a', 'client-a', 'SRID=4326;POINT(-114.10 51.05)'),
  ('pb', 'org-a', 'client-a', 'SRID=4326;POINT(-114.05 51.05)'),
  ('pc', 'org-a', 'client-a', 'SRID=4326;POINT(-114.15 51.15)'),
  ('pnoloc', 'org-a', 'client-a', null),
  ('pz', 'org-b', 'client-b', 'SRID=4326;POINT(-114.10 51.05)')
) p(key, org, client, loc);

-- One-off jobs make one scheduled visit each: (visit key, property, date).
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select pr.organization_id, pr.client_id, pr.id, v.key, v.d::date
from (values
  ('a1', 'pa', '2026-06-10'), ('a2', 'pb', '2026-06-10'), ('a3', 'pc', '2026-06-10'),
  ('s1', 'pa', '2026-06-10'),
  ('c1', 'pa', '2026-06-11'), ('c2', 'pb', '2026-06-11'), ('c3', 'pc', '2026-06-11'),
  ('d1', 'pa', '2026-06-12'), ('d2', 'pb', '2026-06-12'),
  ('e1', 'pa', '2026-06-13'), ('e2', 'pb', '2026-06-13'),
  ('f1', 'pa', '2026-06-14'), ('f2', 'pb', '2026-06-14'),
  ('n1', 'pnoloc', '2026-06-10'),
  ('x1', 'pa', '2026-06-15')
) v(key, prop, d)
join public.properties pr on pr.address_line1 = v.prop and pr.organization_id = pg_temp.id('org-a');
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select pr.organization_id, pr.client_id, pr.id, 'zb1', '2026-06-10'::date
from public.properties pr where pr.address_line1 = 'pz' and pr.organization_id = pg_temp.id('org-b');
insert into _ids select j.title, v.id from public.visits v
join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
where j.organization_id in (pg_temp.id('org-a'), pg_temp.id('org-b'));
-- A time window and duration for the inputs test.
update public.visits set window_start = '2026-06-10T15:00:00Z', window_end = '2026-06-10T17:00:00Z',
  duration_minutes = 45 where id = pg_temp.id('a1');

-- Routes. 06-10: North draft (a1, a2 locked, a3, n1 with no location), South
-- published (s1). 06-11 to 06-14: North drafts. 06-15: South optimized (x1).
insert into public.routes (organization_id, crew_id, route_date, status) values
  (pg_temp.id('org-a'), pg_temp.id('crew-n'), '2026-06-10', 'draft'),
  (pg_temp.id('org-a'), pg_temp.id('crew-s'), '2026-06-10', 'published'),
  (pg_temp.id('org-a'), pg_temp.id('crew-n'), '2026-06-11', 'draft'),
  (pg_temp.id('org-a'), pg_temp.id('crew-n'), '2026-06-12', 'draft'),
  (pg_temp.id('org-a'), pg_temp.id('crew-n'), '2026-06-13', 'draft'),
  (pg_temp.id('org-a'), pg_temp.id('crew-n'), '2026-06-14', 'draft'),
  (pg_temp.id('org-a'), pg_temp.id('crew-s'), '2026-06-15', 'optimized'),
  (pg_temp.id('org-b'), pg_temp.id('crew-b'), '2026-06-10', 'draft');
insert into _ids select 'r10', id from public.routes where route_date = '2026-06-10' and crew_id = pg_temp.id('crew-n');
insert into _ids select 'r10s', id from public.routes where route_date = '2026-06-10' and crew_id = pg_temp.id('crew-s');
insert into _ids select 'r11', id from public.routes where route_date = '2026-06-11';
insert into _ids select 'r12', id from public.routes where route_date = '2026-06-12';
insert into _ids select 'r13', id from public.routes where route_date = '2026-06-13';
insert into _ids select 'r14', id from public.routes where route_date = '2026-06-14';
insert into _ids select 'r15', id from public.routes where route_date = '2026-06-15';
insert into _ids select 'rb', id from public.routes where organization_id = pg_temp.id('org-b');

insert into public.route_stops (organization_id, route_id, visit_id, sequence, is_locked) values
  (pg_temp.id('org-a'), pg_temp.id('r10'), pg_temp.id('a1'), 1, false),
  (pg_temp.id('org-a'), pg_temp.id('r10'), pg_temp.id('a2'), 2, true),
  (pg_temp.id('org-a'), pg_temp.id('r10'), pg_temp.id('a3'), 3, false),
  (pg_temp.id('org-a'), pg_temp.id('r10'), pg_temp.id('n1'), 4, false),
  (pg_temp.id('org-a'), pg_temp.id('r10s'), pg_temp.id('s1'), 1, false),
  (pg_temp.id('org-a'), pg_temp.id('r11'), pg_temp.id('c1'), 1, false),
  (pg_temp.id('org-a'), pg_temp.id('r11'), pg_temp.id('c2'), 2, false),
  (pg_temp.id('org-a'), pg_temp.id('r11'), pg_temp.id('c3'), 3, false),
  (pg_temp.id('org-a'), pg_temp.id('r12'), pg_temp.id('d1'), 1, false),
  (pg_temp.id('org-a'), pg_temp.id('r12'), pg_temp.id('d2'), 2, false),
  (pg_temp.id('org-a'), pg_temp.id('r13'), pg_temp.id('e1'), 1, true),
  (pg_temp.id('org-a'), pg_temp.id('r13'), pg_temp.id('e2'), 2, false),
  (pg_temp.id('org-a'), pg_temp.id('r14'), pg_temp.id('f1'), 1, false),
  (pg_temp.id('org-a'), pg_temp.id('r14'), pg_temp.id('f2'), 2, false),
  (pg_temp.id('org-a'), pg_temp.id('r15'), pg_temp.id('x1'), 1, false);
insert into _ids select 's-' || pg_temp.keyof(visit_id), id from public.route_stops;

------------------------------------------------------------------------------
-- optimizer_inputs: role gating
------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d104","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.optimizer_inputs(pg_temp.id('org-a'), '2026-06-10')$$,
  '42501', 'not allowed to optimize routes', 'a worker can''t read optimizer inputs');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d106","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.optimizer_inputs(pg_temp.id('org-a'), '2026-06-10')$$,
  '42501', 'not allowed to optimize routes', 'a non-member can''t read optimizer inputs');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d103","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.optimizer_inputs(pg_temp.id('org-b'), '2026-06-10')$$,
  '42501', 'not allowed to optimize routes', 'another org''s dispatcher is refused');
insert into _tap (line) select throws_ok(
  $$select public.optimizer_inputs(null, '2026-06-10')$$,
  '22023', 'organization and date are required', 'a null org is refused');
select set_config('role', 'anon', true);
insert into _tap (line) select throws_ok(
  $$select public.optimizer_inputs(pg_temp.id('org-a'), '2026-06-10')$$,
  '42501', null, 'anon can''t call optimizer_inputs');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.optimizer_inputs(pg_temp.id('org-a'), '2026-06-10')$$,
  '42501', null, 'service_role can''t call optimizer_inputs');

------------------------------------------------------------------------------
-- optimizer_inputs: content
------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d103","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _res select 'in1', public.optimizer_inputs(pg_temp.id('org-a'), '2026-06-10');
insert into _tap (line) select is(
  (select jsonb_array_length(doc -> 'routes') from _res where key = 'in1'), 1,
  'only the open route is returned: the published one and org B''s are not');
insert into _tap (line) select is(
  (select doc -> 'routes' -> 0 ->> 'route_id' from _res where key = 'in1'), pg_temp.id('r10')::text,
  'it is the draft route');
insert into _tap (line) select is(
  (select doc -> 'routes' -> 0 -> 'start' from _res where key = 'in1'),
  '{"lon": -114.1, "lat": 51}'::jsonb, 'the depot comes back as lon and lat');
insert into _tap (line) select is(
  (select doc -> 'routes' -> 0 ->> 'max_work_minutes' from _res where key = 'in1'), '480',
  'the crew''s max work minutes come with it');
insert into _tap (line) select is(
  (select jsonb_agg(s ->> 'sequence' order by (s ->> 'sequence')::int) from _res, jsonb_array_elements(doc -> 'routes' -> 0 -> 'stops') s where key = 'in1'),
  '["1","2","3","4"]'::jsonb, 'stops come in sequence');
insert into _tap (line) select is(
  (select doc -> 'routes' -> 0 -> 'stops' -> 0 from _res where key = 'in1') - 'stop_id' - 'visit_id',
  '{"lat": 51.05, "lon": -114.1, "sequence": 1, "is_locked": false, "window_end": "2026-06-10T17:00:00+00:00",
    "window_start": "2026-06-10T15:00:00+00:00", "duration_minutes": 45}'::jsonb,
  'a stop carries its window, duration and property location');
insert into _tap (line) select is(
  (select doc -> 'routes' -> 0 -> 'stops' -> 1 ->> 'is_locked' from _res where key = 'in1'), 'true',
  'a locked stop is flagged');
insert into _tap (line) select ok(
  (select doc -> 'routes' -> 0 -> 'stops' -> 3 -> 'lon' from _res where key = 'in1') = 'null'::jsonb,
  'a property with no location has null coordinates');

insert into _res select 'in2', public.optimizer_inputs(pg_temp.id('org-a'), '2026-06-10',
  array[pg_temp.id('r10s'), pg_temp.id('r11'), pg_temp.id('rb'), gen_random_uuid()]);
insert into _tap (line) select is(
  (select jsonb_array_length(doc -> 'routes') from _res where key = 'in2'), 0,
  'asking for specific routes returns none of those that are not editable on the date');
insert into _tap (line) select is(
  (select jsonb_agg(e ->> 'reason' order by e ->> 'reason') from _res, jsonb_array_elements(doc -> 'skipped') e where key = 'in2'),
  '["not_editable", "not_found", "not_found", "not_found"]'::jsonb,
  'a published route is not_editable; another date, another org and an unknown id are not_found');
insert into _res select 'in3', public.optimizer_inputs(pg_temp.id('org-a'), '2026-06-10', array[pg_temp.id('r10')]);
insert into _tap (line) select is(
  (select jsonb_array_length(doc -> 'routes') from _res where key = 'in3'), 1, 'a requested editable route is returned');
insert into _res select 'in4', public.optimizer_inputs(pg_temp.id('org-a'), '2026-06-15');
insert into _tap (line) select is(
  (select doc -> 'routes' -> 0 ->> 'status' from _res where key = 'in4'), 'optimized',
  'an optimized route is returned too');

------------------------------------------------------------------------------
-- apply_optimization_results: who can call it
------------------------------------------------------------------------------

select set_config('role', 'postgres', true);
select pg_temp.new_run('run-a', 'org-a', '2026-06-10');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d101","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-a'), pg_temp.id('run-a'), '[]'::jsonb)$$,
  '42501', null, 'even an owner can''t call apply_optimization_results from the API');
select set_config('role', 'anon', true);
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-a'), pg_temp.id('run-a'), '[]'::jsonb)$$,
  '42501', null, 'anon can''t call apply_optimization_results');

------------------------------------------------------------------------------
-- apply_optimization_results: the happy path with a locked stop
------------------------------------------------------------------------------

select set_config('role', 'service_role', true);
insert into _res select 'apply1', public.apply_optimization_results(
  pg_temp.id('org-a'), pg_temp.id('run-a'),
  jsonb_build_array(
    -- a3 first, locked a2 stays second, a1 third, n1 (no location) last.
    pg_temp.rr('r10', jsonb_build_array(
      pg_temp.rs('s-a3', 1, '2026-06-10T14:10:00Z', '2026-06-10T14:40:00Z', 4000, 600),
      pg_temp.rs('s-a2', 2, '2026-06-10T14:50:00Z', '2026-06-10T15:20:00Z', 2500, 500),
      pg_temp.rs('s-a1', 3, '2026-06-10T15:30:00Z', '2026-06-10T16:15:00Z', 1800, 600),
      jsonb_build_object('stop_id', pg_temp.id('s-n1'), 'sequence', 4)))),
  array[pg_temp.id('n1')]);
set constraints all immediate;
insert into _tap (line) select is(
  (select doc from _res where key = 'apply1'),
  jsonb_build_object('applied', jsonb_build_array(pg_temp.id('r10')), 'skipped', '[]'::jsonb),
  'the result is applied');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(pg_temp.stops('r10'), 'a3,a2,a1,n1', 'stops are renumbered; the locked stop stays second');
insert into _tap (line) select is(
  (select planned_arrival from public.route_stops where id = pg_temp.id('s-a1')), '2026-06-10T15:30:00Z'::timestamptz,
  'planned arrival is stored');
insert into _tap (line) select is(
  (select travel_duration_s from public.route_stops where id = pg_temp.id('s-a3')), 600, 'travel duration is stored');
insert into _tap (line) select is(
  (select planned_arrival from public.route_stops where id = pg_temp.id('s-n1')), null,
  'a stop the solver did not place has no planned times');
insert into _tap (line) select is(
  (select (status::text, total_distance_m, total_duration_s, polyline, optimized_stop_count, optimization_run_id = pg_temp.id('run-a'))
   from public.routes where id = pg_temp.id('r10'))::text,
  '(optimized,12345,9999,_p~iF~ps|U,4,t)', 'the route is optimized with totals, polyline, count and run');
insert into _tap (line) select is(
  (select planned_end from public.routes where id = pg_temp.id('r10')), '2026-06-10T18:00:00Z'::timestamptz,
  'planned end is stored');
insert into _tap (line) select is(
  (select status::text from public.optimization_runs where id = pg_temp.id('run-a')), 'succeeded', 'the run succeeded');
insert into _tap (line) select is(
  (select unassigned_visit_ids from public.optimization_runs where id = pg_temp.id('run-a')),
  array[pg_temp.id('n1')], 'and lists the unassigned visit');
insert into _tap (line) select ok(
  (select finished_at is not null and error is null from public.optimization_runs where id = pg_temp.id('run-a')),
  'with a finish time and no error');

------------------------------------------------------------------------------
-- A finished run can't be applied again
------------------------------------------------------------------------------

select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-a'), pg_temp.id('run-a'), '[]'::jsonb)$$,
  '55000', 'that optimization run has already finished', 'a finished run is not applied twice');

------------------------------------------------------------------------------
-- Routes that must not change
------------------------------------------------------------------------------

select set_config('role', 'postgres', true);
select pg_temp.new_run('run-b', 'org-a', '2026-06-10');
select set_config('role', 'service_role', true);
insert into _res select 'apply2', public.apply_optimization_results(
  pg_temp.id('org-a'), pg_temp.id('run-b'),
  jsonb_build_array(
    pg_temp.rr('r10s', jsonb_build_array(pg_temp.rs('s-s1', 1, '2026-06-10T14:10:00Z', '2026-06-10T14:40:00Z', 1, 1))),
    pg_temp.rr('rb', jsonb_build_array(pg_temp.rs('s-s1', 1, '2026-06-10T14:10:00Z', '2026-06-10T14:40:00Z', 1, 1))),
    pg_temp.rr('r11', jsonb_build_array(pg_temp.rs('s-c1', 1, '2026-06-10T14:10:00Z', '2026-06-10T14:40:00Z', 1, 1)))),
  '{}');
insert into _tap (line) select is(
  (select doc -> 'applied' from _res where key = 'apply2'), '[]'::jsonb, 'nothing is applied');
insert into _tap (line) select is(
  (select jsonb_object_agg(pg_temp.keyof((e ->> 'route_id')::uuid), e ->> 'reason') from _res, jsonb_array_elements(doc -> 'skipped') e where key = 'apply2'),
  '{"r10s": "not_editable", "rb": "not_found", "r11": "not_found"}'::jsonb,
  'a published route, another org''s route and another date''s route are skipped');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.routes where id = pg_temp.id('r10s')), 'published', 'the published route is untouched');
insert into _tap (line) select ok(
  (select optimized_stop_count is null and total_distance_m is null from public.routes where id = pg_temp.id('r10s')),
  'and has no optimization figures');
insert into _tap (line) select is(
  (select status::text from public.routes where id = pg_temp.id('rb')), 'draft', 'org B''s route is untouched');
insert into _tap (line) select is(
  (select planned_arrival from public.route_stops where id = pg_temp.id('s-c1')), null, 'the other date''s stop is untouched');
insert into _tap (line) select is(
  (select status::text from public.optimization_runs where id = pg_temp.id('run-b')), 'failed',
  'a run where every route was skipped fails');
insert into _tap (line) select ok(
  (select error like 'Every route changed%' from public.optimization_runs where id = pg_temp.id('run-b')),
  'with a clear note');

------------------------------------------------------------------------------
-- Run lookups are scoped to the org
------------------------------------------------------------------------------

select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-b'), pg_temp.id('run-a'), '[]'::jsonb)$$,
  'P0002', 'optimization run not found', 'a run is not found under another org');
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-a'), gen_random_uuid(), '[]'::jsonb)$$,
  'P0002', 'optimization run not found', 'an unknown run is not found');
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-a'), pg_temp.id('run-b'), '{}'::jsonb)$$,
  '22023', 'organization, run and routes are required', 'routes must be an array');

------------------------------------------------------------------------------
-- Stale stop sets, moved locked stops and bad numbering
------------------------------------------------------------------------------

select set_config('role', 'postgres', true);
select pg_temp.new_run('run-c', 'org-a', '2026-06-11');
select set_config('role', 'service_role', true);
-- c3 is missing from the result: the route no longer matches what the solver saw.
insert into _res select 'apply3', public.apply_optimization_results(
  pg_temp.id('org-a'), pg_temp.id('run-c'),
  jsonb_build_array(pg_temp.rr('r11', jsonb_build_array(
    pg_temp.rs('s-c2', 1, '2026-06-11T14:10:00Z', '2026-06-11T14:40:00Z', 1, 1),
    pg_temp.rs('s-c1', 2, '2026-06-11T14:10:00Z', '2026-06-11T14:40:00Z', 1, 1)))),
  '{}');
insert into _tap (line) select is(
  (select doc -> 'skipped' -> 0 ->> 'reason' from _res where key = 'apply3'), 'changed',
  'a result that does not name every current stop is skipped as changed');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(pg_temp.stops('r11'), 'c1,c2,c3', 'a skipped route keeps its order');

-- A stop from another route in the result is "changed" too.
select pg_temp.new_run('run-d', 'org-a', '2026-06-12');
select set_config('role', 'service_role', true);
insert into _res select 'apply4', public.apply_optimization_results(
  pg_temp.id('org-a'), pg_temp.id('run-d'),
  jsonb_build_array(pg_temp.rr('r12', jsonb_build_array(
    pg_temp.rs('s-d1', 1, '2026-06-12T14:10:00Z', '2026-06-12T14:40:00Z', 1, 1),
    pg_temp.rs('s-c1', 2, '2026-06-12T14:10:00Z', '2026-06-12T14:40:00Z', 1, 1)))),
  '{}');
insert into _tap (line) select is(
  (select doc -> 'skipped' -> 0 ->> 'reason' from _res where key = 'apply4'), 'changed',
  'a stop from another route is rejected, not moved');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select route_id from public.route_stops where id = pg_temp.id('s-c1')), pg_temp.id('r11'),
  'the other route''s stop did not move');

-- Locked stop moved.
select pg_temp.new_run('run-e', 'org-a', '2026-06-13');
select set_config('role', 'service_role', true);
insert into _res select 'apply5', public.apply_optimization_results(
  pg_temp.id('org-a'), pg_temp.id('run-e'),
  jsonb_build_array(pg_temp.rr('r13', jsonb_build_array(
    pg_temp.rs('s-e2', 1, '2026-06-13T14:10:00Z', '2026-06-13T14:40:00Z', 1, 1),
    pg_temp.rs('s-e1', 2, '2026-06-13T14:50:00Z', '2026-06-13T15:40:00Z', 1, 1)))),
  '{}');
insert into _tap (line) select is(
  (select doc -> 'skipped' -> 0 ->> 'reason' from _res where key = 'apply5'), 'locked_moved',
  'a result that moves a locked stop is skipped');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(pg_temp.stops('r13'), 'e1,e2', 'the locked stop did not move');

-- Bad sequences raise.
select pg_temp.new_run('run-f', 'org-a', '2026-06-14');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-a'), pg_temp.id('run-f'),
    jsonb_build_array(pg_temp.rr('r14', jsonb_build_array(
      pg_temp.rs('s-f1', 1, '2026-06-14T14:10:00Z', '2026-06-14T14:40:00Z', 1, 1),
      pg_temp.rs('s-f2', 1, '2026-06-14T14:50:00Z', '2026-06-14T15:40:00Z', 1, 1)))), '{}')$$,
  '22023', 'stop sequences must be 1..n', 'duplicate sequences are refused');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.optimization_runs where id = pg_temp.id('run-f')), 'running',
  'a refused result leaves the run running (the runner then fails it)');

-- A departure before an arrival violates the table check; nothing is written.
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-a'), pg_temp.id('run-f'),
    jsonb_build_array(pg_temp.rr('r14', jsonb_build_array(
      pg_temp.rs('s-f2', 1, '2026-06-14T15:10:00Z', '2026-06-14T14:40:00Z', 1, 1),
      pg_temp.rs('s-f1', 2, '2026-06-14T14:50:00Z', '2026-06-14T15:40:00Z', 1, 1)))), '{}')$$,
  '23514', null, 'a departure before the arrival is refused by the table check');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(pg_temp.stops('r14'), 'f1,f2', 'and the route keeps its order');

-- Unassigned ids must belong to the org (existing trigger).
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.apply_optimization_results(pg_temp.id('org-a'), pg_temp.id('run-f'),
    jsonb_build_array(pg_temp.rr('r14', jsonb_build_array(
      pg_temp.rs('s-f2', 1, '2026-06-14T14:10:00Z', '2026-06-14T14:40:00Z', 1, 1),
      pg_temp.rs('s-f1', 2, '2026-06-14T14:50:00Z', '2026-06-14T15:40:00Z', 1, 1)))),
    array[pg_temp.id('zb1')])$$,
  '23503', null, 'another org''s visit can''t be listed as unassigned');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(pg_temp.stops('r14'), 'f1,f2', 'and nothing was written');

-- An optimized route can be optimized again.
select pg_temp.new_run('run-g', 'org-a', '2026-06-15');
select set_config('role', 'service_role', true);
insert into _res select 'apply6', public.apply_optimization_results(
  pg_temp.id('org-a'), pg_temp.id('run-g'),
  jsonb_build_array(pg_temp.rr('r15', jsonb_build_array(
    pg_temp.rs('s-x1', 1, '2026-06-15T14:10:00Z', '2026-06-15T14:40:00Z', 1, 1)))), '{}');
insert into _tap (line) select is(
  (select doc -> 'applied' from _res where key = 'apply6'), jsonb_build_array(pg_temp.id('r15')),
  'an optimized route can be optimized again');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select polyline from public.routes where id = pg_temp.id('r15')), '_p~iF~ps|U', 'and gets the new polyline');

------------------------------------------------------------------------------
-- One active run per organization and date
------------------------------------------------------------------------------

select pg_temp.new_run('run-h', 'org-a', '2026-06-20');
insert into _tap (line) select throws_ok(
  $$select pg_temp.new_run('run-i', 'org-a', '2026-06-20')$$,
  '23505', null, 'a second active run for the same org and date is refused');
insert into _tap (line) select lives_ok(
  $$select pg_temp.new_run('run-j', 'org-b', '2026-06-20')$$, 'another org can run the same date');
insert into _tap (line) select lives_ok(
  $$select pg_temp.new_run('run-k', 'org-a', '2026-06-21')$$, 'another date is fine');
update public.optimization_runs set status = 'failed', finished_at = now() where id = pg_temp.id('run-h');
insert into _tap (line) select lives_ok(
  $$select pg_temp.new_run('run-l', 'org-a', '2026-06-20')$$, 'once the first run finishes, a new one can start');

------------------------------------------------------------------------------
-- Payloads stay service-role only
------------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000d101","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select * from public.optimization_run_payloads$$, '42501', null, 'staff can''t read run payloads');
insert into _tap (line) select ok(
  (select count(*) from public.optimization_runs) > 0, 'staff can read runs');
select set_config('role', 'postgres', true);

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
