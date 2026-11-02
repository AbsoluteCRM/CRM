-- pgTAP tests for 20261030120000_time_off_day_off_and_clear: the day_off kind
-- and clearing approved time off. Hermetic: its own org ('pgtap-toc').

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'toc-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e2', 'toc-worker@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e3', 'toc2-owner@test.local', 'authenticated', 'authenticated');

insert into public.organizations (name, slug) values ('PgTap TOC', 'pgtap-toc'), ('PgTap TOC2', 'pgtap-toc2');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-toc';
insert into _ids select 'org2', id from public.organizations where slug = 'pgtap-toc2';
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000e1', 'admin', 'TOC Manager'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000e2', 'worker', 'TOC Walt'),
  ((select id from _ids where key = 'org2'), '00000000-0000-0000-0000-0000000000e3', 'owner', 'TOC Other');
insert into _ids select 'walt', id from public.organization_members where display_name = 'TOC Walt';

-- A manager records a vacation, day 10 to day 14 from today.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
select public.record_time_off((select id from _ids where key = 'walt'), 'vacation', current_date + 10, current_date + 14, 'Trip');
select public.record_time_off((select id from _ids where key = 'walt'), 'day_off', current_date + 20, current_date + 20, null);
select set_config('role', 'postgres', true);

insert into _tap (line) select is(
  (select kind::text from public.time_off where member_id = (select id from _ids where key = 'walt') and start_date = current_date + 20),
  'day_off', 'a manager can record a one-off day off');

-- Clearing the middle day keeps the days on either side.
select set_config('role', 'authenticated', true);
insert into _tap (line) select is(
  public.clear_time_off((select id from _ids where key = 'walt'), current_date + 12, current_date + 12),
  1, 'clearing one day touches the vacation that covers it');
select set_config('role', 'postgres', true);
insert into _tap (line) select results_eq(
  $$select kind::text, start_date - current_date, end_date - current_date, note
    from public.time_off where member_id = (select id from _ids where key = 'walt')
      and status = 'approved' and kind = 'vacation' order by start_date$$,
  $$values ('vacation', 10, 11, 'Trip'), ('vacation', 13, 14, 'Trip')$$,
  'the days before and after the cleared day stay off');
insert into _tap (line) select is(
  (select count(*)::int from public.time_off where member_id = (select id from _ids where key = 'walt') and status = 'cancelled'),
  1, 'the original vacation is cancelled, not deleted');

-- Clearing a range that covers everything leaves nothing approved.
select set_config('role', 'authenticated', true);
select public.clear_time_off((select id from _ids where key = 'walt'), current_date, current_date + 30);
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select count(*)::int from public.time_off where member_id = (select id from _ids where key = 'walt') and status = 'approved'),
  0, 'clearing a wide range leaves no approved time off');

-- Contractors and other companies can't clear.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.clear_time_off((select id from _ids where key = 'walt'), current_date, current_date)$$,
  'P0002', null, 'a contractor can''t clear time off');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.clear_time_off((select id from _ids where key = 'walt'), current_date, current_date)$$,
  'P0002', null, 'an owner of another company can''t clear time off');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.clear_time_off((select id from _ids where key = 'walt'), current_date + 2, current_date + 1)$$,
  '22023', null, 'the range must not end before it starts');
select set_config('role', 'postgres', true);

insert into _tap (line) select ok(
  not has_function_privilege('anon', 'public.clear_time_off(uuid, date, date)', 'execute'),
  'anon can''t call clear_time_off');

insert into _tap (line) select * from finish();
select line from _tap order by n;

rollback;
