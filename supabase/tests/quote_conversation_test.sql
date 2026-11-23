-- Hermetic quote conversation boundaries. Run with execute_sql; rolls back.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;
select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'quote-chat-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d2', 'quote-chat-admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d3', 'quote-chat-dispatcher@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d4', 'quote-chat-worker@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d5', 'quote-chat-portal@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d6', 'quote-chat-outsider@test.local', 'authenticated', 'authenticated');
insert into public.organizations (name, slug) values ('Quote Chat Test A', 'pgtap-chat-a'), ('Quote Chat Test B', 'pgtap-chat-b');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-chat-a';
insert into _ids select 'org2', id from public.organizations where slug = 'pgtap-chat-b';
insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000d1', 'owner', 'Owner'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000d2', 'admin', 'Admin'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000d3', 'dispatcher', 'Dispatcher'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000d4', 'worker', 'Worker'),
  ((select id from _ids where key = 'org2'), '00000000-0000-0000-0000-0000000000d1', 'admin', 'Multi-org owner');
insert into public.clients (organization_id, display_name, email)
select id, 'Chat Client', 'quote-chat@test.local' from _ids where key in ('org', 'org2');
insert into _ids select 'client', id from public.clients where organization_id = (select id from _ids where key = 'org');
insert into public.client_portal_users (organization_id, client_id, user_id)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'client'), '00000000-0000-0000-0000-0000000000d5');
insert into public.quotes (organization_id, client_id, title, valid_until)
select c.organization_id, c.id, title, current_date + 7 from public.clients c
cross join (values ('main'), ('approved'), ('declined'), ('pulled'), ('expired'), ('history')) v(title)
where c.organization_id = (select id from _ids where key = 'org');
insert into _ids select title, id from public.quotes where organization_id = (select id from _ids where key = 'org');
insert into public.quotes (organization_id, client_id, title, valid_until)
select organization_id, id, 'other', current_date + 7 from public.clients
where organization_id = (select id from _ids where key = 'org2');
insert into _ids select 'other', id from public.quotes where organization_id = (select id from _ids where key = 'org2');
insert into public.quote_line_items (organization_id, quote_id, position, description, quantity, unit_price_cents)
select q.organization_id, q.id, 1, 'Required', 1, 10000 from public.quotes q
where q.organization_id in (select id from _ids where key in ('org', 'org2'));
insert into public.quote_line_items (organization_id, quote_id, position, description, quantity, unit_price_cents, is_optional, is_selected)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 2, 'Optional', 1, 5000, true, true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _ids select 'token', public.send_quote((select id from _ids where key = 'main'), repeat('a', 64));
insert into _ids select 'approved_token', public.send_quote((select id from _ids where key = 'approved'), repeat('b', 64));
insert into _ids select 'declined_token', public.send_quote((select id from _ids where key = 'declined'), repeat('c', 64));
insert into _ids select 'pulled_token', public.send_quote((select id from _ids where key = 'pulled'), repeat('d', 64));
insert into _ids select 'expired_token', public.send_quote((select id from _ids where key = 'expired'), repeat('e', 64));
insert into _ids select 'history_token', public.send_quote((select id from _ids where key = 'history'), repeat('f', 64));

