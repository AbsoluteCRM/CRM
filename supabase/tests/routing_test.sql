-- pgTAP tests for migration routing (including worker access to visits,
-- jobs, properties, and clients). See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

-- Fixtures (as postgres) ----------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'disp-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'worker1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'worker2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('Org A', 'org-a'), ('Org B', 'org-b');
insert into _ids select slug::text, id from public.organizations where slug in ('org-a', 'org-b');
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org-a'), null, 'owner', 'Owner A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000d1', 'dispatcher', 'Dispatcher'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000c1', 'worker', 'Worker 1'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000c2', 'worker', 'Worker 2'),
  ((select id from _ids where key = 'org-b'), '00000000-0000-0000-0000-00000000000b', 'owner', 'Owner B');
insert into _ids select 'm-' || replace(lower(display_name), ' ', ''), id from public.organization_members;

insert into public.crews (organization_id, name, default_start_location) values
  ((select id from _ids where key = 'org-a'), 'Truck 1', 'SRID=4326;POINT(-113.5 53.5)'),
  ((select id from _ids where key = 'org-a'), 'Truck 2', null);
insert into _ids select 'crew-' || replace(lower(name), ' ', ''), id from public.crews;
insert into public.crew_members (organization_id, crew_id, member_id, is_lead)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'crew-truck1'), (select id from _ids where key = 'm-worker1'), true);

insert into public.clients (organization_id, display_name) values
  ((select id from _ids where key = 'org-a'), 'Jane'), ((select id from _ids where key = 'org-a'), 'Bob');
insert into _ids select 'client-' || lower(display_name), id from public.clients;
insert into public.properties (organization_id, client_id, address_line1, city, access_notes)
select organization_id, id, display_name || ' St', 'Edmonton', 'Gate code 1234' from public.clients;
insert into _ids select 'prop-' || lower(c.display_name), p.id from public.properties p join public.clients c on c.id = p.client_id;

insert into public.jobs (organization_id, client_id, property_id, title, start_date) values
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'), (select id from _ids where key = 'prop-jane'), 'Jane job', '2026-06-03'),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-bob'), (select id from _ids where key = 'prop-bob'), 'Bob job', '2026-06-03'),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'), (select id from _ids where key = 'prop-jane'), 'Jane later', '2026-06-04');
insert into public.jobs (organization_id, client_id, property_id, title, kind, rrule, start_date) values
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'), (select id from _ids where key = 'prop-jane'), 'Jane weekly', 'recurring', 'FREQ=WEEKLY;BYDAY=WE', '2026-06-03');
insert into _ids select 'job-' || replace(lower(title), ' ', ''), id from public.jobs;
select public.generate_visits((select id from _ids where key = 'job-janeweekly'), '{2026-06-03,2026-06-10}', '2026-06-10');
insert into _ids select 'v-' || replace(lower(j.title), ' ', '') || '-' || to_char(v.scheduled_date, 'MMDD'), v.id
from public.visits v join public.jobs j on j.id = v.job_id;
insert into public.job_line_items (organization_id, job_id, position, description, unit_price_cents)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'job-janejob'), 1, 'Mow', 4500);

-- Dispatcher builds and publishes a route ------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into public.routes (organization_id, crew_id, route_date)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'crew-truck1'), '2026-06-03');
insert into _tap (line) select results_eq(
  $$select (select count(*) from public.route_members)::int, planned_start, start_location is not null from public.routes$$,
  $$values (1, '2026-06-03 14:00:00+00'::timestamptz, true)$$,
  'a new route seeds its roster from the crew and its start from the crew''s depot and time (08:00 MDT)');

select set_config('role', 'postgres', true);
insert into _ids select 'route1', id from public.routes;
select set_config('role', 'authenticated', true);

insert into _tap (line) select lives_ok(
  $$insert into public.route_stops (organization_id, route_id, visit_id, sequence) values
      ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'route1'), (select id from _ids where key = 'v-janejob-0603'), 1),
      ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'route1'), (select id from _ids where key = 'v-janeweekly-0603'), 2)$$,
  'a dispatcher can add stops');
insert into _tap (line) select throws_ok(
  $$insert into public.route_stops (organization_id, route_id, visit_id, sequence)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'route1'), (select id from _ids where key = 'v-janelater-0604'), 3)$$,
  '23514', null, 'a visit can only be routed on its scheduled date');
insert into _tap (line) select throws_ok(
  $$insert into public.route_stops (organization_id, route_id, visit_id, sequence)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'route1'), (select id from _ids where key = 'v-janejob-0603'), 9)$$,
  '23505', null, 'a visit is on at most one route');
insert into _tap (line) select lives_ok(
  $$update public.route_stops set sequence = case sequence when 1 then 2 else 1 end
    where route_id = (select id from _ids where key = 'route1')$$,
  'stops can be reordered in one statement (deferred unique sequence)');

-- Worker 1 before publishing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.visits), 0::bigint, 'workers see nothing on a draft route');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
update public.routes set status = 'published' where id = (select id from _ids where key = 'route1');
insert into _tap (line) select isnt((select published_at from public.routes), null, 'publishing stamps published_at');

