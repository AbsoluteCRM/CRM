-- pgTAP tests for migration invoices_payments. See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

-- Fixtures (as postgres) ----------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'disp-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f1', 'portal-p@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('Org A', 'org-a');
insert into _ids select slug::text, id from public.organizations where slug = 'org-a';
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-00000000000a', 'owner', 'Owner A'),
  ((select id from _ids where key = 'org-a'), '00000000-0000-0000-0000-0000000000d1', 'dispatcher', 'Dispatcher');
insert into public.clients (organization_id, display_name, tax_exempt) values
  ((select id from _ids where key = 'org-a'), 'Jane', false),
  ((select id from _ids where key = 'org-a'), 'Bob', true);
insert into _ids select 'client-' || lower(display_name), id from public.clients;
insert into public.properties (organization_id, client_id, address_line1, city)
select organization_id, id, display_name || ' St', 'Edmonton' from public.clients;
insert into _ids select 'prop-' || lower(c.display_name), p.id from public.properties p join public.clients c on c.id = p.client_id;
insert into public.client_portal_users (organization_id, client_id, user_id)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'), '00000000-0000-0000-0000-0000000000f1');
insert into public.tax_rates (organization_id, name, percentage) values ((select id from _ids where key = 'org-a'), 'GST', 5);
insert into _ids select 'gst', id from public.tax_rates;

insert into public.jobs (organization_id, client_id, property_id, title, start_date) values
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'), (select id from _ids where key = 'prop-jane'), 'Jane cleanup', '2026-06-03'),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'), (select id from _ids where key = 'prop-jane'), 'Jane pending', '2026-06-04'),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-bob'), (select id from _ids where key = 'prop-bob'), 'Bob cleanup', '2026-06-03');
insert into _ids select 'job-' || replace(lower(title), ' ', ''), id from public.jobs;
insert into public.job_line_items (organization_id, job_id, position, description, unit_price_cents, tax_rate_ids) values
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'job-janecleanup'), 1, 'Mow', 4500, array[(select id from _ids where key = 'gst')]),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'job-janecleanup'), 2, 'Trim', 1500, '{}'),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'job-bobcleanup'), 1, 'Cleanup', 2000, array[(select id from _ids where key = 'gst')]);
insert into _ids select 'v-' || replace(lower(j.title), ' ', ''), v.id from public.visits v join public.jobs j on j.id = v.job_id;
update public.visits set status = 'completed' where job_id in ((select id from _ids where key = 'job-janecleanup'), (select id from _ids where key = 'job-bobcleanup'));

-- Owner creates and issues invoices -------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into _ids select 'inv-jane', public.create_invoice_for_visits(
  (select id from _ids where key = 'client-jane'), array[(select id from _ids where key = 'v-janecleanup')]);
insert into _tap (line) select results_eq(
  $$select number, status::text, subtotal_cents, tax_cents, total_cents from public.invoices where id = (select id from _ids where key = 'inv-jane')$$,
  $$values ('INV-1001', 'draft', 6000::bigint, 225::bigint, 6225::bigint)$$,
  'create_invoice_for_visits copies job lines and taxes into a draft invoice');
insert into _tap (line) select results_eq(
  $$select description from public.invoice_line_items where invoice_id = (select id from _ids where key = 'inv-jane') order by position$$,
  $$values ('Jun 3 – Mow'), ('Jun 3 – Trim')$$,
  'invoice lines are prefixed with the visit date');

insert into _tap (line) select throws_ok(
  $$select public.create_invoice_for_visits((select id from _ids where key = 'client-jane'), array[(select id from _ids where key = 'v-janecleanup')])$$,
  '23505', null, 'a visit cannot be billed on two live invoices');
insert into _tap (line) select throws_ok(
  $$select public.create_invoice_for_visits((select id from _ids where key = 'client-jane'), array[(select id from _ids where key = 'v-janepending')])$$,
  '23514', null, 'only completed visits can be billed');
insert into _tap (line) select throws_ok(
  $$select public.create_invoice_for_visits((select id from _ids where key = 'client-jane'), array[(select id from _ids where key = 'v-bobcleanup')])$$,
  '23514', null, 'a visit can only be billed to its own client');

insert into _ids select 'inv-bob', public.create_invoice_for_visits(
  (select id from _ids where key = 'client-bob'), array[(select id from _ids where key = 'v-bobcleanup')]);
insert into _tap (line) select results_eq(
  $$select subtotal_cents, tax_cents from public.invoices where id = (select id from _ids where key = 'inv-bob')$$,
  $$values (2000::bigint, 0::bigint)$$,
  'tax-exempt clients are invoiced without tax');

update public.invoices set status = 'sent' where id = (select id from _ids where key = 'inv-jane');
insert into _tap (line) select results_eq(
  $$select status::text, issue_date = (now() at time zone 'America/Edmonton')::date, due_date - issue_date, sent_at is not null
    from public.invoices where id = (select id from _ids where key = 'inv-jane')$$,
  $$values ('sent', true, 30, true)$$,
  'sending stamps issue date (org-local), due date (+30 days), and sent_at');
insert into _tap (line) select throws_ok(
  $$update public.invoice_line_items set unit_price_cents = 1 where invoice_id = (select id from _ids where key = 'inv-jane')$$,
  '55000', null, 'lines are frozen once the invoice is issued');
update public.invoices set status = 'paid' where id = (select id from _ids where key = 'inv-jane');
insert into _tap (line) select is(
  (select status::text from public.invoices where id = (select id from _ids where key = 'inv-jane')), 'sent',
  'status is derived from payments, so marking unpaid as paid has no effect');