insert into _tap (line) select is((select total_cents from public.quotes where id = (select id from _ids where key = 'main')), 10000::bigint, 'send excludes preselected optional items atomically');
insert into _tap (line) select throws_ok($$update public.quote_line_items set is_selected = true where quote_id = (select id from _ids where key = 'main')$$, '42501', null, 'staff cannot change selections directly');
insert into _tap (line) select lives_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Owner message', '00000000-0000-0000-0000-000000000001')$$, 'owner can post');
insert into _tap (line) select lives_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Owner message', '00000000-0000-0000-0000-000000000001')$$, 'same retry is idempotent');
insert into _tap (line) select is((select count(*) from public.quote_messages), 1::bigint, 'retry creates only one message');
insert into _tap (line) select throws_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Changed', '00000000-0000-0000-0000-000000000001')$$, '23505', null, 'changed retry is rejected');
insert into _tap (line) select throws_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'other'), 'Wrong active org', extensions.gen_random_uuid())$$, 'P0002', null, 'multi-org caller cannot mix active org and quote');
insert into _tap (line) select throws_ok($$insert into public.quote_messages (organization_id, quote_id, body, sender_kind, client_message_id) values ((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Forged', 'customer', extensions.gen_random_uuid())$$, '42501', null, 'direct attribution spoofing is denied');
insert into _tap (line) select throws_ok($$update public.quote_messages set body = 'Edited'$$, '42501', null, 'message editing is denied');
insert into _tap (line) select throws_ok($$delete from public.quote_messages$$, '42501', null, 'message deletion is denied');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
insert into _tap (line) select lives_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Admin message', extensions.gen_random_uuid())$$, 'admin can post');
insert into _tap (line) select throws_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Owner message', '00000000-0000-0000-0000-000000000001')$$, '23505', null, 'another staff member cannot reuse an attribution key');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);
insert into _tap (line) select lives_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Dispatcher message', extensions.gen_random_uuid())$$, 'dispatcher can post');
insert into _tap (line) select throws_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), null, extensions.gen_random_uuid())$$, '22023', null, 'staff RPC rejects null body');
insert into _tap (line) select throws_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), repeat('x',4001), extensions.gen_random_uuid())$$, '22023', null, 'staff RPC rejects oversized body');
insert into _tap (line) select throws_ok($$select public.post_quote_message((select id from _ids where key = 'org2'), (select id from _ids where key = 'other'), 'Cross tenant', extensions.gen_random_uuid())$$, 'P0002', null, 'nonmember cannot write other tenant');

-- The worker, portal account and nonmember have neither reads nor staff writes.
select set_config('role', 'postgres', true);
insert into public.quote_messages (organization_id, quote_id, body, sender_kind, client_message_id)
values ((select id from _ids where key = 'org2'), (select id from _ids where key = 'other'), 'Other tenant history', 'customer', extensions.gen_random_uuid());
select set_config('role', 'authenticated', true);
insert into _tap (line) select is((select count(*) from public.quote_messages where organization_id = (select id from _ids where key = 'org2')), 0::bigint, 'dispatcher cannot read other tenant history');
select set_config('role', 'postgres', true);
do $$
declare n integer;
begin
  for n in 4..6 loop
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000d' || n, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    insert into _tap (line) select is((select count(*) from public.quote_messages), 0::bigint, 'disallowed user ' || n || ' sees no messages');
    insert into _tap (line) select throws_ok('select public.post_quote_message((select id from _ids where key = ''org''), (select id from _ids where key = ''main''), ''Denied'', extensions.gen_random_uuid())', 'P0002', null, 'disallowed user ' || n || ' cannot post');
    perform set_config('role', 'postgres', true);
  end loop;
end;
$$;

insert into _tap (line) select throws_ok($$insert into public.quote_messages (organization_id, quote_id, body, sender_kind, client_message_id) values ((select id from _ids where key = 'org2'), (select id from _ids where key = 'main'), 'Cross org', 'customer', extensions.gen_random_uuid())$$, '23503', null, 'composite quote FK enforces tenancy');
insert into _tap (line) select throws_ok($$insert into public.quote_messages (organization_id, quote_id, body, sender_kind, client_message_id) values ((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), E' \n\t ', 'customer', extensions.gen_random_uuid())$$, '23514', null, 'table rejects whitespace-only messages');
insert into _tap (line) select throws_ok($$insert into public.quote_messages (organization_id, quote_id, body, sender_kind, client_message_id) values ((select id from _ids where key = 'org'), (select id from _ids where key = 'main'), repeat('x', 4001), 'customer', extensions.gen_random_uuid())$$, '23514', null, 'table rejects oversized messages');
insert into _tap (line) select ok(not has_function_privilege('anon', 'public.portal_token_list_messages(text,timestamptz,uuid)', 'EXECUTE'), 'anon cannot call token list RPC');
insert into _tap (line) select ok(not has_function_privilege('authenticated', 'public.portal_token_post_message(text,text,uuid)', 'EXECUTE'), 'session clients cannot call token post RPC');
insert into _tap (line) select ok(not has_function_privilege('service_role', 'public.post_quote_message(uuid,uuid,text,uuid)', 'EXECUTE'), 'service role cannot forge staff attribution');
insert into _tap (line) select ok(not has_function_privilege('anon', 'public.post_quote_message(uuid,uuid,text,uuid)', 'EXECUTE'), 'anon cannot call staff RPC');
insert into _tap (line) select ok(not has_table_privilege('anon', 'public.quote_messages', 'SELECT'), 'anon cannot read table');

