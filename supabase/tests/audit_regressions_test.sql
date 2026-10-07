-- pgTAP regression tests for the 2026-10-01 schema audit (ADR 0010 and 0011).
-- Hermetic: every fixture is created here (org slug 'pgtap-a') and every id
-- is captured from those rows, so it doesn't depend on seed data.
-- See supabase/tests/README.md.

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon;

select no_plan();

-- Fixtures (as postgres) ----------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'pgtap-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'pgtap-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'pgtap-worker1@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'pgtap-worker2@test.local', 'authenticated', 'authenticated');

insert into public.organizations (name, slug) values ('PgTap A', 'pgtap-a');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-a';

insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000a1', 'owner', 'Owner'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000a2', 'admin', 'Admin'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000a3', 'worker', 'Worker 1'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000a4', 'worker', 'Worker 2');
insert into _ids
select 'm-' || replace(lower(display_name), ' ', ''), id
from public.organization_members where organization_id = (select id from _ids where key = 'org');

insert into public.crews (organization_id, name) values
  ((select id from _ids where key = 'org'), 'Truck 1'),
  ((select id from _ids where key = 'org'), 'Truck 2');
insert into _ids select 'crew-' || replace(lower(name), ' ', ''), id
from public.crews where organization_id = (select id from _ids where key = 'org');
insert into public.crew_members (organization_id, crew_id, member_id) values
  ((select id from _ids where key = 'org'), (select id from _ids where key = 'crew-truck1'), (select id from _ids where key = 'm-worker1'));

insert into public.clients (organization_id, display_name, notes)
values ((select id from _ids where key = 'org'), 'Jane', 'INTERNAL: pays late');
insert into _ids select 'client', id from public.clients where organization_id = (select id from _ids where key = 'org');
insert into public.properties (organization_id, client_id, address_line1, city, access_notes)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'client'), '1 Main St', 'Edmonton', 'Gate 1234');

insert into public.tax_rates (organization_id, name, percentage) values
  ((select id from _ids where key = 'org'), 'GST', 5),
  ((select id from _ids where key = 'org'), 'OLD', 7);
insert into _ids select 'tax-' || lower(name), id from public.tax_rates where organization_id = (select id from _ids where key = 'org');

insert into public.jobs (organization_id, client_id, property_id, title, start_date, window_start, window_minutes)
select organization_id, client_id, id, 'Mow', '2026-06-03', '08:00', 240
from public.properties where organization_id = (select id from _ids where key = 'org');
insert into _ids select 'job', id from public.jobs where organization_id = (select id from _ids where key = 'org');
with l as (
  insert into public.job_line_items (organization_id, job_id, position, description, unit_price_cents)
  values ((select id from _ids where key = 'org'), (select id from _ids where key = 'job'), 1, 'Mow', 4500)
  returning id, organization_id
)
insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id)
select organization_id, id, (select id from _ids where key = 'tax-gst') from l;
insert into _ids select 'visit', id from public.visits where organization_id = (select id from _ids where key = 'org');

insert into public.routes (organization_id, crew_id, route_date, status)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'crew-truck1'), '2026-06-03', 'draft');
insert into _ids select 'route', id from public.routes where organization_id = (select id from _ids where key = 'org');
insert into public.route_stops (organization_id, route_id, visit_id, sequence)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'route'), (select id from _ids where key = 'visit'), 1);

-- Invariants (as postgres) --------------------------------------------------
insert into _tap (line) select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity), 0::bigint,
  'every public table has RLS enabled');
insert into _tap (line) select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  0::bigint, 'no private function is executable by PUBLIC');
insert into _tap (line) select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname <> 'rls_auto_enable' and has_function_privilege('anon', p.oid, 'execute')),
  0::bigint, 'anon can execute no public function (except the Supabase-managed rls_auto_enable)');
