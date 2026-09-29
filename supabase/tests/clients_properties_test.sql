-- pgTAP tests for migration clients_properties. See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

-- Fixtures, created as postgres: org A has an owner, a dispatcher, and a
-- worker. Org B has an owner. P is a portal login.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'disp-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'worker-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f1', 'portal-p@test.local', 'authenticated', 'authenticated');

insert into public.organizations (id, name, slug) values
  (private.uuid_generate_v7(), 'Org A', 'org-a'),
  (private.uuid_generate_v7(), 'Org B', 'org-b');
insert into _ids select slug::text, id from public.organizations where slug in ('org-a', 'org-b');

insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-00000000000a', 'owner', 'Owner A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000d1', 'dispatcher', 'Dispatcher A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000c1', 'worker', 'Worker A'),
  ((select id from _ids where key = 'org-b'), '00000000-0000-0000-0000-00000000000b', 'owner', 'Owner B');

-- Dispatcher A ---------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into _tap (line) select lives_ok(
  $$insert into public.clients (organization_id, display_name, notes)
    values ((select id from _ids where key = 'org-a'), 'Jane Smith', 'internal: slow payer')$$,
  'a dispatcher can add a client');
insert into _tap (line) select lives_ok(
  $$insert into public.properties (organization_id, client_id, address_line1, city, location)
    select organization_id, id, '10 Jasper Ave', 'Edmonton', 'SRID=4326;POINT(-113.4938 53.5461)'
    from public.clients where display_name = 'Jane Smith'$$,
  'a dispatcher can add a property');
insert into _tap (line) select lives_ok(
  $$insert into public.client_contacts (organization_id, client_id, name, is_primary)
    select organization_id, id, 'Jane', true from public.clients where display_name = 'Jane Smith'$$,
  'a dispatcher can add a contact');
insert into _tap (line) select throws_ok(
  $$insert into public.client_contacts (organization_id, client_id, name, is_primary)
    select organization_id, id, 'John', true from public.clients where display_name = 'Jane Smith'$$,
  '23505', null, 'a client has at most one primary contact');
insert into _tap (line) select throws_ok(
  $$insert into public.clients (organization_id, kind, display_name)
    values ((select id from _ids where key = 'org-a'), 'company', 'Acme')$$,
  '23514', null, 'a company client requires company_name');
insert into _tap (line) select is(
  (select round(latitude::numeric, 4) from public.properties where address_line1 = '10 Jasper Ave'),
  53.5461, 'latitude is generated from location');

select set_config('role', 'postgres', true);
insert into _ids select 'client-jane', id from public.clients where display_name = 'Jane Smith';
insert into public.client_portal_users (organization_id, client_id, user_id)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'),
        '00000000-0000-0000-0000-0000000000f1');

-- Worker A: no client access until routing assigns visits -------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select is(
  (select count(*) from public.clients), 0::bigint, 'a worker sees no clients without routed visits');
insert into _tap (line) select throws_ok(
  $$insert into public.clients (organization_id, display_name) values ((select id from _ids where key = 'org-a'), 'W')$$,
  '42501', null, 'a worker cannot add clients');

-- Owner B: tenant isolation ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into _tap (line) select is(
  (select count(*) from public.clients), 0::bigint, 'another org sees none of org A''s clients');
insert into _tap (line) select is(
  (select count(*) from public.properties), 0::bigint, 'another org sees none of org A''s properties');
insert into _tap (line) select throws_ok(
  $$insert into public.clients (organization_id, display_name) values ((select id from _ids where key = 'org-a'), 'X')$$,
  '42501', null, 'another org cannot add a client to org A');

-- Portal user P ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
insert into _tap (line) select is(
  (select count(*) from public.clients), 0::bigint, 'a portal user cannot read the clients table (internal notes stay hidden)');
insert into _tap (line) select is(
  (select display_name from public.portal_my_clients()), 'Jane Smith', 'portal_my_clients returns the linked client');
insert into _tap (line) select is(
  (select count(*) from public.portal_my_properties()), 1::bigint, 'portal_my_properties returns the client''s properties');
insert into _tap (line) select is(
  (select count(*) from public.client_portal_users), 1::bigint, 'a portal user sees their own portal link');

-- anon -------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true), set_config('role', 'anon', true);
insert into _tap (line) select throws_ok(
  $$select * from public.portal_my_clients()$$, '42501', null, 'anon cannot call portal RPCs');

-- Trusted integrity checks -----------------------------------------------------
select set_config('role', 'postgres', true);
insert into _tap (line) select throws_ok(
  $$insert into public.properties (organization_id, client_id, address_line1, city)
    values ((select id from _ids where key = 'org-b'), (select id from _ids where key = 'client-jane'), '1 Main', 'Calgary')$$,
  '23503', null, 'a composite FK blocks a property pointing at another org''s client');
insert into _tap (line) select throws_ok(
  $$delete from public.clients where id = (select id from _ids where key = 'client-jane')$$,
  '23503', null, 'a client with properties cannot be deleted (archive instead)');

update public.clients set archived_at = now() where id = (select id from _ids where key = 'client-jane');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select is(
  (select count(*) from public.portal_my_clients()), 0::bigint, 'archived clients disappear from the portal');

select set_config('role', 'postgres', true);
insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
