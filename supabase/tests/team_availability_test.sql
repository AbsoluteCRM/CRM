-- pgTAP tests for 20261029190000_team_availability: work schedules and the
-- time-off request / approval flow. Hermetic: its own orgs ('pgtap-ta',
-- 'pgtap-ta2'). See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'ta-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'ta-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f3', 'ta-dispatcher@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f4', 'ta-worker@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f5', 'ta-worker2@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f6', 'ta2-owner@test.local', 'authenticated', 'authenticated');

insert into public.organizations (name, slug) values ('PgTap TA', 'pgtap-ta'), ('PgTap TA2', 'pgtap-ta2');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-ta';
insert into _ids select 'org2', id from public.organizations where slug = 'pgtap-ta2';

insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000f1', 'owner', 'Owner'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000f2', 'admin', 'Manager'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000f3', 'dispatcher', 'Dispatcher'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000f4', 'worker', 'Walt'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000f5', 'worker', 'Wendy'),
  ((select id from _ids where key = 'org2'), '00000000-0000-0000-0000-0000000000f6', 'owner', 'Other owner');
insert into _ids select 'walt', id from public.organization_members where display_name = 'Walt';
insert into _ids select 'wendy', id from public.organization_members where display_name = 'Wendy';
insert into _ids select 'manager', id from public.organization_members where display_name = 'Manager';

-- Defaults ---------------------------------------------------------------------------------
insert into _tap (line) select results_eq(
  $$select work_days, work_start, work_end from public.organization_members
    where id = (select id from _ids where key = 'walt')$$,
  $$values ('{1,2,3,4,5}'::smallint[], '08:00'::time, '17:00'::time)$$,
  'members default to Monday to Friday, 8 to 5');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set work_days = '{0,8}' where id = (select id from _ids where key = 'walt')$$,
  '23514', null, 'work days must be ISO weekdays 1 to 7');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set work_start = '17:00', work_end = '08:00' where id = (select id from _ids where key = 'walt')$$,
  '23514', null, 'work hours must start before they end');

-- Schedules: managers edit, contractors don't --------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
update public.organization_members set work_days = '{1,2,3,4,6}'
where id = (select id from _ids where key = 'walt');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select work_days from public.organization_members where id = (select id from _ids where key = 'walt')),
  '{1,2,3,4,6}'::smallint[], 'a manager can change a contractor''s work days');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
update public.organization_members set work_days = '{1}'
where id = (select id from _ids where key = 'walt');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select work_days from public.organization_members where id = (select id from _ids where key = 'walt')),
  '{1,2,3,4,6}'::smallint[], 'a contractor can''t change their own schedule');

-- Requests ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _ids select 'sick', public.request_time_off(
  (select id from _ids where key = 'org'), 'sick', current_date + 1, current_date + 2, ' Flu ');
select set_config('role', 'postgres', true);
insert into _tap (line) select results_eq(
  $$select member_id, status::text, note from public.time_off where id = (select id from _ids where key = 'sick')$$,
  $$values ((select id from _ids where key = 'walt'), 'pending', 'Flu')$$,
  'a contractor''s request is for themselves and starts pending');

select set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.request_time_off((select id from _ids where key = 'org'), 'vacation', current_date + 2, current_date + 4)$$,
  '55000', null, 'overlapping requests are refused');
insert into _tap (line) select throws_ok(
  $$select public.request_time_off((select id from _ids where key = 'org'), 'sick', current_date - 3, current_date - 2)$$,
  '22023', null, 'requests for past dates are refused');
insert into _tap (line) select throws_ok(
  $$select public.request_time_off((select id from _ids where key = 'org2'), 'sick', current_date + 5, current_date + 5)$$,
  '42501', null, 'a non-member can''t request time off in another company');
insert into _tap (line) select throws_ok(
  $$select public.review_time_off((select id from _ids where key = 'sick'), true)$$,
  'P0002', null, 'a contractor can''t approve requests');
