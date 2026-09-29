-- pgTAP tests for migration catalog_tax. See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'disp-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'worker-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('Org A', 'org-a'), ('Org B', 'org-b');
insert into _ids select slug::text, id from public.organizations where slug in ('org-a', 'org-b');
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-00000000000a', 'owner', 'Owner A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000d1', 'dispatcher', 'Dispatcher A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000c1', 'worker', 'Worker A'),
  ((select id from _ids where key = 'org-b'), '00000000-0000-0000-0000-00000000000b', 'owner', 'Owner B');

-- Owner A sets up the catalog ------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select lives_ok(
  $$insert into public.services (organization_id, name, unit, default_price_cents, default_duration_minutes)
    values ((select id from _ids where key = 'org-a'), 'Weekly mowing', 'visit', 4500, 45)$$,
  'an owner can add a service');
insert into _tap (line) select lives_ok(
  $$insert into public.tax_rates (organization_id, name, percentage, registration_number)
    values ((select id from _ids where key = 'org-a'), 'GST', 5, '123456789RT0001')$$,
  'an owner can add a tax rate');
insert into _tap (line) select lives_ok(
  $$insert into public.service_default_taxes (organization_id, service_id, tax_rate_id)
    select s.organization_id, s.id, t.id from public.services s, public.tax_rates t$$,
  'an owner can set a service''s default taxes');
insert into _tap (line) select throws_ok(
  $$insert into public.services (organization_id, name) values ((select id from _ids where key = 'org-a'), 'WEEKLY MOWING')$$,
  '23505', null, 'service names are unique per org, case-insensitively');
insert into _tap (line) select throws_ok(
  $$insert into public.tax_rates (organization_id, name, percentage) values ((select id from _ids where key = 'org-a'), 'Bad', 101)$$,
  '23514', null, 'a percentage above 100 is rejected');

-- Dispatcher reads, but cannot write -----------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.tax_rates), 1::bigint, 'a dispatcher can read tax rates');
insert into _tap (line) select throws_ok(
  $$insert into public.services (organization_id, name) values ((select id from _ids where key = 'org-a'), 'Snow')$$,
  '42501', null, 'a dispatcher cannot add services');

-- Worker ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.services), 1::bigint, 'a worker can read services');
insert into _tap (line) select is((select count(*) from public.tax_rates), 0::bigint, 'a worker cannot read tax rates');

-- Other tenant -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.services), 0::bigint, 'another org sees no services');

select set_config('role', 'postgres', true);
insert into _tap (line) select throws_ok(
  $$insert into public.service_default_taxes (organization_id, service_id, tax_rate_id)
    select (select id from _ids where key = 'org-b'), s.id, t.id from public.services s, public.tax_rates t$$,
  '23503', null, 'a composite FK blocks cross-tenant default taxes');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