insert into _tap (line) select is(
  (select count(*) from information_schema.column_privileges
   where table_schema = 'public' and column_name = 'organization_id' and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  0::bigint, 'authenticated can update no organization_id column');
insert into _tap (line) select is(
  (select count(*) from pg_policies
   where schemaname = 'public' and qual ilike '%my_org_ids%' and qual not ilike '%ANY (ARRAY%'),
  0::bigint, 'every tenant select/update/delete policy uses the indexable array form');
insert into _tap (line) select is(
  (select count(*) from (select tablename, cmd from pg_policies where schemaname = 'public' and permissive = 'PERMISSIVE'
                         group by tablename, cmd having count(*) > 1) d),
  0::bigint, 'no table has two permissive policies for the same action');

-- Pure functions --------------------------------------------------------------
insert into _tap (line) select results_eq(
  $$select lower(w), upper(w) from (select private.visit_window('2026-01-10', '22:00', 360, 'America/Edmonton') w) s$$,
  $$values ('2026-01-11 05:00:00+00'::timestamptz, '2026-01-11 11:00:00+00'::timestamptz)$$,
  'an overnight window crosses midnight in org-local time');
insert into _tap (line) select is(
  (select upper(w) - lower(w) from (select private.visit_window('2026-03-07', '22:00', 360, 'America/Edmonton') w) s),
  interval '06:00:00', 'a window keeps its length across a DST change');

-- Admin cannot escalate or touch money columns ----------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into _tap (line) select throws_ok(
  $$update public.organization_members set user_id = null where role = 'owner'$$,
  '42501', null, 'an admin cannot detach the owner''s login');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set status = 'disabled' where role = 'owner'$$,
  '42501', null, 'an admin cannot disable an owner');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set role = 'admin' where role = 'owner'$$,
  '42501', null, 'an admin cannot demote an owner');
insert into _tap (line) select throws_ok(
  $$delete from public.organization_members where role = 'owner'$$,
  '42501', null, 'an admin cannot remove an owner');
insert into _tap (line) select throws_ok(
  $$update public.organization_members set role = 'owner' where display_name = 'Worker 2'$$,
  '42501', null, 'an admin cannot grant the owner role');
insert into _tap (line) select throws_ok(
  $$update public.organizations set stripe_account_id = 'acct_attacker'$$,
  '42501', null, 'an admin cannot repoint the Stripe account');
insert into _tap (line) select lives_ok(
  $$update public.organizations set name = 'PgTap A (renamed)'$$,
  'an admin can still edit the organization profile');

-- Quote totals are database-computed and statement-level -----------------------
insert into public.quotes (organization_id, client_id, title)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'client'), 'Season');
insert into _tap (line) select throws_ok(
  $$update public.quotes set subtotal_cents = 999999$$,
  '42501', null, 'quote totals are not writable through the API');
insert into public.quote_line_items (organization_id, quote_id, position, description, quantity, unit_price_cents)
select organization_id, id, g, 'Line ' || g, g, 1000 from public.quotes, generate_series(1, 2) g
where organization_id = (select id from _ids where key = 'org');
insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
select organization_id, id, (select id from _ids where key = 'tax-gst') from public.quote_line_items where position = 1;
insert into _tap (line) select results_eq(
  $$select subtotal_cents, tax_cents, total_cents from public.quotes where title = 'Season'$$,
  $$values (3000::bigint, 50::bigint, 3050::bigint)$$,
  'a multi-row line insert re-totals the quote once, with taxes');

select set_config('role', 'postgres', true);
update public.tax_rates set archived_at = now() where name = 'OLD';
select set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
    select organization_id, id, (select id from _ids where key = 'tax-old') from public.quote_line_items where position = 2$$,
  '23514', null, 'an archived tax rate can''t be attached');
insert into _tap (line) select throws_ok(
  $$update public.tax_rates set percentage = 9 where name = 'GST'$$,
  '42501', null, 'a tax rate''s percentage can''t be edited');

-- Workers have no table access to domain data; RPCs do the work --------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.clients), 0::bigint, 'a worker can''t read clients (internal notes stay private)');
insert into _tap (line) select is((select count(*) from public.visits), 0::bigint, 'a worker can''t read visits directly');
insert into _tap (line) select is(
  (select count(*) from public.worker_my_routes('2026-06-03')), 0::bigint, 'a draft route is invisible to its crew');

