-- pgTAP tests for 20261030200000_crew_lifecycle: disabling, the history
-- lookup, and permanently deleting a crew. Hermetic: its own orgs
-- ('pgtap-cl', 'pgtap-cl2').

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'cl-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'cl-dispatcher@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d3', 'cl-worker@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d4', 'cl2-owner@test.local', 'authenticated', 'authenticated');

insert into public.organizations (name, slug) values ('PgTap CL', 'pgtap-cl'), ('PgTap CL2', 'pgtap-cl2');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-cl';
insert into _ids select 'org2', id from public.organizations where slug = 'pgtap-cl2';
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000d1', 'admin', 'CL Manager'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000d2', 'dispatcher', 'CL Dispatcher'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000d3', 'worker', 'CL Walt'),
  ((select id from _ids where key = 'org2'), '00000000-0000-0000-0000-0000000000d4', 'owner', 'CL Other');
insert into _ids select 'walt', id from public.organization_members where display_name = 'CL Walt';

insert into public.crews (organization_id, name) values
  ((select id from _ids where key = 'org'), 'Oak'),
  ((select id from _ids where key = 'org'), 'Pine');
insert into _ids select 'oak', id from public.crews where name = 'Oak' and organization_id = (select id from _ids where key = 'org');
insert into _ids select 'pine', id from public.crews where name = 'Pine' and organization_id = (select id from _ids where key = 'org');
insert into public.crew_members (organization_id, crew_id, member_id)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'oak'), (select id from _ids where key = 'walt'));

-- Oak did a job five days ago: a completed visit on its route, with Walt's
-- time on it and his shift.
insert into public.clients (organization_id, display_name) values ((select id from _ids where key = 'org'), 'CL Client');
insert into public.properties (organization_id, client_id, address_line1, city)
select organization_id, id, '1 Main St', 'Edmonton' from public.clients where display_name = 'CL Client';
insert into public.jobs (organization_id, client_id, property_id, title, start_date, window_start, window_minutes)
select organization_id, client_id, id, 'Mow', current_date - 5, '08:00', 240
from public.properties where organization_id = (select id from _ids where key = 'org');
insert into _ids select 'visit', id from public.visits where organization_id = (select id from _ids where key = 'org');
update public.visits set status = 'completed' where id = (select id from _ids where key = 'visit');
insert into public.routes (organization_id, crew_id, route_date)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'oak'), current_date - 5);
insert into _ids select 'route', id from public.routes where crew_id = (select id from _ids where key = 'oak');
insert into public.route_stops (organization_id, route_id, visit_id, sequence)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'route'), (select id from _ids where key = 'visit'), 1);
insert into public.visit_time_entries (organization_id, visit_id, member_id, started_at, ended_at)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'visit'), (select id from _ids where key = 'walt'),
        now() - interval '5 days', now() - interval '5 days' + interval '2 hours');
insert into public.shifts (organization_id, member_id, route_id, clock_in, clock_out)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'walt'), (select id from _ids where key = 'route'),
        now() - interval '5 days' - interval '1 hour', now() - interval '5 days' + interval '6 hours');
insert into public.routes (organization_id, crew_id, route_date)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'oak'), current_date + 3);

-- History ------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select results_eq(
  $$select past_routes, upcoming_routes, completed_visits, last_route_date from public.crew_history((select id from _ids where key = 'oak'))$$,
  $$values (1, 1, 1, current_date - 5)$$,
  'office staff see what a crew has done');
insert into _tap (line) select results_eq(
  $$select past_routes, upcoming_routes, completed_visits from public.crew_history((select id from _ids where key = 'pine'))$$,
  $$values (0, 0, 0)$$,
  'a new crew has no history');

-- Disabling ----------------------------------------------------------------------------
update public.crews set disabled_at = now() where id = (select id from _ids where key = 'pine');
insert into _tap (line) select throws_ok(
  $$insert into public.routes (organization_id, crew_id, route_date)
    values ((select id from _ids where key = 'org'), (select id from _ids where key = 'pine'), current_date + 4)$$,
  '55000', null, 'a disabled crew can''t get new routes');
update public.crews set disabled_at = null where id = (select id from _ids where key = 'pine');
insert into _tap (line) select lives_ok(
  $$insert into public.routes (organization_id, crew_id, route_date)
    values ((select id from _ids where key = 'org'), (select id from _ids where key = 'pine'), current_date + 4)$$,
  'reactivating a crew lets it take routes again');

-- Deleting -----------------------------------------------------------------------------
insert into _tap (line) select throws_ok(
  $$select public.delete_crew((select id from _ids where key = 'oak'))$$,
  'P0002', null, 'a dispatcher can''t permanently delete a crew');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.delete_crew((select id from _ids where key = 'oak'))$$,
  'P0002', null, 'a contractor can''t delete a crew');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.delete_crew((select id from _ids where key = 'oak'))$$,
  'P0002', null, 'another company''s owner can''t delete a crew');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into _tap (line) select is(
  public.delete_crew((select id from _ids where key = 'oak')), 2, 'a manager deletes the crew and its two routes');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select count(*) from public.crews where id = (select id from _ids where key = 'oak')), 0::bigint, 'the crew is gone');
insert into _tap (line) select is(
  (select count(*) from public.crew_members where crew_id = (select id from _ids where key = 'oak')), 0::bigint,
  'its roster is gone');
insert into _tap (line) select results_eq(
  $$select status::text from public.visits where id = (select id from _ids where key = 'visit')$$,
  $$values ('completed')$$, 'the completed visit is kept');
insert into _tap (line) select is(
  (select count(*) from public.visit_time_entries where member_id = (select id from _ids where key = 'walt')), 1::bigint,
  'the worker''s time on the visit is kept');
insert into _tap (line) select results_eq(
  $$select route_id is null, clock_out - clock_in from public.shifts where member_id = (select id from _ids where key = 'walt')$$,
  $$values (true, interval '7 hours')$$, 'the worker''s shift keeps its hours, without the route');
insert into _tap (line) select is(
  (select count(*) from public.organization_members where id = (select id from _ids where key = 'walt')), 1::bigint,
  'the worker stays on the team');

-- Privileges -----------------------------------------------------------------------------
insert into _tap (line) select ok(
  not has_function_privilege('anon', 'public.delete_crew(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.crew_history(uuid)', 'execute'),
  'anon can''t call the crew functions');

insert into _tap (line) select * from finish();
select line from _tap order by n;

rollback;
