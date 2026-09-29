-- pgTAP tests for the org-files storage bucket policies (migration
-- jobs_visits). See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
grant all on _tap, _tap_n_seq to authenticated, anon;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'disp-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'worker-a@test.local', 'authenticated', 'authenticated');
insert into public.organizations (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 'org-a'),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 'org-b');
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ('11111111-1111-1111-1111-111111111111', null, 'owner', 'Owner A'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000d1', 'dispatcher', 'D'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000c1', 'worker', 'W');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('org-files', '11111111-1111-1111-1111-111111111111/visits/a.jpg')$$,
  'staff can upload into their org''s folder');
insert into _tap (line) select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('org-files', '22222222-2222-2222-2222-222222222222/x.jpg')$$,
  '42501', null, 'staff cannot upload into another org''s folder');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into _tap (line) select is(
  (select count(*) from storage.objects where bucket_id = 'org-files'), 1::bigint, 'workers can read their org''s files');

select set_config('request.jwt.claims', '', true), set_config('role', 'anon', true);
insert into _tap (line) select is(
  (select count(*) from storage.objects where bucket_id = 'org-files'), 0::bigint, 'anon cannot read org files');

select set_config('role', 'postgres', true);
insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
