-- pgTAP tests for migration time_tracking. See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

-- Fixtures (as postgres): Worker 1 is on a published route with one visit.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'worker1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'worker2@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('Org A', 'org-a');
insert into _ids select slug::text, id from public.organizations;
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-00000000000a', 'owner', 'Owner'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000c1', 'worker', 'Worker 1'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000c2', 'worker', 'Worker 2');
insert into _ids select 'm-' || replace(lower(display_name), ' ', ''), id from public.organization_members;
insert into public.member_pay_rates (organization_id, member_id, hourly_rate_cents, effective_from) values
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'm-worker1'), 2500, '2026-01-01'),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'm-worker1'), 3000, '2026-06-01');

insert into public.clients (organization_id, display_name) values ((select id from _ids where key = 'org-a'), 'Jane');
insert into public.properties (organization_id, client_id, address_line1, city)
select organization_id, id, '1 Main', 'Edmonton' from public.clients;
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select p.organization_id, p.client_id, p.id, t, '2026-06-03' from public.properties p, unnest(array['Routed', 'Other']) t;
insert into _ids select 'v-' || lower(j.title), v.id from public.visits v join public.jobs j on j.id = v.job_id;
insert into public.crews (organization_id, name) values ((select id from _ids where key = 'org-a'), 'Truck 1');
insert into public.crew_members (organization_id, crew_id, member_id)
select organization_id, id, (select id from _ids where key = 'm-worker1') from public.crews;
insert into public.routes (organization_id, crew_id, route_date, status)
select organization_id, id, '2026-06-03', 'published' from public.crews;
insert into public.route_stops (organization_id, route_id, visit_id, sequence)
select organization_id, id, (select id from _ids where key = 'v-routed'), 1 from public.routes;

-- Worker 1 -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into _tap (line) select lives_ok(
  $$insert into public.shifts (organization_id, member_id, clock_in)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'm-worker1'), '2026-06-03 14:00+00')$$,
  'a worker can clock in');
insert into _tap (line) select throws_ok(
  $$insert into public.shifts (organization_id, member_id, clock_in)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'm-worker1'), '2026-06-03 18:00+00')$$,
  '23P01', null, 'a worker cannot have two open shifts');
insert into _tap (line) select throws_ok(
  $$insert into public.shifts (organization_id, member_id, clock_in)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'm-worker2'), '2026-06-03 14:00+00')$$,
  '42501', null, 'a worker cannot clock someone else in');
insert into _tap (line) select throws_ok(
  $$insert into public.shifts (organization_id, member_id, clock_in, clock_out, approved_at)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'm-worker1'), '2026-06-01 14:00+00', '2026-06-01 15:00+00', now())$$,
  '42501', null, 'a worker cannot create pre-approved time');

insert into _tap (line) select lives_ok(
  $$update public.shifts set clock_out = '2026-06-03 22:30+00', break_minutes = 30
    where member_id = (select id from _ids where key = 'm-worker1') and clock_out is null$$,
  'a worker can clock out');
update public.shifts set clock_out = '2026-06-04 06:00+00' where member_id = (select id from _ids where key = 'm-worker1');
insert into _tap (line) select is(
  (select clock_out from public.shifts where member_id = (select id from _ids where key = 'm-worker1')),
  '2026-06-03 22:30+00'::timestamptz, 'a worker cannot edit a closed shift (the update matches no rows)');

insert into _tap (line) select lives_ok(
  $$insert into public.visit_time_entries (organization_id, visit_id, member_id, started_at)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'v-routed'), (select id from _ids where key = 'm-worker1'), '2026-06-03 15:00+00')$$,
  'a worker can log time on a routed visit');
insert into _tap (line) select throws_ok(
  $$insert into public.visit_time_entries (organization_id, visit_id, member_id, started_at)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'v-other'), (select id from _ids where key = 'm-worker1'), '2026-06-03 17:00+00')$$,
  '42501', null, 'a worker cannot log time on a visit outside their routes');

-- Worker 2 --------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.shifts), 0::bigint, 'workers cannot see other workers'' shifts');

-- Owner -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$insert into public.visit_time_entries (organization_id, visit_id, member_id, started_at, ended_at)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'v-other'), (select id from _ids where key = 'm-worker1'),
            '2026-06-03 15:30+00', '2026-06-03 16:00+00')$$,
  '23P01', null, 'a worker cannot be on two visits at once');
insert into _tap (line) select throws_ok(
  $$insert into public.shifts (organization_id, member_id, clock_in, clock_out)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'm-worker1'), '2026-06-03 20:00+00', '2026-06-03 23:00+00')$$,
  '23P01', null, 'shifts cannot overlap');
insert into _tap (line) select throws_ok(
  $$insert into public.shifts (organization_id, member_id, clock_in, clock_out, break_minutes)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'm-worker2'), '2026-06-03 14:00+00', '2026-06-03 15:00+00', 90)$$,
  '23514', null, 'a break cannot be longer than the shift');

update public.shifts set approved_by = '00000000-0000-0000-0000-00000000000a', approved_at = now()
where member_id = (select id from _ids where key = 'm-worker1');
insert into _tap (line) select results_eq(
  $$select work_date, hours, hourly_rate_cents, labor_cost_cents from public.labor_cost_report$$,
  $$values ('2026-06-03'::date, 8.00::numeric, 3000::bigint, 24000::bigint)$$,
  'labor_cost_report: 8.5h minus a 30m break at the June rate');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into _tap (line) select results_eq(
  $$select hours, hourly_rate_cents from public.labor_cost_report$$,
  $$values (8.00::numeric, null::bigint)$$,
  'workers see their own hours but not their pay rate');

select set_config('role', 'postgres', true);
insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