-- Worker 1 after publishing --------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into _tap (line) select results_eq(
  $$select (select count(*) from public.visits)::int, (select count(*) from public.jobs)::int,
           (select count(*) from public.properties)::int, (select string_agg(display_name, ',') from public.clients),
           (select count(*) from public.route_stops)::int, (select count(*) from public.job_line_items)::int$$,
  $$values (2, 2, 1, 'Jane', 2, 0)$$,
  'a rostered worker sees only their routed visits, jobs, property, and client, and no prices');
insert into _tap (line) select is(
  (select access_notes from public.properties), 'Gate code 1234', 'workers can read access notes for their stops');

select set_config('role', 'postgres', true);
update public.organizations set settings = '{"workers_see_prices": true}' where slug = 'org-a';
select set_config('role', 'authenticated', true);
insert into _tap (line) select is((select count(*) from public.job_line_items), 1::bigint, 'workers see prices when the org allows it');

insert into _tap (line) select throws_ok(
  $$update public.visits set scheduled_date = '2026-06-05' where id = (select id from _ids where key = 'v-janejob-0603')$$,
  '42501', null, 'workers cannot reschedule visits');
insert into _tap (line) select throws_ok(
  $$update public.visits set status = 'cancelled' where id = (select id from _ids where key = 'v-janejob-0603')$$,
  '42501', null, 'workers cannot cancel visits');
insert into _tap (line) select throws_ok(
  $$update public.visits set completed_by_member_id = (select id from _ids where key = 'm-worker2') where id = (select id from _ids where key = 'v-janejob-0603')$$,
  '42501', null, 'workers cannot record someone else as completing a visit');
insert into _tap (line) select lives_ok(
  $$update public.visits set status = 'in_progress' where id = (select id from _ids where key = 'v-janejob-0603')$$,
  'workers can start a visit');
insert into _tap (line) select lives_ok(
  $$update public.visits set status = 'completed', completion_notes = 'Done', completed_by_member_id = (select id from _ids where key = 'm-worker1')
    where id = (select id from _ids where key = 'v-janejob-0603')$$,
  'workers can complete a visit, recording themselves');
update public.visits set status = 'in_progress' where id = (select id from _ids where key = 'v-bobjob-0603');
insert into _tap (line) select lives_ok(
  $$insert into public.attachments (organization_id, storage_path, mime_type, size_bytes, visit_id)
    values ((select id from _ids where key = 'org-a'), (select id::text from _ids where key = 'org-a') || '/after.jpg', 'image/jpeg', 1,
            (select id from _ids where key = 'v-janejob-0603'))$$,
  'workers can attach photos to their visits');
insert into _tap (line) select throws_ok(
  $$insert into public.attachments (organization_id, storage_path, mime_type, size_bytes, visit_id)
    values ((select id from _ids where key = 'org-a'), (select id::text from _ids where key = 'org-a') || '/sneaky.jpg', 'image/jpeg', 1,
            (select id from _ids where key = 'v-bobjob-0603'))$$,
  '42501', null, 'workers cannot attach to visits outside their routes');

select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.visits where id = (select id from _ids where key = 'v-bobjob-0603')), 'scheduled',
  'a worker''s update to a visit outside their routes matches no rows');
select set_config('role', 'authenticated', true);

-- Worker 2 (not rostered) and another org ------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.visits), 0::bigint, 'an unrostered worker sees no visits');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.routes), 0::bigint, 'another org sees no routes');

-- Dispatcher: double booking, rescheduling, schedule reset ---------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into public.routes (organization_id, crew_id, route_date)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'crew-truck2'), '2026-06-03');
insert into _tap (line) select throws_ok(
  $$insert into public.route_members (organization_id, route_id, member_id)
    select organization_id, id, (select id from _ids where key = 'm-worker1') from public.routes where crew_id = (select id from _ids where key = 'crew-truck2')$$,
  '23P01', null, 'a member cannot be on two routes the same day');

insert into _tap (line) select is(
  public.reset_job_schedule((select id from _ids where key = 'job-janeweekly'), '2026-06-01'), 1,
  'reset_job_schedule keeps visits that are already routed');

update public.visits set scheduled_date = '2026-06-05' where id = (select id from _ids where key = 'v-janeweekly-0603');
insert into _tap (line) select is(
  (select count(*) from public.route_stops where visit_id = (select id from _ids where key = 'v-janeweekly-0603')), 0::bigint,
  'rescheduling a visit removes it from its old route');

-- Optimization payloads are service-role only ------------------------------------
select set_config('role', 'postgres', true);
insert into public.optimization_runs (id, organization_id, route_date, provider)
values ('33333333-3333-3333-3333-333333333333', (select id from _ids where key = 'org-a'), '2026-06-03', 'vroom');
insert into public.optimization_run_payloads (organization_id, run_id, request)
values ((select id from _ids where key = 'org-a'), '33333333-3333-3333-3333-333333333333', '{"jobs": []}');
select set_config('role', 'authenticated', true);
insert into _tap (line) select results_eq(
  $$select (select count(*) from public.optimization_runs)::int, (select count(*) from public.optimization_run_payloads)::int$$,
  $$values (1, 0)$$,
  'office staff see optimization runs but not raw solver payloads');

select set_config('role', 'postgres', true);
insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
