-- pgTAP tests for migration quotes. See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

-- Fixtures (as postgres) ----------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'disp-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'worker-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f1', 'portal-p@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('Org A', 'org-a'), ('Org B', 'org-b');
insert into _ids select slug::text, id from public.organizations where slug in ('org-a', 'org-b');
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org-a'), null, 'owner', 'Owner A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000d1', 'dispatcher', 'Dispatcher A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000c1', 'worker', 'Worker A'),
  ((select id from _ids where key = 'org-b'), '00000000-0000-0000-0000-00000000000b', 'owner', 'Owner B');

insert into public.clients (organization_id, display_name) values
  ((select id from _ids where key = 'org-a'), 'Jane'),
  ((select id from _ids where key = 'org-a'), 'Bob');
insert into _ids select 'client-' || lower(display_name), id from public.clients;
insert into public.properties (organization_id, client_id, address_line1, city)
select organization_id, id, display_name || ' St', 'Edmonton' from public.clients;
insert into _ids select 'prop-' || lower(c.display_name), p.id
from public.properties p join public.clients c on c.id = p.client_id;
insert into public.client_portal_users (organization_id, client_id, user_id)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'),
        '00000000-0000-0000-0000-0000000000f1');
insert into public.tax_rates (organization_id, name, percentage) values
  ((select id from _ids where key = 'org-a'), 'GST', 5),
  ((select id from _ids where key = 'org-a'), 'PST', 7);
insert into _ids select 'tax-' || lower(name), id from public.tax_rates;

-- Dispatcher builds a quote ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into public.quotes (organization_id, client_id, property_id, title)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'),
        (select id from _ids where key = 'prop-jane'), 'Spring cleanup');
insert into _tap (line) select is(
  (select number from public.quotes where title = 'Spring cleanup'), 'Q-1001', 'quotes are numbered from the org sequence');
insert into _tap (line) select is(
  (select created_by from public.quotes where title = 'Spring cleanup'),
  '00000000-0000-0000-0000-0000000000d1'::uuid, 'created_by defaults to the caller');
insert into _tap (line) select throws_ok(
  $$insert into public.quotes (organization_id, client_id, property_id, title)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'),
            (select id from _ids where key = 'prop-bob'), 'Wrong property')$$,
  '23503', null, 'a quote''s property must belong to its client');

select set_config('role', 'postgres', true);
insert into _ids select 'quote-1', id from public.quotes where title = 'Spring cleanup';
select set_config('role', 'authenticated', true);

insert into public.quote_line_items (organization_id, quote_id, position, description, quantity, unit_price_cents, is_optional)
values
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'quote-1'), 1, 'Mowing', 1, 4500, false),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'quote-1'), 2, 'Mulch (bags)', 2.5, 1999, false),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'quote-1'), 3, 'Aeration (optional)', 1, 10000, true);
insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
select l.organization_id, l.id, t.id
from public.quote_line_items l, public.tax_rates t
where (l.position = 1) or (l.position = 2 and t.name = 'GST');

insert into _tap (line) select is(
  (select amount_cents from public.quote_line_items where position = 2), 4998::bigint,
  'line amount = round(2.5 × 1999)');
insert into _tap (line) select results_eq(
  $$select subtotal_cents, tax_cents, total_cents from public.quotes where id = (select id from _ids where key = 'quote-1')$$,
  $$values (9498::bigint, 790::bigint, 10288::bigint)$$,
  'totals: optional lines excluded; tax computed per line, per rate (225 + 315 + 250)');

update public.quote_line_items set quantity = 2 where position = 1;
insert into _tap (line) select results_eq(
  $$select subtotal_cents, tax_cents from public.quotes where id = (select id from _ids where key = 'quote-1')$$,
  $$values (13998::bigint, 1330::bigint)$$,
  'changing a line recomputes its taxes and the quote totals');

insert into _tap (line) select throws_ok(
  $$update public.quotes set status = 'approved' where id = (select id from _ids where key = 'quote-1')$$,
  '23514', null, 'a draft cannot jump straight to approved');
