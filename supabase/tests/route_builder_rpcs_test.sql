-- pgTAP tests for the route_builder_rpcs migration. Hermetic: its own orgs
-- ('pgtap-rb-e', 'pgtap-rb-f') and users. See supabase/tests/README.md.
--
-- route_stops.sequence is deferrable initially deferred and the test rolls
-- back, so `set constraints all immediate` forces the check before asserting
-- on an order.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;

select no_plan();

-- Fixtures (as postgres) ------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'pgtap-rb-disp@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'pgtap-rb-worker@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'pgtap-rb-other@test.local', 'authenticated', 'authenticated');

insert into public.organizations (name, slug) values ('PgTap RB E', 'pgtap-rb-e'), ('PgTap RB F', 'pgtap-rb-f');
insert into _ids select slug, id from public.organizations where slug in ('pgtap-rb-e', 'pgtap-rb-f');

insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'pgtap-rb-e'), '00000000-0000-0000-0000-0000000000e1', 'dispatcher', 'Disp'),
  ((select id from _ids where key = 'pgtap-rb-e'), '00000000-0000-0000-0000-0000000000e2', 'worker', 'Wrk'),
  ((select id from _ids where key = 'pgtap-rb-f'), '00000000-0000-0000-0000-0000000000e3', 'dispatcher', 'Other');
insert into _ids select 'm-' || lower(display_name), id from public.organization_members
where organization_id in (select id from _ids where key in ('pgtap-rb-e', 'pgtap-rb-f'));

insert into public.crews (organization_id, name, archived_at) values
  ((select id from _ids where key = 'pgtap-rb-e'), 'E one', null),
  ((select id from _ids where key = 'pgtap-rb-e'), 'E two', null),
  ((select id from _ids where key = 'pgtap-rb-e'), 'E three', null),
  ((select id from _ids where key = 'pgtap-rb-e'), 'E gone', now()),
  ((select id from _ids where key = 'pgtap-rb-f'), 'F one', null);
insert into _ids select 'crew-' || replace(lower(name), ' ', ''), id from public.crews
where organization_id in (select id from _ids where key in ('pgtap-rb-e', 'pgtap-rb-f'));

-- E one's default roster: the dispatcher's member row (any active member will do).
insert into public.crew_members (organization_id, crew_id, member_id) values
  ((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'crew-eone'), (select id from _ids where key = 'm-wrk')),
  ((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'crew-etwo'), (select id from _ids where key = 'm-disp'));

insert into public.clients (organization_id, display_name) values
  ((select id from _ids where key = 'pgtap-rb-e'), 'Jane E'),
  ((select id from _ids where key = 'pgtap-rb-f'), 'Fred F');
insert into public.properties (organization_id, client_id, address_line1, city)
select organization_id, id, '1 Main St', 'Calgary' from public.clients
where organization_id in (select id from _ids where key in ('pgtap-rb-e', 'pgtap-rb-f'));

-- One-off jobs create one scheduled visit each. v1..v4 are on 2026-06-03, v5 on 2026-06-04.
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select p.organization_id, p.client_id, p.id, t.title, t.d::date
from public.properties p
join (values ('v1', '2026-06-03'), ('v2', '2026-06-03'), ('v3', '2026-06-03'), ('v4', '2026-06-03'), ('v5', '2026-06-04')) t(title, d)
  on p.organization_id = (select id from _ids where key = 'pgtap-rb-e');
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select p.organization_id, p.client_id, p.id, 'vf', '2026-06-03'::date
from public.properties p where p.organization_id = (select id from _ids where key = 'pgtap-rb-f');
insert into _ids select j.title, v.id from public.visits v
join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
where j.organization_id in (select id from _ids where key in ('pgtap-rb-e', 'pgtap-rb-f'));

-- Dispatcher of org E -----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

-- create_route ------------------------------------------------------------------
insert into _ids select 'r1', public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-03', (select id from _ids where key = 'crew-eone'));
insert into _tap (line) select is(
  (select status::text from public.routes where id = (select id from _ids where key = 'r1')), 'draft',
  'create_route makes a draft route');
insert into _tap (line) select is(
  (select count(*) from public.route_members where route_id = (select id from _ids where key = 'r1')), 1::bigint,
  'create_route seeds the roster from the crew');
insert into _tap (line) select throws_ok(
  $$select public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-03', (select id from _ids where key = 'crew-eone'))$$,
  '23505', 'that crew already has a route on this date', 'a crew gets one route per date');
