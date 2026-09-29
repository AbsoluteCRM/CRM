-- pgTAP tests for migration crews. See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'disp-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'worker-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('Org A', 'org-a'), ('Org B', 'org-b');
insert into _ids select slug::text, id from public.organizations where slug in ('org-a', 'org-b');
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org-a'), null, 'owner', 'Owner A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000d1', 'dispatcher', 'Dispatcher A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000c1', 'worker', 'Worker A'),
  ((select id from _ids where key = 'org-a'), null, 'worker', 'Crew E'),
  ((select id from _ids where key = 'org-b'), '00000000-0000-0000-0000-00000000000b', 'owner', 'Owner B');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select lives_ok(
  $$insert into public.crews (organization_id, name, default_start_location)
    values ((select id from _ids where key = 'org-a'), 'Truck 1', 'SRID=4326;POINT(-113.5 53.5)')$$,
  'a dispatcher can add a crew');
insert into _tap (line) select lives_ok(
  $$insert into public.crew_members (organization_id, crew_id, member_id, is_lead)
    select m.organization_id, c.id, m.id, m.display_name = 'Worker A'
    from public.crews c join public.organization_members m on m.organization_id = c.organization_id
    where m.display_name in ('Worker A', 'Crew E')$$,
  'a dispatcher can set a crew roster');
insert into _tap (line) select throws_ok(
  $$update public.crew_members set is_lead = true$$,
  '23505', null, 'a crew has at most one lead');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.crew_members), 2::bigint, 'a worker can read crew rosters');
insert into _tap (line) select throws_ok(
  $$insert into public.crews (organization_id, name) values ((select id from _ids where key = 'org-a'), 'Truck 2')$$,
  '42501', null, 'a worker cannot add crews');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.crews), 0::bigint, 'another org sees no crews');

select set_config('role', 'postgres', true);
insert into public.crews (organization_id, name) values ((select id from _ids where key = 'org-b'), 'B Truck');
insert into _tap (line) select throws_ok(
  $$insert into public.crew_members (organization_id, crew_id, member_id)
    select c.organization_id, c.id, m.id from public.crews c, public.organization_members m
    where c.name = 'B Truck' and m.display_name = 'Worker A'$$,
  '23503', null, 'a composite FK blocks rostering another org''s member');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