select set_config('role', 'postgres', true);
update public.routes set status = 'published' where id = (select id from _ids where key = 'route');
select set_config('role', 'authenticated', true);

insert into _tap (line) select is(
  (select count(*) from public.worker_my_routes('2026-06-03')), 1::bigint, 'a published route shows up for its rostered worker');
insert into _tap (line) select results_eq(
  $$select client_name, access_notes, price_cents from public.worker_route_stops((select id from _ids where key = 'route'))$$,
  $$values ('Jane'::text, 'Gate 1234'::text, null::bigint)$$,
  'worker_route_stops returns crew-safe columns, and no price by default');
insert into _tap (line) select lives_ok(
  $$select public.worker_start_visit((select id from _ids where key = 'visit'))$$, 'a worker can start their visit');
insert into _tap (line) select throws_ok(
  $$select public.worker_start_visit((select id from _ids where key = 'visit'))$$,
  '55000', null, 'a visit can''t be started twice');
insert into _tap (line) select lives_ok(
  $$select public.worker_complete_visit((select id from _ids where key = 'visit'), 'Done')$$, 'a worker can complete their visit');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.worker_complete_visit((select id from _ids where key = 'visit'))$$,
  'P0002', null, 'a worker not on the route can''t act on its visit');

select set_config('role', 'postgres', true);
insert into _tap (line) select results_eq(
  $$select v.status::text, v.completed_by_member_id = (select id from _ids where key = 'm-worker1'), te.ended_at is not null
    from public.visits v join public.visit_time_entries te on te.visit_id = v.id
    where v.id = (select id from _ids where key = 'visit')$$,
  $$values ('completed', true, true)$$,
  'completing records the worker and closes the time entry');

-- Billing: derived columns, billed-visit freeze --------------------------------------
-- Trusted server code has no auth.uid(); clear the claims left by the worker section.
select set_config('request.jwt.claims', '', true);
insert into _ids select 'invoice', public.create_invoice_for_visits(
  (select id from _ids where key = 'client'), array[(select id from _ids where key = 'visit')]);
update public.invoices set status = 'sent' where id = (select id from _ids where key = 'invoice');
insert into _tap (line) select results_eq(
  $$select subtotal_cents, tax_cents, status::text from public.invoices where id = (select id from _ids where key = 'invoice')$$,
  $$values (4500::bigint, 225::bigint, 'sent')$$,
  'an invoice built from a job gets its lines, taxes, and totals');
insert into _tap (line) select throws_ok(
  $$update public.visits set status = 'cancelled' where id = (select id from _ids where key = 'visit')$$,
  '55000', null, 'a billed visit can''t change status');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$update public.invoices set amount_paid_cents = 999999$$,
  '42501', null, 'an admin can''t write amount_paid_cents');
insert into _tap (line) select lives_ok(
  $$insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents)
    values ((select id from _ids where key = 'org'), (select id from _ids where key = 'invoice'), (select id from _ids where key = 'client'), 'cash', 100)$$,
  'an admin can record a manual payment');
select set_config('role', 'postgres', true);
insert into _tap (line) select results_eq(
  $$select amount_paid_cents, status::text from public.invoices where id = (select id from _ids where key = 'invoice')$$,
  $$values (100::bigint, 'partially_paid')$$,
  'a payment updates amount_paid and derives the status');

-- Routing -------------------------------------------------------------------------------
insert into public.routes (organization_id, crew_id, route_date)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'crew-truck2'), '2026-06-03');
insert into _tap (line) select throws_ok(
  $$insert into public.route_members (organization_id, route_id, member_id)
    select organization_id, id, (select id from _ids where key = 'm-worker1') from public.routes
    where crew_id = (select id from _ids where key = 'crew-truck2')$$,
  '23505', null, 'a member can''t be on two routes the same day (unique constraint)');

-- Anonymous access ------------------------------------------------------------------------
select set_config('role', 'anon', true);
insert into _tap (line) select throws_ok($$select count(*) from public.clients$$, '42501', null, 'anon can''t read tables');
select set_config('role', 'postgres', true);

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