insert into _tap (line) select throws_ok(
  $$insert into public.time_off (organization_id, member_id, kind, start_date, end_date, status)
    values ((select id from _ids where key = 'org'), (select id from _ids where key = 'walt'), 'sick', current_date, current_date, 'approved')$$,
  '42501', null, 'nobody writes time_off directly');

-- Visibility -----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f5","role":"authenticated"}', true);
insert into _tap (line) select is(
  (select count(*) from public.time_off), 0::bigint, 'contractors don''t see other people''s time off');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
insert into _tap (line) select is(
  (select count(*) from public.time_off), 1::bigint, 'dispatchers see the team''s time off');
insert into _tap (line) select throws_ok(
  $$select public.review_time_off((select id from _ids where key = 'sick'), true)$$,
  'P0002', null, 'a dispatcher can''t approve requests');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f6","role":"authenticated"}', true);
insert into _tap (line) select is(
  (select count(*) from public.time_off), 0::bigint, 'another company sees nothing');
insert into _tap (line) select throws_ok(
  $$select public.review_time_off((select id from _ids where key = 'sick'), true)$$,
  'P0002', null, 'another company''s owner can''t approve');

-- Review ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select public.review_time_off((select id from _ids where key = 'sick'), true, 'Feel better');
select set_config('role', 'postgres', true);
insert into _tap (line) select results_eq(
  $$select status::text, reviewed_by_member_id, review_note, reviewed_at is not null
    from public.time_off where id = (select id from _ids where key = 'sick')$$,
  $$values ('approved', (select id from _ids where key = 'manager'), 'Feel better', true)$$,
  'a manager approves and is recorded as the reviewer');
select set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.review_time_off((select id from _ids where key = 'sick'), false)$$,
  '55000', null, 'a request is reviewed once');

-- A manager's own request needs someone else -------------------------------------------------
insert into _ids select 'own', public.request_time_off(
  (select id from _ids where key = 'org'), 'personal', current_date + 10, current_date + 10);
insert into _tap (line) select throws_ok(
  $$select public.review_time_off((select id from _ids where key = 'own'), true)$$,
  '42501', null, 'a manager can''t approve their own request');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select public.review_time_off((select id from _ids where key = 'own'), false);
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.time_off where id = (select id from _ids where key = 'own')),
  'declined', 'the owner can review the manager''s request');

-- Recording and cancelling ---------------------------------------------------------------------
select set_config('role', 'authenticated', true);
insert into _ids select 'vac', public.record_time_off(
  (select id from _ids where key = 'wendy'), 'vacation', current_date + 20, current_date + 25);
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.time_off where id = (select id from _ids where key = 'vac')),
  'approved', 'time off a manager records is approved straight away');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f5","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.cancel_time_off((select id from _ids where key = 'vac'))$$,
  '55000', null, 'a contractor can''t cancel approved time off');
insert into _ids select 'wendy_req', public.request_time_off(
  (select id from _ids where key = 'org'), 'sick', current_date + 3, current_date + 3);
select public.cancel_time_off((select id from _ids where key = 'wendy_req'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.cancel_time_off((select id from _ids where key = 'vac'))$$,
  'P0002', null, 'a contractor can''t cancel someone else''s time off');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select public.cancel_time_off((select id from _ids where key = 'vac'));
select set_config('role', 'postgres', true);
insert into _tap (line) select results_eq(
  $$select status::text from public.time_off
    where id in ((select id from _ids where key = 'wendy_req'), (select id from _ids where key = 'vac'))
    order by start_date$$,
  $$values ('cancelled'), ('cancelled')$$,
  'a contractor cancels their pending request; a manager cancels approved time off');

-- Privileges -------------------------------------------------------------------------------
insert into _tap (line) select ok(
  not has_function_privilege('anon', 'public.request_time_off(uuid, public.time_off_kind, date, date, text)', 'execute')
  and not has_function_privilege('anon', 'public.review_time_off(uuid, boolean, text)', 'execute'),
  'anon can''t call the time-off functions');

insert into _tap (line) select * from finish();
select line from _tap order by n;

rollback;