insert into _tap (line) select throws_ok(
  $$select public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-03', (select id from _ids where key = 'crew-egone'))$$,
  'P0002', 'crew not found', 'an archived crew can''t be given a route');
insert into _tap (line) select throws_ok(
  $$select public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-03', (select id from _ids where key = 'crew-fone'))$$,
  'P0002', 'crew not found', 'another organization''s crew is not found');
insert into _tap (line) select throws_ok(
  $$select public.create_route((select id from _ids where key = 'pgtap-rb-f'), '2026-06-03', (select id from _ids where key = 'crew-fone'))$$,
  'P0002', 'crew not found', 'a non-member can''t see another organization''s crews, so can''t create a route there');

-- add_route_stop ------------------------------------------------------------------
insert into _ids select 's1', public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), (select id from _ids where key = 'v1'));
insert into _ids select 's2', public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), (select id from _ids where key = 'v2'));
insert into _ids select 's3', public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), (select id from _ids where key = 'v3'), 1);
set constraints all immediate;
insert into _tap (line) select is(
  (select string_agg(id::text, ',' order by sequence) from public.route_stops where route_id = (select id from _ids where key = 'r1')),
  (select string_agg(id::text, ',') from (select id from _ids where key = 's3' union all select id from _ids where key = 's1' union all select id from _ids where key = 's2') x),
  'add_route_stop appends by default and inserts at a position, shifting the rest');
set constraints all deferred;
insert into _tap (line) select throws_ok(
  $$select public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), (select id from _ids where key = 'v1'))$$,
  '23505', 'that visit is already on a route', 'a visit can only be on one route');
insert into _tap (line) select throws_ok(
  $$select public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), (select id from _ids where key = 'v5'))$$,
  '23514', 'a visit can only be routed on its scheduled date', 'the visit''s date must match the route''s');
insert into _tap (line) select throws_ok(
  $$select public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), (select id from _ids where key = 'vf'))$$,
  'P0002', 'visit not found', 'another organization''s visit is not found');
insert into _tap (line) select throws_ok(
  $$select public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), '00000000-0000-0000-0000-00000000ffff', (select id from _ids where key = 'v4'))$$,
  'P0002', 'route not found', 'an unknown route is not found');

-- move_route_stop -----------------------------------------------------------------
insert into _ids select 'r2', public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-03', (select id from _ids where key = 'crew-etwo'));
-- r1 is now s3, s1, s2. Move s1 to r2 at position 1.
select public.move_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's1'), (select id from _ids where key = 'r2'), 1);
set constraints all immediate;
insert into _tap (line) select is(
  (select string_agg(id::text || ':' || sequence, ',' order by sequence) from public.route_stops where route_id = (select id from _ids where key = 'r1')),
  (select (select id from _ids where key = 's3') || ':1,' || (select id from _ids where key = 's2') || ':2'),
  'moving a stop to another route closes the gap on the source');
insert into _tap (line) select is(
  (select string_agg(id::text || ':' || sequence, ',' order by sequence) from public.route_stops where route_id = (select id from _ids where key = 'r2')),
  (select (select id from _ids where key = 's1') || ':1'),
  'moving a stop to another route lands it at the position');
set constraints all deferred;
-- Within a route: move s2 (r1 position 2) to position 1.
select public.move_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's2'), (select id from _ids where key = 'r1'), 1);
set constraints all immediate;
insert into _tap (line) select is(
  (select string_agg(id::text || ':' || sequence, ',' order by sequence) from public.route_stops where route_id = (select id from _ids where key = 'r1')),
  (select (select id from _ids where key = 's2') || ':1,' || (select id from _ids where key = 's3') || ':2'),
  'moving a stop within its route reorders it');
set constraints all deferred;
-- Position past the end clamps.
select public.move_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's2'), (select id from _ids where key = 'r1'), 99);
set constraints all immediate;
insert into _tap (line) select is(
  (select sequence from public.route_stops where id = (select id from _ids where key = 's2')), 2,
  'a position past the end clamps to the last slot');
set constraints all deferred;

-- A route for another date can't take the stop (date guard / date check).
insert into _ids select 'r3', public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-04', (select id from _ids where key = 'crew-eone'));
insert into _tap (line) select throws_ok(
  $$select public.move_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's2'), (select id from _ids where key = 'r3'), 1)$$,
  '23514', null, 'a stop can''t move to a route on another date');
