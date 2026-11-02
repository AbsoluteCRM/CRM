-- pgTAP tests for 20261030220000_member_performance: certifications and
-- performance on organization_members. Hermetic: its own org ('pgtap-mp').

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'mp-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'mp-worker@test.local', 'authenticated', 'authenticated');

insert into public.organizations (name, slug) values ('PgTap MP', 'pgtap-mp');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-mp';
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000c1', 'admin', 'MP Manager'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000c2', 'worker', 'MP Walt');
insert into _ids select 'walt', id from public.organization_members where display_name = 'MP Walt';

insert into _tap (line) select results_eq(
  $$select certifications, jobs_completed, hours_worked, rating from public.organization_members
    where id = (select id from _ids where key = 'walt')$$,
  $$values ('{}'::text[], 0, 0::numeric, null::numeric)$$,
  'members start with no certifications, no work and no rating');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set rating = 5.5 where id = (select id from _ids where key = 'walt')$$,
  '23514', null, 'ratings are out of 5');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set hours_worked = -1 where id = (select id from _ids where key = 'walt')$$,
  '23514', null, 'hours can''t be negative');

-- A manager edits certifications, but not the performance numbers.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
update public.organization_members set certifications = '{"First Aid / CPR"}'
where id = (select id from _ids where key = 'walt');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set jobs_completed = 99 where id = (select id from _ids where key = 'walt')$$,
  '42501', null, 'the app can''t write performance numbers');

-- A contractor can't edit their own certifications.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
update public.organization_members set certifications = '{"Made up"}'
where id = (select id from _ids where key = 'walt');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select certifications from public.organization_members where id = (select id from _ids where key = 'walt')),
  '{"First Aid / CPR"}'::text[], 'a manager saves certifications; a contractor can''t change them');

insert into _tap (line) select * from finish();
select line from _tap order by n;

rollback;
