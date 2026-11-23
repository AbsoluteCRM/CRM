-- pgTAP tests for the quote_request_link_and_share_tokens migration.
-- Hermetic: its own orgs ('pgtap-q', 'pgtap-q2') and users.
-- See supabase/tests/README.md. Concurrent create_quote_draft / rotate calls
-- can't be exercised from one session; they rely on the row locks in the
-- functions and the live-token unique index (tested below).

begin;
set local search_path = extensions, public;

create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;

select no_plan();

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000c1', 'pgtap-q-owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c2', 'pgtap-q-dispatcher@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c3', 'pgtap-q-worker@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c4', 'pgtap-q2-owner@test.local', 'authenticated', 'authenticated');

insert into public.organizations (name, slug) values ('PgTap Q', 'pgtap-q'), ('PgTap Q2', 'pgtap-q2');
insert into _ids select 'org', id from public.organizations where slug = 'pgtap-q';
insert into _ids select 'org2', id from public.organizations where slug = 'pgtap-q2';

insert into public.organization_members (organization_id, user_id, role, display_name) values
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000c1', 'owner', 'Owner'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000c2', 'dispatcher', 'Dispatcher'),
  ((select id from _ids where key = 'org'), '00000000-0000-0000-0000-0000000000c3', 'worker', 'Worker'),
  ((select id from _ids where key = 'org2'), '00000000-0000-0000-0000-0000000000c4', 'owner', 'Other owner');

insert into public.services (organization_id, name) values ((select id from _ids where key = 'org'), 'Mowing');
insert into _ids select 'service', id from public.services where organization_id = (select id from _ids where key = 'org');

-- Request 1 has no client (a prospect); request 2 does.
insert into public.requests (organization_id, service_id, contact_name, contact_email, address)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'service'),
        'Pat Prospect', 'pat@example.com', '5 Elm St, Edmonton');
insert into _ids select 'req1', id from public.requests where contact_name = 'Pat Prospect';
insert into public.requests (organization_id, service_id, contact_name, contact_email, address)
values ((select id from _ids where key = 'org'), (select id from _ids where key = 'service'),
        'Dana Decliner', 'dana@example.com', '9 Oak St, Edmonton');
insert into _ids select 'req2', id from public.requests where contact_name = 'Dana Decliner';

-- Access: who can create drafts ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.create_quote_draft((select id from _ids where key = 'req1'))$$,
  'P0002', null, 'a worker can''t create a quote draft');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
insert into _tap (line) select throws_ok(
  $$select public.create_quote_draft((select id from _ids where key = 'req1'))$$,
  'P0002', null, 'another org''s owner can''t create a draft for this request');

-- Draft creation ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
insert into _ids select 'q1', public.create_quote_draft((select id from _ids where key = 'req1'));
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select revision from public.quotes where id = (select id from _ids where key = 'q1')), 1,
  'the first draft is revision 1');
insert into _tap (line) select is(
  (select client_id from public.quotes where id = (select id from _ids where key = 'q1')),
  null::uuid, 'a prospect quote defers client creation until approval');
insert into _tap (line) select is(
  (select contact_email from public.requests where id = (select id from _ids where key = 'req1')),
  'pat@example.com', 'the prospect contact email is retained until approval');
insert into _tap (line) select is(
  (select status::text from public.requests where id = (select id from _ids where key = 'req1')),
  'reviewing', 'a draft moves the request to reviewing');

select set_config('role', 'authenticated', true);
insert into _ids select 'q2', public.create_quote_draft((select id from _ids where key = 'req1'));
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select revision from public.quotes where id = (select id from _ids where key = 'q2')), 2,
  'the next draft is revision 2');

-- Sending requires a valid_until, a line and a client email ------------------------------------
select set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.send_quote((select id from _ids where key = 'q1'), repeat('a', 64))$$,
  '55000', null, 'a quote with no valid_until can''t be sent');
update public.quotes set valid_until = current_date + 14, conditions = 'Subject to a site visit'
where id = (select id from _ids where key = 'q1');
insert into _tap (line) select throws_ok(
  $$select public.send_quote((select id from _ids where key = 'q1'), repeat('a', 64))$$,
  '55000', null, 'a quote with no lines can''t be sent');

select set_config('role', 'postgres', true);
insert into public.quote_line_items (organization_id, quote_id, description, quantity, unit_price_cents, position)
select organization_id, id, 'Mow lawn', 1, 5000, 1 from public.quotes where id in
  ((select id from _ids where key = 'q1'), (select id from _ids where key = 'q2'));
insert into public.quote_line_items (organization_id, quote_id, description, quantity, unit_price_cents, position, is_optional)
select organization_id, id, 'Edging', 1, 1000, 2, true from public.quotes where id = (select id from _ids where key = 'q1');
update public.quotes set valid_until = current_date + 14 where id = (select id from _ids where key = 'q2');

-- Token hashes are 64 hex chars -------------------------------------------------------------
select set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$select public.send_quote((select id from _ids where key = 'q1'), 'not-a-hash')$$,
  '23514', null, 'a malformed token hash is rejected');

