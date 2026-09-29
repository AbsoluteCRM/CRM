-- pgTAP tests for migration jobs_visits. See supabase/tests/README.md.

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
  ((select id from _ids where key = 'org-b'), 'B-TAX', 5);
insert into _ids select 'tax-' || lower(name), id from public.tax_rates;

-- An approved quote for Jane with one required and one selected optional line.
insert into public.quotes (organization_id, client_id, property_id, title)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'),
        (select id from _ids where key = 'prop-jane'), 'Season');
insert into _ids select 'quote', id from public.quotes where title = 'Season';
insert into public.quote_line_items (organization_id, quote_id, position, description, unit_price_cents, is_optional, is_selected)
values
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'quote'), 1, 'Mow', 4500, false, false),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'quote'), 2, 'Trim', 1500, true, true),
  ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'quote'), 3, 'Aerate', 9000, true, false);
insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
select organization_id, id, (select id from _ids where key = 'tax-gst') from public.quote_line_items where position = 1;
update public.quotes set status = 'sent' where id = (select id from _ids where key = 'quote');
update public.quotes set status = 'approved' where id = (select id from _ids where key = 'quote');

-- Dispatcher --------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);

insert into public.jobs (organization_id, client_id, property_id, title, start_date, window_start, window_end)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-bob'),
        (select id from _ids where key = 'prop-bob'), 'Cleanup', '2026-06-03', '09:00', '11:00');
insert into _tap (line) select is((select number from public.jobs where title = 'Cleanup'), 'J-1001', 'jobs are numbered');
insert into _tap (line) select results_eq(
  $$select v.scheduled_date, v.window_start, v.duration_minutes
    from public.visits v join public.jobs j on j.id = v.job_id where j.title = 'Cleanup'$$,
  $$values ('2026-06-03'::date, '2026-06-03 15:00:00+00'::timestamptz, 60)$$,
  'a one-off job creates its visit, with the window resolved in America/Edmonton (MDT = UTC-6)');

insert into _tap (line) select throws_ok(
  $$insert into public.jobs (organization_id, client_id, property_id, title, kind, start_date)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-bob'),
            (select id from _ids where key = 'prop-bob'), 'No rule', 'recurring', '2026-06-01')$$,
  '23514', null, 'a recurring job requires an rrule');
insert into _tap (line) select throws_ok(
  $$insert into public.jobs (organization_id, client_id, property_id, title, kind, rrule, start_date)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-bob'),
            (select id from _ids where key = 'prop-bob'), 'Bad rule', 'recurring', 'DTSTART:20260601;FREQ=WEEKLY', '2026-06-01')$$,
  '23514', null, 'an rrule must not embed DTSTART');
insert into _tap (line) select throws_ok(
  $$insert into public.jobs (organization_id, client_id, property_id, title, start_date)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'),
            (select id from _ids where key = 'prop-bob'), 'Wrong prop', '2026-06-01')$$,
  '23503', null, 'a job''s property must belong to its client');

-- Recurring job and visit generation
insert into public.jobs (organization_id, client_id, property_id, title, kind, rrule, start_date, billing_mode, billing_period)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-bob'),
        (select id from _ids where key = 'prop-bob'), 'Weekly mow', 'recurring', 'FREQ=WEEKLY;BYDAY=TU', '2026-06-02', 'periodic', 'monthly');

select set_config('role', 'postgres', true);
insert into _ids select 'weekly', id from public.jobs where title = 'Weekly mow';
select set_config('role', 'authenticated', true);

insert into _tap (line) select is(
  public.generate_visits((select id from _ids where key = 'weekly'),
    '{2026-06-02,2026-06-09,2026-06-16,2026-06-23}', '2026-06-16'),
  3, 'generate_visits creates visits up to the horizon');
insert into _tap (line) select is(
  public.generate_visits((select id from _ids where key = 'weekly'),
    '{2026-06-02,2026-06-09,2026-06-16,2026-06-23}', '2026-06-23'),
  1, 'generation is incremental and idempotent (only the new date is added)');
insert into _tap (line) select is(
  (select generated_through from public.jobs where id = (select id from _ids where key = 'weekly')),
  '2026-06-23'::date, 'the watermark advances');

update public.visits set scheduled_date = '2026-06-10'
where job_id = (select id from _ids where key = 'weekly') and occurrence_date = '2026-06-09';
insert into _tap (line) select ok(
  (select is_exception from public.visits where job_id = (select id from _ids where key = 'weekly') and occurrence_date = '2026-06-09'),
  'moving a generated visit marks it as an exception');