insert into _tap (line) select throws_ok(
  $$select public.move_route_stop((select id from _ids where key = 'pgtap-rb-e'), '00000000-0000-0000-0000-00000000ffff', (select id from _ids where key = 'r1'), 1)$$,
  'P0002', 'stop not found', 'an unknown stop is not found');

-- reorder_route_stops ---------------------------------------------------------------
select public.reorder_route_stops((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'),
  array[(select id from _ids where key = 's3'), (select id from _ids where key = 's2')]);
set constraints all immediate;
insert into _tap (line) select is(
  (select string_agg(id::text, ',' order by sequence) from public.route_stops where route_id = (select id from _ids where key = 'r1')),
  (select (select id from _ids where key = 's3') || ',' || (select id from _ids where key = 's2')),
  'reorder_route_stops applies the given order');
set constraints all deferred;
insert into _tap (line) select throws_ok(
  $$select public.reorder_route_stops((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), array[(select id from _ids where key = 's3')])$$,
  '22023', null, 'reorder needs every stop');
insert into _tap (line) select throws_ok(
  $$select public.reorder_route_stops((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), array[(select id from _ids where key = 's3'), (select id from _ids where key = 's3')])$$,
  '22023', null, 'reorder rejects a repeated stop');
insert into _tap (line) select throws_ok(
  $$select public.reorder_route_stops((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), array[(select id from _ids where key = 's3'), (select id from _ids where key = 's1')])$$,
  '22023', null, 'reorder rejects another route''s stop');

-- remove_route_stop ------------------------------------------------------------------
select public.remove_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's3'));
set constraints all immediate;
insert into _tap (line) select is(
  (select sequence from public.route_stops where id = (select id from _ids where key = 's2')), 1,
  'remove_route_stop closes the gap');
insert into _tap (line) select is(
  (select count(*) from public.route_stops where visit_id = (select id from _ids where key = 'v3')), 0::bigint,
  'the removed visit is unrouted again');
set constraints all deferred;