insert into _ids select 'tok1', public.send_quote((select id from _ids where key = 'q1'), repeat('a', 64));
insert into _tap (line) select is(
  (select status::text from public.quotes where id = (select id from _ids where key = 'q1')), 'sent', 'send marks the quote sent');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.requests where id = (select id from _ids where key = 'req1')),
  'estimated', 'sending moves the request to estimated');
insert into _tap (line) select is(
  (select delivery_status::text from public.quote_share_tokens where id = (select id from _ids where key = 'tok1')),
  'pending', 'a new token starts as pending delivery');

-- A sent quote is locked, and staff can't write status directly --------------------------------
select set_config('role', 'authenticated', true);
insert into _tap (line) select throws_ok(
  $$update public.quotes set status = 'approved' where id = (select id from _ids where key = 'q1')$$,
  '42501', null, 'staff can''t update a quote''s status directly');
insert into _tap (line) select throws_ok(
  $$update public.quotes set conditions = 'changed' where id = (select id from _ids where key = 'q1')$$,
  '55000', null, 'conditions are frozen once sent');
insert into _tap (line) select throws_ok(
  $$update public.quotes set valid_until = current_date + 90 where id = (select id from _ids where key = 'q1')$$,
  '55000', null, 'valid_until is frozen once sent');
insert into _tap (line) select throws_ok(
  $$update public.quotes set revision = 9 where id = (select id from _ids where key = 'q1')$$,
  '42501', null, 'revision isn''t writable through the API');

-- Staff see delivery state but never the token hash -----------------------------------------
insert into _tap (line) select is(
  (select count(*) from public.quote_share_tokens where quote_id = (select id from _ids where key = 'q1')), 1::bigint,
  'staff can read token delivery state');
insert into _tap (line) select throws_ok(
  $$select token_hash from public.quote_share_tokens$$, '42501', null, 'staff can''t read the token hash');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
insert into _tap (line) select is(
  (select count(*) from public.quote_share_tokens), 0::bigint, 'a worker sees no tokens');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

-- Privileges: the token functions are service-role only ----------------------------------------
insert into _tap (line) select throws_ok(
  $$select public.portal_token_get_quote(repeat('a', 64))$$, '42501', null,
  'authenticated users can''t call the token functions');
select set_config('role', 'anon', true);
insert into _tap (line) select throws_ok(
  $$select public.portal_token_get_quote(repeat('a', 64))$$, '42501', null, 'anon can''t call the token functions');
insert into _tap (line) select throws_ok(
  $$select public.send_quote(gen_random_uuid(), repeat('a', 64))$$, '42501', null, 'anon can''t send quotes');

-- Token page reads (service role) ----------------------------------------------------------------
select set_config('role', 'service_role', true);
insert into _tap (line) select is(
  (public.portal_token_get_quote(repeat('a', 64)) ->> 'title'), 'Mowing', 'a live token returns its quote');
insert into _tap (line) select ok(
  not (public.portal_token_get_quote(repeat('a', 64)) ? 'internal_notes'), 'internal notes are never returned');
select set_config('role', 'postgres', true);
insert into _tap (line) select isnt(
  (select viewed_at from public.quote_share_tokens where id = (select id from _ids where key = 'tok1')), null,
  'the first view is stamped');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.portal_token_get_quote(repeat('9', 64))$$, 'P0002', null, 'an unknown token is not found');
insert into _tap (line) select lives_ok(
  $$select public.record_quote_delivery((select id from _ids where key = 'tok1'), 'sent', 'msg_1', null)$$,
  'the server records a delivery');
select set_config('role', 'postgres', true);

-- A new revision supersedes the sent one ---------------------------------------------------------
select set_config('role', 'authenticated', true);
insert into _ids select 'tok2', public.send_quote((select id from _ids where key = 'q2'), repeat('b', 64));
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.quotes where id = (select id from _ids where key = 'q1')), 'expired',
  'sending revision 2 expires revision 1');
insert into _tap (line) select isnt(
  (select revoked_at from public.quote_share_tokens where id = (select id from _ids where key = 'tok1')), null,
  'the superseded revision''s token is revoked');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.portal_token_get_quote(repeat('a', 64))$$, 'P0002', null, 'a superseded link shows nothing');
insert into _tap (line) select throws_ok(
  $$select public.portal_token_approve(repeat('a', 64))$$, 'P0002', null, 'a superseded revision can''t be approved');

-- Resend rotates the token -----------------------------------------------------------------------
select set_config('role', 'authenticated', true);
insert into _ids select 'tok2b', public.rotate_quote_token((select id from _ids where key = 'q2'), repeat('c', 64));
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select count(*) from public.quote_share_tokens
   where quote_id = (select id from _ids where key = 'q2') and revoked_at is null), 1::bigint,
  'a quote has one live token after a resend');
insert into _tap (line) select is(
  (select delivery_attempts from public.quote_share_tokens where id = (select id from _ids where key = 'tok2b')), 2,
  'a resend counts as the next delivery attempt');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.portal_token_get_quote(repeat('b', 64))$$, 'P0002', null, 'the replaced link stops working');

