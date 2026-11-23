-- Merge regression: request-only recipients and normalized sent totals coexist.
-- Dedicated fixtures only; every write rolls back.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, service_role;
select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000e1', 'quote-merge-owner@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('Quote Merge Test', 'pgtap-quote-merge');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-quote-merge';
insert into public.organization_members (organization_id, user_id, role, display_name)
values ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000e1', 'owner', 'Merge Owner');
insert into public.services (organization_id, name)
values ((select id from _ids where key = 'org'), 'Merge service');
insert into _ids select 'service', id from public.services where organization_id = (select id from _ids where key = 'org');
insert into public.requests (organization_id, service_id, contact_name, contact_email, address)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'service'),
  'Merge Prospect', 'quote-merge-prospect@test.local', '123 Test Street');
insert into _ids select 'request', id from public.requests where organization_id = (select id from _ids where key = 'org');
insert into public.quotes (organization_id, request_id, title, valid_until, revision)
select (select id from _ids where key = 'org'), (select id from _ids where key = 'request'), title, current_date + 7, revision
from (values ('send', 1), ('rollback', 2)) v(title, revision);
insert into _ids select title, id from public.quotes where organization_id = (select id from _ids where key = 'org');
insert into public.quote_line_items (organization_id, quote_id, position, description, quantity, unit_price_cents, is_optional, is_selected)
select q.organization_id, q.id, position, description, 1, price, optional, selected
from public.quotes q cross join (values
  (1, 'Required', 10000, false, false), (2, 'Optional', 5000, true, true)
) v(position, description, price, optional, selected)
where q.organization_id = (select id from _ids where key = 'org');

insert into _tap (line) select ok(has_function_privilege('authenticated', 'public.send_quote(uuid,text)', 'EXECUTE'), 'authenticated retains send permission');
insert into _tap (line) select ok(not has_function_privilege('anon', 'public.send_quote(uuid,text)', 'EXECUTE'), 'anon cannot send');
insert into _tap (line) select ok(not has_function_privilege('service_role', 'public.send_quote(uuid,text)', 'EXECUTE'), 'service role cannot impersonate staff send');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select is((select total_cents from public.quotes where id = (select id from _ids where key = 'send')), 15000::bigint, 'draft initially includes preselected optional item');
insert into _ids select 'token', public.send_quote((select id from _ids where key = 'send'), repeat('a', 64));
insert into _tap (line) select ok((select client_id is null and status = 'sent' from public.quotes where id = (select id from _ids where key = 'send')), 'request-only quote sends without creating client');
insert into _tap (line) select is((select total_cents from public.quotes where id = (select id from _ids where key = 'send')), 10000::bigint, 'send atomically excludes optional item');
insert into _tap (line) select ok(not (select is_selected from public.quote_line_items where quote_id = (select id from _ids where key = 'send') and is_optional), 'send clears optional selection');

-- Reuse an existing token hash so insertion fails after normalization. The
-- whole function call, including changed selections and totals, must roll back.
insert into _tap (line) select throws_ok($$select public.send_quote((select id from _ids where key = 'rollback'), repeat('a', 64))$$, '23505', null, 'failed token insertion rejects send');
insert into _tap (line) select ok((select status = 'draft' and total_cents = 15000 from public.quotes where id = (select id from _ids where key = 'rollback')), 'failed send restores draft status and total');
insert into _tap (line) select ok((select is_selected from public.quote_line_items where quote_id = (select id from _ids where key = 'rollback') and is_optional), 'failed send restores optional selection');
insert into _tap (line) select ok((select revoked_at is null from public.quote_share_tokens where id = (select id from _ids where key = 'token')), 'failed replacement preserves previous token');

select set_config('role', 'service_role', true);
insert into _tap (line) select is(public.portal_token_get_quote(repeat('a', 64))->>'client_name', 'Merge Prospect', 'customer view uses request contact');
insert into _tap (line) select is((public.portal_token_get_quote(repeat('a', 64))->>'total_cents')::bigint, 10000::bigint, 'customer sees normalized sent total');
select public.portal_token_approve(repeat('a', 64), '{}');
select set_config('role', 'postgres', true);
insert into _tap (line) select ok((select status = 'approved' and client_id is not null and total_cents = 10000 from public.quotes where id = (select id from _ids where key = 'send')), 'approval creates client and preserves accepted total');
insert into _tap (line) select is((select count(*) from public.jobs where organization_id = (select id from _ids where key = 'org')), 0::bigint, 'approval creates no job');
insert into _tap (line) select * from finish();
select string_agg(line, E'\n' order by n) as tap from _tap;
rollback;
