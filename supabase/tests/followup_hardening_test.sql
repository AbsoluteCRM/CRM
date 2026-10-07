-- pgTAP tests for the followup_hardening migration. Hermetic: its own orgs
-- ('pgtap-c', 'pgtap-d'). Concurrency itself can't be exercised on one
-- connection; these check the observable rules the locks protect.
-- See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

insert into public.organizations (name, slug) values ('PgTap C', 'pgtap-c'), ('PgTap D', 'pgtap-d');
insert into _ids select slug, id from public.organizations where slug in ('pgtap-c', 'pgtap-d');

insert into public.crews (organization_id, name) values
  ((select id from _ids where key = 'pgtap-c'), 'C crew'),
  ((select id from _ids where key = 'pgtap-d'), 'D crew');
insert into _ids select 'crew-' || lower(left(name, 1)), id from public.crews
where organization_id in (select id from _ids where key in ('pgtap-c', 'pgtap-d'));

insert into public.clients (organization_id, display_name) values ((select id from _ids where key = 'pgtap-c'), 'Jane');
insert into _ids select 'client', id from public.clients where organization_id = (select id from _ids where key = 'pgtap-c');
insert into public.properties (organization_id, client_id, address_line1, city)
values ((select id from _ids where key = 'pgtap-c'), (select id from _ids where key = 'client'), '1 Main St', 'Edmonton');
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select organization_id, client_id, id, 'Mow', '2026-06-03' from public.properties
where organization_id = (select id from _ids where key = 'pgtap-c');
insert into _ids select 'visit', v.id from public.visits v
where v.organization_id = (select id from _ids where key = 'pgtap-c');
update public.visits set status = 'completed' where id = (select id from _ids where key = 'visit');
insert into public.job_line_items (organization_id, job_id, position, description, unit_price_cents)
select organization_id, job_id, 1, 'Mow', 4500 from public.visits where id = (select id from _ids where key = 'visit');

select set_config('request.jwt.claims', '', true);
insert into _ids select 'invoice', public.create_invoice_for_visits(
  (select id from _ids where key = 'client'), array[(select id from _ids where key = 'visit')]);
update public.invoices set status = 'sent' where id = (select id from _ids where key = 'invoice');
insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents)
values ((select id from _ids where key = 'pgtap-c'), (select id from _ids where key = 'invoice'), (select id from _ids where key = 'client'), 'cash', 4500);
insert into _ids select 'payment', id from public.payments where organization_id = (select id from _ids where key = 'pgtap-c');

insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents, status)
values ((select id from _ids where key = 'pgtap-c'), (select id from _ids where key = 'invoice'), (select id from _ids where key = 'client'), 'cash', 100, 'pending');
insert into _ids select 'pending', id from public.payments where status = 'pending' and organization_id = (select id from _ids where key = 'pgtap-c');

-- A fully refunded invoice can be voided, and then its payments are frozen ----------
update public.payments set status = 'refunded', refunded_cents = 4500 where id = (select id from _ids where key = 'payment');
update public.invoices set status = 'void' where id = (select id from _ids where key = 'invoice');
insert into _tap (line) select is(
  (select status::text from public.invoices where id = (select id from _ids where key = 'invoice')), 'void',
  'a fully refunded invoice can be voided');
insert into _tap (line) select throws_ok(
  $$update public.payments set status = 'succeeded', refunded_cents = 0 where id = (select id from _ids where key = 'payment')$$,
  '55000', null, 'a payment can''t be revived on a void invoice');
insert into _tap (line) select lives_ok(
  $$update public.payments set notes = 'refunded by cheque' where id = (select id from _ids where key = 'payment')$$,
  'a void invoice''s payment notes can still be edited');
insert into _tap (line) select throws_ok(
  $$insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents)
    values ((select id from _ids where key = 'pgtap-c'), (select id from _ids where key = 'invoice'), (select id from _ids where key = 'client'), 'cash', 100)$$,
  '55000', null, 'a payment can''t be added to a void invoice');

insert into _tap (line) select lives_ok(
  $$update public.payments set status = 'failed' where id = (select id from _ids where key = 'pending')$$,
  'a pending payment can still settle after its invoice is voided');

-- Optimizer runs only name their own organization's crews --------------------------
insert into _tap (line) select lives_ok(
  $$insert into public.optimization_runs (organization_id, route_date, provider, crew_ids)
    values ((select id from _ids where key = 'pgtap-c'), '2026-06-03', 'vroom', array[(select id from _ids where key = 'crew-c')])$$,
  'a run can list its own crews');
insert into _tap (line) select throws_ok(
  $$insert into public.optimization_runs (organization_id, route_date, provider, crew_ids)
    values ((select id from _ids where key = 'pgtap-c'), '2026-06-03', 'vroom', array[(select id from _ids where key = 'crew-d')])$$,
  '23503', null, 'a run can''t list another organization''s crew');
insert into _tap (line) select throws_ok(
  $$insert into public.optimization_runs (organization_id, route_date, provider, unassigned_visit_ids)
    values ((select id from _ids where key = 'pgtap-d'), '2026-06-03', 'vroom', array[(select id from _ids where key = 'visit')])$$,
  '23503', null, 'a run can''t list another organization''s visit');

-- Billing and routing guards still accept the normal path ---------------------------
insert into public.routes (organization_id, crew_id, route_date)
values ((select id from _ids where key = 'pgtap-c'), (select id from _ids where key = 'crew-c'), '2026-06-03');
insert into _tap (line) select lives_ok(
  $$insert into public.route_stops (organization_id, route_id, visit_id, sequence)
    select organization_id, id, (select id from _ids where key = 'visit'), 1 from public.routes
    where organization_id = (select id from _ids where key = 'pgtap-c')$$,
  'a visit can be routed on its scheduled date');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