-- Approving via the link -------------------------------------------------------------------------
insert into _tap (line) select lives_ok(
  $$select public.portal_token_approve(repeat('c', 64))$$, 'the client approves through the link');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.requests where id = (select id from _ids where key = 'req1')), 'approved',
  'approval moves the request to approved');
insert into _tap (line) select is(
  (select c.email from public.quotes q join public.clients c on c.id = q.client_id and c.organization_id = q.organization_id
   where q.id = (select id from _ids where key = 'q2')),
  'pat@example.com', 'approval creates or links the client from the original prospect email');
select set_config('role', 'service_role', true);
insert into _tap (line) select is(
  (public.portal_token_get_quote(repeat('c', 64)) ->> 'status'), 'approved', 'the link still shows the outcome');
insert into _tap (line) select throws_ok(
  $$select public.portal_token_approve(repeat('c', 64))$$, 'P0002', null, 'a quote can''t be approved twice');
insert into _tap (line) select throws_ok(
  $$select public.portal_token_decline(repeat('c', 64), 'changed my mind')$$, 'P0002', null,
  'an approved quote can''t be declined');

-- Converting the approved quote converts the request ---------------------------------------------
select set_config('role', 'postgres', true);
insert into public.properties (organization_id, client_id, address_line1, city)
select organization_id, client_id, '5 Elm St', 'Edmonton' from public.quotes where id = (select id from _ids where key = 'q2');
insert into public.jobs (organization_id, client_id, property_id, title, start_date, quote_id)
select q.organization_id, q.client_id, p.id, 'From quote', current_date, q.id
from public.quotes q join public.properties p on p.client_id = q.client_id
where q.id = (select id from _ids where key = 'q2');
insert into _tap (line) select is(
  (select status::text from public.requests where id = (select id from _ids where key = 'req1')), 'converted',
  'converting the quote to a job converts the request');

-- Pull back and decline on the second request --------------------------------------------------
select set_config('role', 'authenticated', true);
insert into _ids select 'q3', public.create_quote_draft((select id from _ids where key = 'req2'));
select set_config('role', 'postgres', true);
update public.quotes set valid_until = current_date + 7 where id = (select id from _ids where key = 'q3');
insert into public.quote_line_items (organization_id, quote_id, description, quantity, unit_price_cents, position)
select organization_id, id, 'Mow lawn', 1, 5000, 1 from public.quotes where id = (select id from _ids where key = 'q3');
select set_config('role', 'authenticated', true);
insert into _ids select 'tok3', public.send_quote((select id from _ids where key = 'q3'), repeat('d', 64));
select public.pull_back_quote((select id from _ids where key = 'q3'));
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select status::text from public.quotes where id = (select id from _ids where key = 'q3')), 'draft',
  'pull back returns the quote to draft');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.portal_token_get_quote(repeat('d', 64))$$, 'P0002', null, 'a pulled-back quote''s link stops working');

select set_config('role', 'authenticated', true);
insert into _ids select 'tok3b', public.send_quote((select id from _ids where key = 'q3'), repeat('e', 64));
select set_config('role', 'service_role', true);
select public.portal_token_decline(repeat('e', 64), 'too expensive');
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select declined_reason from public.quotes where id = (select id from _ids where key = 'q3')), 'too expensive',
  'a decline records the reason');
insert into _tap (line) select is(
  (select status::text from public.requests where id = (select id from _ids where key = 'req2')), 'reviewing',
  'a declined quote returns the request to reviewing');

-- Expiry -------------------------------------------------------------------------------------------
select set_config('role', 'authenticated', true);
insert into _ids select 'q4', public.create_quote_draft((select id from _ids where key = 'req2'), (select id from _ids where key = 'q3'));
select set_config('role', 'postgres', true);
insert into _tap (line) select is(
  (select count(*) from public.quote_line_items where quote_id = (select id from _ids where key = 'q4')), 1::bigint,
  'a revision can copy the previous quote''s lines');
update public.quotes set valid_until = current_date + 7 where id = (select id from _ids where key = 'q4');
select set_config('role', 'authenticated', true);
insert into _ids select 'tok4', public.send_quote((select id from _ids where key = 'q4'), repeat('f', 64));
select set_config('role', 'postgres', true);
update public.quote_share_tokens set expires_at = now() - interval '1 minute' where id = (select id from _ids where key = 'tok4');
select set_config('role', 'service_role', true);
insert into _tap (line) select throws_ok(
  $$select public.portal_token_get_quote(repeat('f', 64))$$, 'P0002', null, 'an expired token shows nothing');
select set_config('role', 'postgres', true);
-- Back-date past the send-time guard (triggers off for this setup step only).
set local session_replication_role = replica;
update public.quotes set valid_until = current_date - 2 where id = (select id from _ids where key = 'q4');
set local session_replication_role = origin;
select private.expire_quotes();
insert into _tap (line) select is(
  (select status::text from public.quotes where id = (select id from _ids where key = 'q4')), 'expired',
  'the expire job expires a sent quote past valid_until');
insert into _tap (line) select is(
  (select status::text from public.requests where id = (select id from _ids where key = 'req2')), 'reviewing',
  'expiry with no live quote leaves the request reviewing');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;

rollback;