update public.quotes set status = 'sent', valid_until = current_date + 30 where id = (select id from _ids where key = 'quote-1');
insert into _tap (line) select isnt(
  (select sent_at from public.quotes where id = (select id from _ids where key = 'quote-1')), null, 'sending stamps sent_at');
insert into _tap (line) select throws_ok(
  $$update public.quote_line_items set unit_price_cents = 1 where position = 1$$,
  '55000', null, 'lines are frozen once the quote is sent');
delete from public.quotes where id = (select id from _ids where key = 'quote-1');
insert into _tap (line) select is(
  (select count(*) from public.quotes where id = (select id from _ids where key = 'quote-1')), 1::bigint,
  'a sent quote cannot be deleted');

-- Worker and other tenant -----------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.quotes), 0::bigint, 'workers cannot see quotes');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.quotes), 0::bigint, 'another org cannot see quotes');

-- Portal user approves --------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.quotes), 0::bigint, 'portal users cannot read the quotes table');
insert into _tap (line) select is((select count(*) from public.portal_my_quotes()), 1::bigint, 'portal_my_quotes lists sent quotes');
insert into _tap (line) select is(
  (select count(*) from public.portal_quote_lines((select id from _ids where key = 'quote-1'))), 3::bigint,
  'portal_quote_lines lists the lines');
insert into _tap (line) select lives_ok(
  $$select public.approve_quote(
      (select id from _ids where key = 'quote-1'),
      (select array_agg(line_item_id) from public.portal_quote_lines((select id from _ids where key = 'quote-1')) where is_optional))$$,
  'the portal user can approve, selecting the optional line');
insert into _tap (line) select results_eq(
  $$select status::text, subtotal_cents from public.portal_my_quotes()$$,
  $$values ('approved', 23998::bigint)$$,
  'the approved quote includes the selected optional line');
insert into _tap (line) select throws_ok(
  $$select public.decline_quote((select id from _ids where key = 'quote-1'), 'changed my mind')$$,
  '55000', null, 'an approved quote cannot be declined');

-- Trusted checks -------------------------------------------------------------------
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select approved_by_user_id from public.quotes where id = (select id from _ids where key = 'quote-1')),
  '00000000-0000-0000-0000-0000000000f1'::uuid, 'approval records the portal user');
insert into _tap (line) select throws_ok(
  $$update public.tax_rates set percentage = 6 where name = 'GST'$$,
  '55000', null, 'a tax rate used on a quote cannot be edited');

update public.clients set tax_exempt = true where display_name = 'Bob';
insert into public.quotes (organization_id, client_id, title, status, valid_until)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-bob'), 'Bob job', 'draft', current_date - 1);
insert into public.quote_line_items (organization_id, quote_id, position, description, unit_price_cents)
select organization_id, id, 1, 'Work', 1000 from public.quotes where title = 'Bob job';
insert into _tap (line) select throws_ok(
  $$insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
    select l.organization_id, l.id, (select id from _ids where key = 'tax-gst')
    from public.quote_line_items l join public.quotes q on q.id = l.quote_id where q.title = 'Bob job'$$,
  '23514', null, 'tax cannot be added for a tax-exempt client');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.approve_quote('00000000-0000-0000-0000-000000000000')$$,
  'P0002', null, 'a portal user cannot approve an unknown quote');
select set_config('role', 'postgres', true);

update public.quotes set status = 'sent' where title = 'Bob job';
-- The same statement the expire-quotes cron job runs:
update public.quotes q set status = 'expired'
from public.organizations o
where o.id = q.organization_id and q.status = 'sent'
  and q.valid_until < (now() at time zone o.timezone)::date;
insert into _tap (line) select is(
  (select status::text from public.quotes where title = 'Bob job'), 'expired', 'the expiry job expires past-due sent quotes');
insert into _tap (line) select is(
  (select count(*) from cron.job where jobname = 'expire-quotes'), 1::bigint, 'the expire-quotes cron job is scheduled');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