insert into _tap (line) select is(
  public.reset_job_schedule((select id from _ids where key = 'weekly'), '2026-06-01'), 3,
  'reset_job_schedule deletes untouched future visits');
insert into _tap (line) select results_eq(
  $$select count(*)::int, (select generated_through from public.jobs where id = (select id from _ids where key = 'weekly'))
    from public.visits where job_id = (select id from _ids where key = 'weekly')$$,
  $$values (1, '2026-05-31'::date)$$,
  'the exception survives and the watermark rewinds');

update public.visits set status = 'completed'
where job_id = (select id from _ids where key = 'weekly');
insert into _tap (line) select ok(
  (select actual_start is not null and actual_end is not null from public.visits where job_id = (select id from _ids where key = 'weekly')),
  'completing a visit stamps actual start and end');

-- Job from quote
insert into public.jobs (organization_id, client_id, property_id, quote_id, title, start_date)
values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'),
        (select id from _ids where key = 'prop-jane'), (select id from _ids where key = 'quote'), 'From quote', '2026-07-01');
insert into _tap (line) select results_eq(
  $$select l.description, l.unit_price_cents, cardinality(l.tax_rate_ids)
    from public.job_line_items l join public.jobs j on j.id = l.job_id
    where j.title = 'From quote' order by l.position$$,
  $$values ('Mow', 4500::bigint, 1), ('Trim', 1500::bigint, 0)$$,
  'a job from a quote copies required and selected optional lines, with their taxes');

select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.quotes where id = (select id from _ids where key = 'quote')),
  'converted', 'the quote is marked converted');
select set_config('role', 'authenticated', true);

insert into _tap (line) select throws_ok(
  $$insert into public.jobs (organization_id, client_id, property_id, quote_id, title, start_date)
    values ((select id from _ids where key = 'org-a'), (select id from _ids where key = 'client-jane'),
            (select id from _ids where key = 'prop-jane'), (select id from _ids where key = 'quote'), 'Again', '2026-07-01')$$,
  '23505', null, 'a quote converts into at most one job');
insert into _tap (line) select throws_ok(
  $$insert into public.job_line_items (organization_id, job_id, position, description, unit_price_cents, tax_rate_ids)
    select organization_id, id, 9, 'x', 1, array[(select id from _ids where key = 'tax-b-tax')]
    from public.jobs where title = 'Cleanup'$$,
  '23503', null, 'job line tax_rate_ids must belong to the org');

-- Attachments
insert into _tap (line) select lives_ok(
  $$insert into public.attachments (organization_id, storage_path, mime_type, size_bytes, visit_id)
    select organization_id, organization_id::text || '/visits/' || id || '/before.jpg', 'image/jpeg', 1024, id
    from public.visits where job_id = (select id from _ids where key = 'weekly')$$,
  'office staff can attach a photo to a visit');
insert into _tap (line) select throws_ok(
  $$insert into public.attachments (organization_id, storage_path, mime_type, size_bytes, job_id, visit_id)
    select organization_id, organization_id::text || '/x.jpg', 'image/jpeg', 1, job_id, id
    from public.visits where job_id = (select id from _ids where key = 'weekly')$$,
  '23514', null, 'an attachment has exactly one owner');
insert into _tap (line) select throws_ok(
  $$insert into public.attachments (organization_id, storage_path, mime_type, size_bytes, job_id)
    values ((select id from _ids where key = 'org-a'), (select id::text from _ids where key = 'org-b') || '/x.jpg',
            'image/jpeg', 1, (select id from _ids where key = 'weekly'))$$,
  '23514', null, 'an attachment path must live under its org''s folder');

-- Worker, other tenant, portal ---------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.visits), 0::bigint, 'workers see no visits until routing');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.jobs), 0::bigint, 'another org sees no jobs');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
insert into _tap (line) select is((select count(*) from public.jobs), 0::bigint, 'portal users cannot read the jobs table');
insert into _tap (line) select is((select count(*) from public.portal_my_jobs()), 1::bigint, 'portal_my_jobs lists only their client''s jobs');
insert into _tap (line) select is((select count(*) from public.portal_my_visits()), 1::bigint, 'portal_my_visits lists their visits');

select set_config('role', 'postgres', true);
insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
