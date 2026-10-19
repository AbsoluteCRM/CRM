-- pgTAP tests for the quote_line_frequency migration.
-- Hermetic: its own org ('pgtap-f') and users. See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'pgtap-f-owner@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('PgTap F', 'pgtap-f');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-f';
insert into public.organization_members (organization_id, user_id, role, display_name)
values ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000f1', 'owner', 'Owner');

insert into public.services (organization_id, name) values ((select id from _ids where key = 'org'), 'Mowing');
insert into public.requests (organization_id, service_id, contact_name, contact_email, address)
values ((select id from _ids where key = 'org'),
        (select id from public.services where organization_id = (select id from _ids where key = 'org')), 'Fran Freq', 'fran@example.com', '1 Pine St, Edmonton');
insert into _ids select 'req', id from public.requests where contact_name = 'Fran Freq';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _ids select 'q1', public.create_quote_draft((select id from _ids where key = 'req'));

-- Staff can write the new columns on a draft ----------------------------------------------------
insert into _tap (line) select lives_ok(
  $$insert into public.quote_line_items
      (organization_id, quote_id, description, quantity, unit_price_cents, position, frequency, season_start_month, season_end_month)
    select organization_id, id, 'Mow', 1, 5000, 1, 'weekly', 5, 9 from public.quotes
    where id = (select id from _ids where key = 'q1')$$,
  'staff can set frequency and months on a draft line');
insert into _tap (line) select lives_ok(
  $$insert into public.quote_line_items
      (organization_id, quote_id, description, quantity, unit_price_cents, position, season_start_month, season_end_month)
    select organization_id, id, 'Winter plow', 1, 9000, 2, 11, 3 from public.quotes
    where id = (select id from _ids where key = 'q1')$$,
  'a season can wrap over new year');
insert into _tap (line) select is(
  (select frequency::text from public.quote_line_items where description = 'Winter plow'), 'one_time',
  'frequency defaults to one_time');

-- Constraints ---------------------------------------------------------------------------------
insert into _tap (line) select throws_ok(
  $$update public.quote_line_items set season_start_month = null where description = 'Mow'$$,
  '23514', null, 'start without end is rejected');
insert into _tap (line) select throws_ok(
  $$update public.quote_line_items set season_start_month = 13, season_end_month = 14 where description = 'Mow'$$,
  '23514', null, 'months outside 1-12 are rejected');
insert into _tap (line) select lives_ok(
  $$update public.quote_line_items set season_start_month = null, season_end_month = null, frequency = 'monthly'
    where description = 'Mow'$$,
  'both months null is year-round');
update public.quote_line_items set frequency = 'weekly', season_start_month = 5, season_end_month = 9
where description = 'Mow';

-- Copying a revision keeps them -----------------------------------------------------------------
insert into _ids select 'q2', public.create_quote_draft(
  (select id from _ids where key = 'req'), (select id from _ids where key = 'q1'));
insert into _tap (line) select is(
  (select frequency::text || season_start_month || '-' || season_end_month from public.quote_line_items
   where quote_id = (select id from _ids where key = 'q2') and description = 'Mow'),
  'weekly5-9', 'a copied revision keeps frequency and months');

-- Frozen after send, and returned to the client ----------------------------------------------------
update public.quotes set valid_until = current_date + 14 where id = (select id from _ids where key = 'q1');
insert into _ids select 'tok', public.send_quote((select id from _ids where key = 'q1'), repeat('c', 64));
insert into _tap (line) select throws_ok(
  $$update public.quote_line_items set frequency = 'monthly' where description = 'Mow'
    and quote_id = (select id from _ids where key = 'q1')$$,
  null, null, 'frequency is frozen once the quote is sent');
insert into _tap (line) select throws_ok(
  $$update public.quote_line_items set season_end_month = 10 where description = 'Mow'
    and quote_id = (select id from _ids where key = 'q1')$$,
  null, null, 'months are frozen once the quote is sent');

select set_config('role', 'service_role', true);
insert into _tap (line) select is(
  (select l ->> 'frequency' from jsonb_array_elements(
     public.portal_token_get_quote(repeat('c', 64)) -> 'lines') l where l ->> 'description' = 'Mow'),
  'weekly', 'the portal JSON includes frequency');
insert into _tap (line) select is(
  (select (l ->> 'season_start_month') || '-' || (l ->> 'season_end_month') from jsonb_array_elements(
     public.portal_token_get_quote(repeat('c', 64)) -> 'lines') l where l ->> 'description' = 'Mow'),
  '5-9', 'the portal JSON includes the months');
select set_config('role', 'postgres', true);

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