-- change_route_crew -------------------------------------------------------------------
-- r1 (crew E one, stop s2) becomes a route for E three; the roster goes with the old route.
insert into _ids select 'r1b', public.change_route_crew((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1'), (select id from _ids where key = 'crew-ethree'));
insert into _tap (line) select is(
  (select count(*) from public.routes where id = (select id from _ids where key = 'r1')), 0::bigint,
  'a crew change deletes the old route');
insert into _tap (line) select is(
  (select route_id from public.route_stops where id = (select id from _ids where key = 's2')), (select id from _ids where key = 'r1b'),
  'a crew change re-points the stops');
insert into _tap (line) select is(
  (select crew_id from public.routes where id = (select id from _ids where key = 'r1b')), (select id from _ids where key = 'crew-ethree'),
  'the new route belongs to the new crew');
insert into _tap (line) select is(
  public.change_route_crew((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1b'), (select id from _ids where key = 'crew-ethree')), (select id from _ids where key = 'r1b'),
  'the same crew is a no-op that returns the route');
insert into _tap (line) select throws_ok(
  $$select public.change_route_crew((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1b'), (select id from _ids where key = 'crew-etwo'))$$,
  '23505', 'that crew already has a route on this date', 'a crew change can''t collide with the crew''s other route');
insert into _tap (line) select throws_ok(
  $$select public.change_route_crew((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r1b'), (select id from _ids where key = 'crew-egone'))$$,
  'P0002', 'crew not found', 'a crew change refuses an archived crew');
-- E one is free again, and its member (on the old roster) can be seeded onto a new route.
insert into _ids select 'r4', public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-03', (select id from _ids where key = 'crew-eone'));
insert into _tap (line) select is(
  (select count(*) from public.route_members where route_id = (select id from _ids where key = 'r4')), 1::bigint,
  'a member freed by a crew change is seeded onto the next route');

-- delete_route ---------------------------------------------------------------------------
insert into _tap (line) select throws_ok(
  $$select public.delete_route((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r2'))$$,
  '55000', 'remove the route''s stops before deleting it', 'a route with stops can''t be deleted');
insert into _tap (line) select lives_ok(
  $$select public.delete_route((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r3'))$$,
  'an empty draft route can be deleted');
insert into _tap (line) select is(
  (select count(*) from public.routes where id = (select id from _ids where key = 'r3')), 0::bigint,
  'the deleted route is gone');

-- Locked routes ----------------------------------------------------------------------------
select set_config('role', 'postgres', true);
update public.routes set status = 'published' where id = (select id from _ids where key = 'r2');
update public.routes set status = 'optimized' where id = (select id from _ids where key = 'r4');
select set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r2'), (select id from _ids where key = 'v4'))$$,
  '55000', 'only a draft or optimized route can be changed', 'a published route takes no new stop');
insert into _tap (line) select throws_ok(
  $$select public.move_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's1'), (select id from _ids where key = 'r4'), 1)$$,
  '55000', 'only a draft or optimized route can be changed', 'a stop can''t leave a published route');
insert into _tap (line) select throws_ok(
  $$select public.move_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's2'), (select id from _ids where key = 'r2'), 1)$$,
  '55000', 'only a draft or optimized route can be changed', 'a stop can''t move onto a published route');
insert into _tap (line) select throws_ok(
  $$select public.remove_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's1'))$$,
  '55000', 'only a draft or optimized route can be changed', 'a published route''s stop can''t be removed');
insert into _tap (line) select throws_ok(
  $$select public.reorder_route_stops((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r2'), array[(select id from _ids where key = 's1')])$$,
  '55000', 'only a draft or optimized route can be changed', 'a published route can''t be reordered');
insert into _tap (line) select throws_ok(
  $$select public.change_route_crew((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r2'), (select id from _ids where key = 'crew-eone'))$$,
  '55000', 'only a draft or optimized route can be changed', 'a published route''s crew is fixed');
insert into _tap (line) select throws_ok(
  $$select public.delete_route((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r2'))$$,
  '55000', 'only a draft route can be deleted', 'a published route can''t be deleted');
insert into _tap (line) select throws_ok(
  $$select public.delete_route((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r4'))$$,
  '55000', 'only a draft route can be deleted', 'an optimized route can''t be deleted');
insert into _tap (line) select lives_ok(
  $$select public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r4'), (select id from _ids where key = 'v4'))$$,
  'an optimized route can still be edited');

-- Other organization's dispatcher ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.add_route_stop((select id from _ids where key = 'pgtap-rb-f'), (select id from _ids where key = 'r4'), (select id from _ids where key = 'vf'))$$,
  'P0002', 'route not found', 'another organization''s route is not found, even under the caller''s own org id');
insert into _tap (line) select throws_ok(
  $$select public.move_route_stop((select id from _ids where key = 'pgtap-rb-f'), (select id from _ids where key = 's1'), (select id from _ids where key = 'r4'), 1)$$,
  'P0002', 'stop not found', 'another organization''s stop is not found');
insert into _tap (line) select throws_ok(
  $$select public.remove_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's1'))$$,
  'P0002', 'stop not found', 'naming the other organization''s id doesn''t reveal its stops');
insert into _tap (line) select throws_ok(
  $$select public.delete_route((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r4'))$$,
  'P0002', 'route not found', 'another organization''s route can''t be deleted');
insert into _tap (line) select is(
  (select count(*) from public.route_stops), 0::bigint,
  'the other organization sees none of the stops');

-- Worker: no policies on routes or stops ------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.remove_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's1'))$$,
  'P0002', 'stop not found', 'a worker can''t see stops, so can''t remove one');
insert into _tap (line) select throws_ok(
  $$select public.add_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r4'), (select id from _ids where key = 'v3'))$$,
  'P0002', 'route not found', 'a worker can''t see routes, so can''t add a stop');
insert into _tap (line) select throws_ok(
  $$select public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-10', (select id from _ids where key = 'crew-eone'))$$,
  null, null, 'a worker can''t create a route');

-- Anonymous and service role: no execute grant ----------------------------------------------------
select set_config('role', 'anon', true);
insert into _tap (line) select throws_ok(
  $$select public.create_route((select id from _ids where key = 'pgtap-rb-e'), '2026-06-10', (select id from _ids where key = 'crew-eone'))$$,
  '42501', null, 'anon can''t call create_route');
insert into _tap (line) select throws_ok(
  $$select public.move_route_stop((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 's1'), (select id from _ids where key = 'r4'), 1)$$,
  '42501', null, 'anon can''t call move_route_stop');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.delete_route((select id from _ids where key = 'pgtap-rb-e'), (select id from _ids where key = 'r4'))$$,
  '42501', null, 'service_role can''t call the route builder functions');
select set_config('role', 'postgres', true);

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