select set_config('request.jwt.claims', '{"role":"service_role"}', true), set_config('role', 'service_role', true);
insert into _tap (line) select lives_ok($$select public.portal_token_post_message(repeat('a',64), 'Customer message', '00000000-0000-0000-0000-000000000002')$$, 'token holder can post');
insert into _tap (line) select lives_ok($$select public.portal_token_post_message(repeat('a',64), 'Customer message', '00000000-0000-0000-0000-000000000002')$$, 'customer retry is idempotent');
insert into _tap (line) select throws_ok($$select public.portal_token_post_message(repeat('a',64), 'Changed', '00000000-0000-0000-0000-000000000002')$$, '23505', null, 'customer conflicting retry fails');
insert into _tap (line) select throws_ok($$select public.portal_token_post_message(repeat('a',64), repeat('x',4001), extensions.gen_random_uuid())$$, '22023', null, 'RPC rejects oversized body');
insert into _tap (line) select throws_ok($$select public.portal_token_post_message(repeat('a',64), E'\n\t', extensions.gen_random_uuid())$$, '22023', null, 'RPC rejects whitespace body');
insert into _tap (line) select throws_ok($$select public.portal_token_list_messages(repeat('a',64), now(), null)$$, '22023', null, 'cursor fields must be paired');
insert into _tap (line) select is((select count(*) from public.portal_token_list_messages(repeat('a',64))), 4::bigint, 'customer sees this quote thread only');
insert into _tap (line) select lives_ok($$select public.portal_token_approve(repeat('b',64), '{}')$$, 'customer can accept');
insert into _tap (line) select lives_ok($$select public.portal_token_post_message(repeat('b',64), 'After acceptance', extensions.gen_random_uuid())$$, 'approved quote chat stays writable');
insert into _tap (line) select lives_ok($$select public.portal_token_decline(repeat('c',64), 'Later')$$, 'customer can decline');
insert into _tap (line) select lives_ok($$select public.portal_token_post_message(repeat('c',64), 'After decline', extensions.gen_random_uuid())$$, 'declined quote chat stays writable');
insert into _tap (line) select lives_ok($$select public.portal_token_approve(repeat('a',64), '{}')$$, 'normalized quote can still be accepted');
select set_config('role', 'postgres', true);
insert into _tap (line) select is((select total_cents from public.quotes where id = (select id from _ids where key = 'main')), 10000::bigint, 'accepted total equals delivered total');
insert into _tap (line) select is((select count(*) from public.jobs where quote_id in (select id from _ids)), 0::bigint, 'acceptance does not create jobs');
insert into _tap (line) select is((select staff_user_id from public.quote_messages where client_message_id = '00000000-0000-0000-0000-000000000001'), '00000000-0000-0000-0000-0000000000d1'::uuid, 'staff attribution is assigned from session');
insert into _tap (line) select ok((select staff_user_id is null from public.quote_messages where client_message_id = '00000000-0000-0000-0000-000000000002'), 'customer has no forged staff identity');

