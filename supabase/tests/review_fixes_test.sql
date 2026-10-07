-- pgTAP tests for the review_fixes migration (reviewer and security gates on
-- the rebaseline PR). Hermetic: its own org ('pgtap-b') and users.
-- See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'pgtap-b-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'pgtap-b-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b3', 'pgtap-b-worker1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b4', 'pgtap-b-worker2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b5', 'alt@test.local', 'authenticated', 'authenticated');

insert into public.organizations (name, slug) values ('PgTap B', 'pgtap-b');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-b';

insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000b1', 'owner', 'Owner'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000b2', 'admin', 'Admin'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000b3', 'worker', 'Worker 1'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000b4', 'worker', 'Worker 2'),
  ((select id from _ids where key = 'org'), null, 'owner', 'Placeholder');
insert into _ids
select 'm-' || replace(lower(display_name), ' ', ''), id
from public.organization_members where organization_id = (select id from _ids where key = 'org');

insert into public.crews (organization_id, name) values ((select id from _ids where key = 'org'), 'Truck 1');
insert into _ids select 'crew', id from public.crews where organization_id = (select id from _ids where key = 'org');
insert into public.crew_members (organization_id, crew_id, member_id)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'crew'), (select id from _ids where key = 'm-worker1'));

insert into public.clients (organization_id, display_name) values ((select id from _ids where key = 'org'), 'Jane');
insert into _ids select 'client', id from public.clients where organization_id = (select id from _ids where key = 'org');
insert into public.properties (organization_id, client_id, address_line1, city)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'client'), '1 Main St', 'Edmonton');
insert into _ids select 'prop', id from public.properties where organization_id = (select id from _ids where key = 'org');

insert into public.jobs (organization_id, client_id, property_id, title, kind, rrule, start_date)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'client'), (select id from _ids where key = 'prop'),
        'Weekly', 'recurring', 'FREQ=WEEKLY', '2026-06-03');
insert into _ids select 'job-weekly', id from public.jobs where organization_id = (select id from _ids where key = 'org') and title = 'Weekly';
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'client'), (select id from _ids where key = 'prop'),
        'One-off', '2026-06-03');
insert into _ids select 'visit', v.id from public.visits v join public.jobs j on j.id = v.job_id
where j.organization_id = (select id from _ids where key = 'org') and j.title = 'One-off';

insert into public.routes (organization_id, crew_id, route_date, status)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'crew'), '2026-06-03', 'published');
insert into _ids select 'route', id from public.routes where organization_id = (select id from _ids where key = 'org');
insert into public.route_members (organization_id, route_id, member_id)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'route'), (select id from _ids where key = 'm-worker2'));
insert into public.route_stops (organization_id, route_id, visit_id, sequence)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'route'), (select id from _ids where key = 'visit'), 1);

-- Office staff can generate and reset visits with their own session -------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select is(
  public.generate_visits((select id from _ids where key = 'job-weekly'), '{2026-06-10,2026-06-17}', '2026-06-17'), 2,
  'an admin can generate visits as authenticated');
insert into _tap (line) select is(
  public.reset_job_schedule((select id from _ids where key = 'job-weekly'), '2026-06-01'), 2,
  'an admin can reset a job''s schedule as authenticated');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.generate_visits((select id from _ids where key = 'job-weekly'), '{2026-06-24}', '2026-06-24')$$,
  'P0002', null, 'a worker can''t generate visits');

-- Two workers time one visit ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b3","role":"authenticated"}', true);
insert into _tap (line) select lives_ok(
  $$select public.worker_start_visit((select id from _ids where key = 'visit'))$$, 'worker 1 starts the visit');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b4","role":"authenticated"}', true);
insert into _tap (line) select lives_ok(
  $$select public.worker_join_visit((select id from _ids where key = 'visit'))$$, 'worker 2 joins the started visit');
insert into _tap (line) select lives_ok(
  $$select public.worker_join_visit((select id from _ids where key = 'visit'))$$, 'joining twice does nothing');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select count(*) from public.visit_time_entries where visit_id = (select id from _ids where key = 'visit') and ended_at is null),
  2::bigint, 'both workers have an open time entry');
select set_config('role', 'authenticated', true);
insert into _tap (line) select lives_ok(
  $$select public.worker_complete_visit((select id from _ids where key = 'visit'), 'Done')$$, 'a worker completes the visit');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select count(*) from public.visit_time_entries where visit_id = (select id from _ids where key = 'visit') and ended_at is null),
  0::bigint, 'completing closes every worker''s time entry');
select set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.worker_join_visit((select id from _ids where key = 'visit'))$$,
  '55000', null, 'a completed visit can''t be joined');

-- An admin can't use an invitation to take over an owner row -------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
insert into public.organization_invitations (organization_id, email, role, member_id, token_hash)
values ((select id from _ids where key = 'org'), 'alt@test.local', 'worker', (select id from _ids where key = 'm-placeholder'),
        encode(extensions.digest('t', 'sha256'), 'hex'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b5","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.accept_invitation('t')$$, '42501', null, 'an invitation that names an owner row is refused');

-- Trusted code ---------------------------------------------------------------------------------
select set_config('role', 'postgres', true);
select set_config('request.jwt.claims', '', true);
insert into _tap (line) select throws_ok(
  $$select public.create_invoice_for_visits((select id from _ids where key = 'client'), '{}')$$,
  '22023', null, 'an invoice needs at least one visit');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
