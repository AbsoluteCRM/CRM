-- Hermetic precipitation settings tests. All fixtures roll back.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;
select no_plan();

insert into auth.users (id, email, aud, role)
select ('00000000-0000-0000-0000-00000000ab0' || n)::uuid,
       'precip-' || n || '@test.local', 'authenticated', 'authenticated'
from generate_series(1, 6) n;
insert into public.organizations (name, slug) values
  ('Precipitation A', 'pgtap-precip-a'), ('Precipitation B', 'pgtap-precip-b');
insert into _ids select 'a', id from public.organizations where slug = 'pgtap-precip-a';
insert into _ids select 'b', id from public.organizations where slug = 'pgtap-precip-b';
insert into public.organization_members (organization_id, user_id, role, display_name)
select (select id from _ids where key = 'a'),
       ('00000000-0000-0000-0000-00000000ab0' || n)::uuid,
       role::public.org_role, role
from (values (1, 'owner'), (2, 'admin'), (3, 'dispatcher'), (4, 'worker')) r(n, role);
insert into public.services (organization_id, name)
select id, 'Existing' from _ids where key in ('a', 'b');
insert into _ids select 'service-a', id from public.services
where organization_id = (select id from _ids where key = 'a');
insert into _ids select 'service-b', id from public.services
where organization_id = (select id from _ids where key = 'b');
insert into public.clients (organization_id, display_name)
values ((select id from _ids where key = 'a'), 'Portal client');
insert into public.client_portal_users (organization_id, client_id, user_id)
select organization_id, id, '00000000-0000-0000-0000-00000000ab06'::uuid
from public.clients where organization_id = (select id from _ids where key = 'a');

insert into _tap (line) select is(
  (select precipitation_type::text || '/' || precipitation_action::text
   from public.services where id = (select id from _ids where key = 'service-a')),
  'none/none', 'omitted settings default to disabled');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab01","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into _tap (line) select lives_ok(format(
  'insert into public.services (organization_id, name, precipitation_type, precipitation_action) values (%L, %L, %L, %L)',
  (select id from _ids where key = 'a'), t || '-' || a, t, a),
  'owner can create ' || t || '/' || a)
from (values ('rain'), ('snow'), ('any')) types(t)
cross join (values ('schedule'), ('reschedule')) actions(a);

insert into _tap (line) select throws_ok(
  $$update public.services set precipitation_type = 'rain' where id = (select id from _ids where key = 'service-a')$$,
  '23514', null, 'enabled type with no action rejected');
insert into _tap (line) select throws_ok(
  $$update public.services set precipitation_action = 'schedule' where id = (select id from _ids where key = 'service-a')$$,
  '23514', null, 'action with no type rejected');
insert into _tap (line) select throws_ok(
  $$update public.services set precipitation_type = null where id = (select id from _ids where key = 'service-a')$$,
  '23502', null, 'null type rejected');
insert into _tap (line) select throws_ok(
  $$update public.services set precipitation_action = null where id = (select id from _ids where key = 'service-a')$$,
  '23502', null, 'null action rejected');
insert into _tap (line) select throws_ok(
  $$update public.services set precipitation_type = 'hail' where id = (select id from _ids where key = 'service-a')$$,
  '22P02', null, 'unknown type rejected');
insert into _tap (line) select throws_ok(
  $$update public.services set precipitation_action = 're_schedule' where id = (select id from _ids where key = 'service-a')$$,
  '22P02', null, 'unknown action rejected');
insert into _tap (line) select lives_ok(
  $$update public.services set precipitation_type = 'snow', precipitation_action = 'schedule' where id = (select id from _ids where key = 'service-a')$$,
  'owner can update both columns');
insert into _tap (line) select is(
  (select count(*) from public.services where organization_id = (select id from _ids where key = 'b')),
  0::bigint, 'owner cannot read another tenant');
insert into _tap (line) select results_eq(
  $$update public.services set precipitation_type = 'snow', precipitation_action = 'schedule' where id = (select id from _ids where key = 'service-b') returning id$$,
  $$select id from _ids where false$$, 'owner cannot update another tenant');
insert into _tap (line) select throws_ok(
  $$insert into public.services (organization_id, name, precipitation_type, precipitation_action)
    values ((select id from _ids where key = 'b'), 'Intrusion', 'rain', 'reschedule')$$,
  '42501', null, 'owner cannot insert into another tenant');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ab02","role":"authenticated"}', true);
insert into _tap (line) select lives_ok(
  $$insert into public.services (organization_id, name, precipitation_type, precipitation_action)
    values ((select id from _ids where key = 'a'), 'Admin service', 'rain', 'reschedule')$$,
  'admin can create with precipitation columns');
insert into _tap (line) select lives_ok(
  $$update public.services set precipitation_type = 'rain', precipitation_action = 'reschedule' where id = (select id from _ids where key = 'service-a')$$,
  'admin can update both columns');
insert into _tap (line) select lives_ok(
  $$update public.services set precipitation_type = 'none', precipitation_action = 'none' where id = (select id from _ids where key = 'service-a')$$,
  'admin can clear the preference');

-- Dispatcher, worker, nonmember, and portal-only user cannot write settings.
do $$
declare
  actor record;
begin
  for actor in select * from (values (3, 'dispatcher'), (4, 'worker'), (5, 'nonmember'), (6, 'portal')) a(n, label)
  loop
    perform set_config('request.jwt.claims', json_build_object(
      'sub', '00000000-0000-0000-0000-00000000ab0' || actor.n, 'role', 'authenticated')::text, true);
    insert into _tap (line) select throws_ok(
      $q$insert into public.services (organization_id, name, precipitation_type, precipitation_action)
         values ((select id from _ids where key = 'a'), 'Forbidden', 'rain', 'reschedule')$q$,
      '42501', null, actor.label || ' cannot create');
    insert into _tap (line) select results_eq(
      $q$update public.services set precipitation_type = 'snow', precipitation_action = 'schedule'
         where id = (select id from _ids where key = 'service-a') returning id$q$,
      $q$select id from _ids where false$q$, actor.label || ' cannot update');
    if actor.n >= 5 then
      insert into _tap (line) select is((select count(*) from public.services), 0::bigint,
        actor.label || ' cannot read settings');
    end if;
  end loop;
end;
$$;

select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select precipitation_type::text || '/' || precipitation_action::text
   from public.services where id = (select id from _ids where key = 'service-b')),
  'none/none', 'cross-tenant attempts did not alter settings');
insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;
rollback;