-- Payments ----------------------------------------------------------------------------
insert into _tap (line) select throws_ok(
  $$insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'inv-bob'), (select id from _ids where key = 'client-bob'), 'cash', 100)$$,
  '55000', null, 'payments cannot be recorded on a draft invoice');
insert into _tap (line) select throws_ok(
  $$insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'inv-jane'), (select id from _ids where key = 'client-bob'), 'cash', 100)$$,
  '23503', null, 'a payment''s client must match its invoice''s client');

insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents, reference)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'inv-jane'), (select id from _ids where key = 'client-jane'), 'cheque', 3000, 'CHQ 104');
insert into _tap (line) select results_eq(
  $$select status::text, amount_paid_cents, balance_cents from public.invoices where id = (select id from _ids where key = 'inv-jane')$$,
  $$values ('partially_paid', 3000::bigint, 3225::bigint)$$,
  'a partial payment makes the invoice partially_paid');

insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'inv-jane'), (select id from _ids where key = 'client-jane'), 'etransfer', 3225);
insert into _tap (line) select results_eq(
  $$select status::text, balance_cents, paid_at is not null from public.invoices where id = (select id from _ids where key = 'inv-jane')$$,
  $$values ('paid', 0::bigint, true)$$,
  'paying the balance makes the invoice paid');

update public.payments set status = 'refunded', refunded_cents = amount_cents where method = 'etransfer';
insert into _tap (line) select results_eq(
  $$select status::text, amount_paid_cents, paid_at is null from public.invoices where id = (select id from _ids where key = 'inv-jane')$$,
  $$values ('partially_paid', 3000::bigint, true)$$,
  'a refund reverts the invoice to partially_paid');
insert into _tap (line) select throws_ok(
  $$update public.invoices set status = 'void' where id = (select id from _ids where key = 'inv-jane')$$,
  '55000', null, 'an invoice with payments cannot be voided');

-- Voiding frees visits -------------------------------------------------------------
update public.invoices set status = 'sent' where id = (select id from _ids where key = 'inv-bob');
update public.invoices set status = 'void', void_reason = 'wrong price' where id = (select id from _ids where key = 'inv-bob');
insert into _tap (line) select ok(
  (select is_void from public.invoice_visits where invoice_id = (select id from _ids where key = 'inv-bob')),
  'voiding marks the invoice''s billed visits void');
insert into _tap (line) select lives_ok(
  $$select public.create_invoice_for_visits((select id from _ids where key = 'client-bob'), array[(select id from _ids where key = 'v-bobcleanup')])$$,
  'a visit from a voided invoice can be billed again');
insert into _tap (line) select throws_ok(
  $$update public.invoices set status = 'sent' where id = (select id from _ids where key = 'inv-bob')$$,
  '23514', null, 'a void invoice cannot be reopened');
delete from public.invoices where client_id = (select id from _ids where key = 'client-bob') and status = 'draft';
insert into _tap (line) select is(
  (select count(*) from public.invoice_visits where visit_id = (select id from _ids where key = 'v-bobcleanup') and not is_void), 0::bigint,
  'deleting a draft invoice unbills its visits');

insert into _tap (line) select throws_ok(
  $$update public.tax_rates set percentage = 6 where id = (select id from _ids where key = 'gst')$$,
  '55000', null, 'a tax rate used on an invoice cannot be edited');

-- Dispatcher and portal ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
insert into _tap (line) select ok((select count(*) from public.invoices) > 0, 'dispatchers can view invoices');
insert into _tap (line) select throws_ok(
  $$select public.create_invoice_for_visits((select id from _ids where key = 'client-bob'), array[(select id from _ids where key = 'v-bobcleanup')])$$,
  '42501', null, 'dispatchers cannot create invoices');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.invoices), 0::bigint, 'portal users cannot read the invoices table');
insert into _tap (line) select results_eq(
  $$select number, status::text, is_overdue, balance_cents from public.portal_my_invoices()$$,
  $$values ('INV-1001', 'partially_paid', false, 3225::bigint)$$,
  'portal_my_invoices lists the client''s issued invoices with balance');
insert into _tap (line) select is(
  (select count(*) from public.portal_invoice_lines((select id from _ids where key = 'inv-jane'))), 2::bigint,
  'portal_invoice_lines lists the lines');
insert into _tap (line) select is((select count(*) from public.portal_my_payments()), 2::bigint, 'portal_my_payments lists payments');

-- Nightly generation -------------------------------------------------------------------
select set_config('role', 'postgres', true);
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'), (select id from _ids where key = 'prop-jane'), 'Jane extra', '2026-06-05');
update public.visits set status = 'completed'
where job_id = (select id from public.jobs where title = 'Jane extra');
select private.run_invoice_generation();
insert into _tap (line) select is(
  (select count(*) from public.invoice_visits iv join public.visits v on v.id = iv.visit_id join public.jobs j on j.id = v.job_id
   where j.title in ('Jane extra', 'Bob cleanup') and not iv.is_void), 2::bigint,
  'the nightly job drafts invoices for completed, unbilled per-visit work');
insert into _tap (line) select is(
  (select count(*) from cron.job where jobname = 'generate-invoices'), 1::bigint, 'the generate-invoices cron job is scheduled');
insert into _tap (line) select throws_ok(
  $$insert into public.stripe_events (id, type, payload) values ('bad_1', 'x', '{}')$$,
  '23514', null, 'stripe_events ids must be Stripe event ids');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
