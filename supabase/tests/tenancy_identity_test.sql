-- pgTAP tests for migration tenancy_identity.
-- Runs inside a transaction that is rolled back, so nothing persists.
--
-- Run it with the Supabase MCP `execute_sql` tool. That tool returns only
-- the last result set, so each assertion goes into _tap, and the final
-- SELECT prints the TAP output.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

-- Fixtures: A and B own separate orgs, C is a worker in A, D is invited to
-- A, and E is a login-less crew member in A.
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local', '{"full_name":"Owner A"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local', '{"full_name":"Owner B"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'worker-c@test.local', '{"full_name":"Worker C"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000d', 'invitee-d@test.local', '{}', 'authenticated', 'authenticated');

insert into _tap (line) select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Owner A', 'auth trigger creates a profile from user metadata');

-- A creates an org -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into _tap (line) select lives_ok(
  $$select public.create_organization('Org A', 'org-a')$$, 'a user can create an organization');
insert into _tap (line) select is(
  (select role::text from public.organization_members where user_id = '00000000-0000-0000-0000-00000000000a'),
  'owner', 'the creator becomes owner');
insert into _tap (line) select is(
  (select timezone from public.organizations where slug = 'org-a'),
  'America/Edmonton', 'default timezone is America/Edmonton');
insert into _tap (line) select throws_ok(
  $$insert into public.organizations (name, slug) values ('Sneaky', 'sneaky')$$,
  '42501', null, 'organizations cannot be inserted directly');

-- B creates an org -------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select public.create_organization('Org B', 'org-b');

select set_config('role', 'postgres', true);
insert into _ids select slug::text, id from public.organizations;
select set_config('role', 'authenticated', true);

insert into _tap (line) select is(
  (select count(*) from public.organizations), 1::bigint, 'B sees only its own organization');
insert into _tap (line) select is(
  (select count(*) from public.organization_members), 1::bigint, 'B sees only its own members');
insert into _tap (line) select throws_ok(
  $$insert into public.organization_members (organization_id, display_name)
    values ((select id from _ids where key = 'org-a'), 'Intruder')$$,
  '42501', null, 'B cannot add a member to org A');

-- A manages staff --------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into _tap (line) select lives_ok(
  $$insert into public.organization_members (organization_id, user_id, role, display_name) values
      ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-00000000000c', 'worker', 'Worker C'),
      ((select id from _ids where key = 'org-a'), null, 'worker', 'Crew E')$$,
  'owner can add a worker and a login-less crew member');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'nobody can change their own role');
insert into _tap (line) select lives_ok(
  $$insert into public.member_pay_rates (organization_id, member_id, hourly_rate_cents, effective_from)
    select organization_id, id, 2500, '2026-01-01' from public.organization_members where display_name = 'Worker C'$$,
  'owner can set a pay rate');

-- Worker C ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

insert into _tap (line) select is(
  (select count(*) from public.organization_members), 3::bigint, 'worker sees the org roster');
insert into _tap (line) select is(
  (select count(*) from public.member_pay_rates), 0::bigint, 'worker cannot see pay rates');
update public.organization_members set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000c';
insert into _tap (line) select is(
  (select role::text from public.organization_members where user_id = '00000000-0000-0000-0000-00000000000c'),
  'worker', 'worker cannot promote themselves (the update matches no rows)');

-- Admin escalation --------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.organization_members set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000c';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);

insert into _tap (line) select throws_ok(
  $$update public.organization_members set role = 'owner' where display_name = 'Crew E'$$,
  '42501', null, 'an admin cannot grant the owner role');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set role = 'worker' where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'an admin cannot demote an owner');

-- Invitations -------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into public.organization_invitations (organization_id, email, role, token_hash)
values ((select id from _ids where key = 'org-a'), 'INVITEE-D@test.local', 'dispatcher',
        encode(extensions.digest('tok-d', 'sha256'), 'hex'));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.accept_invitation('tok-d')$$,
  '22023', null, 'an invitation cannot be accepted by a different email');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
insert into _tap (line) select lives_ok(
  $$select public.accept_invitation('tok-d')$$, 'the invitee can accept (email match is case-insensitive)');
insert into _tap (line) select is(
  (select role::text from public.organization_members where user_id = '00000000-0000-0000-0000-00000000000d'),
  'dispatcher', 'the accepted invitation grants its role');
insert into _tap (line) select throws_ok(
  $$select public.accept_invitation('tok-d')$$,
  '22023', null, 'an invitation cannot be reused');

-- anon ---------------------------------------------------------------------
select set_config('request.jwt.claims', '', true), set_config('role', 'anon', true);
insert into _tap (line) select is(
  (select count(*) from public.organizations), 0::bigint, 'anon sees no organizations');

-- Trusted (postgres) integrity checks ---------------------------------------
select set_config('role', 'postgres', true);

insert into _tap (line) select is(
  private.next_document_number((select id from _ids where key = 'org-a'), 'quote'), 'Q-1001', 'first quote number');
insert into _tap (line) select is(
  private.next_document_number((select id from _ids where key = 'org-a'), 'quote'), 'Q-1002', 'numbers increment');
insert into _tap (line) select is(
  private.next_document_number((select id from _ids where key = 'org-a'), 'invoice'), 'INV-1001', 'sequences are per kind');

insert into _tap (line) select throws_ok(
  $$insert into public.member_pay_rates (organization_id, member_id, hourly_rate_cents, effective_from)
    select (select id from _ids where key = 'org-b'), id, 1, '2026-02-01'
    from public.organization_members where display_name = 'Worker C'$$,
  '23503', null, 'a composite FK blocks cross-tenant references');
insert into _tap (line) select throws_ok(
  $$delete from public.organization_members where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  '23514', null, 'the last active owner cannot be removed');
insert into _tap (line) select throws_ok(
  $$update public.organizations set timezone = 'Mars/Olympus_Mons' where slug = 'org-a'$$,
  '22023', null, 'an invalid timezone is rejected');
insert into _tap (line) select lives_ok(
  $$delete from public.organizations where slug = 'org-b'$$,
  'deleting an organization cascades past the owner guard');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