-- Equal timestamps exercise the UUID tie-breaker; no skipped/repeated page boundary.
insert into public.quote_messages (organization_id, quote_id, body, sender_kind, client_message_id, created_at)
select (select id from _ids where key = 'org'), (select id from _ids where key = 'history'), 'History ' || n, 'staff', extensions.gen_random_uuid(), now() - interval '2 hours'
from generate_series(1,55) n;
select set_config('role', 'service_role', true);
insert into _tap (line) select is((select count(*) from public.portal_token_list_messages(repeat('f',64))), 50::bigint, 'newest page is bounded to 50');
insert into _tap (line) select is((select count(*) from public.portal_token_list_messages(repeat('f',64), now() - interval '2 hours', (select id from public.portal_token_list_messages(repeat('f',64)) order by created_at, id limit 1))), 5::bigint, 'older cursor returns remaining five rows');
select set_config('role', 'postgres', true);

-- Quotas include rows written before a lost response and are shared by rotated links.
insert into public.quote_messages (organization_id, quote_id, body, sender_kind, client_message_id)
select (select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Quota ' || n, 'customer', extensions.gen_random_uuid()
from generate_series(1,9) n;
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok($$select public.portal_token_post_message(repeat('a',64), 'Eleventh', extensions.gen_random_uuid())$$, 'P0001', 'quote_message_rate_limited', 'minute quota applies atomically');
insert into _tap (line) select lives_ok($$select public.portal_token_post_message(repeat('a',64), 'Customer message', '00000000-0000-0000-0000-000000000002')$$, 'idempotent retry bypasses quota consumption');
select set_config('role', 'postgres', true);
update public.quote_messages set created_at = now() - interval '2 hours' where quote_id = (select id from _ids where key = 'main') and sender_kind = 'customer';
insert into public.quote_messages (organization_id, quote_id, body, sender_kind, client_message_id, created_at)
select (select id from _ids where key = 'org'), (select id from _ids where key = 'main'), 'Daily ' || n, 'customer', extensions.gen_random_uuid(), now() - interval '2 hours'
from generate_series(1,90) n;
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok($$select public.portal_token_post_message(repeat('a',64), '101st', extensions.gen_random_uuid())$$, 'P0001', 'quote_message_rate_limited', 'daily quota applies');
select set_config('role', 'postgres', true);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true), set_config('role', 'authenticated', true);
insert into _ids select 'rotated', public.rotate_quote_token((select id from _ids where key = 'history'), repeat('1',64));
select public.pull_back_quote((select id from _ids where key = 'pulled'));
select set_config('role', 'postgres', true);
update public.quote_share_tokens set expires_at = now() - interval '1 second'
where quote_id in (select id from _ids where key in ('expired','approved','declined'));
update public.quotes set status = 'expired' where id = (select id from _ids where key = 'expired');
select set_config('role', 'service_role', true);
insert into _tap (line) select is((select count(*) from public.portal_token_list_messages(repeat('1',64))), 50::bigint, 'rotation retains quote history');
select set_config('role', 'postgres', true);
do $$
declare token text;
begin
  foreach token in array array[repeat('0',64), repeat('b',64), repeat('c',64), repeat('d',64), repeat('e',64), repeat('f',64)] loop
    perform set_config('role', 'service_role', true);
    insert into _tap (line) select throws_ok(format('select public.portal_token_list_messages(%L)', token), 'P0002', null, 'unknown/expired/revoked/pulled/terminal-expired link cannot read');
    insert into _tap (line) select throws_ok(format('select public.portal_token_post_message(%L, ''Denied'', extensions.gen_random_uuid())', token), 'P0002', null, 'unknown/expired/revoked/pulled/terminal-expired link cannot write');
    perform set_config('role', 'postgres', true);
  end loop;
end;
$$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true), set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok($$select public.post_quote_message((select id from _ids where key = 'org'), (select id from _ids where key = 'approved'), 'Expired chat', extensions.gen_random_uuid())$$, '55000', null, 'staff cannot post after customer link expires');
insert into _tap (line) select ok((select count(*) from public.quote_messages where quote_id = (select id from _ids where key = 'approved')) > 0, 'office retains expired conversation history');
select set_config('role', 'postgres', true);

insert into _tap (line) select * from finish();
select string_agg(line, E'\n' order by n) as tap from _tap;
rollback;
