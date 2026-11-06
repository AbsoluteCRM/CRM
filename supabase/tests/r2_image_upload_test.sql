-- Dedicated rollback-only fixtures. Never run against real tenant data.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
create temp table _ids (key text primary key, id uuid);
grant all on _tap, _tap_n_seq, _ids to authenticated, anon, service_role;
select no_plan();

insert into auth.users (id, email, aud, role)
select ('00000000-0000-0000-0000-00000000b20' || n)::uuid,
       'r2-upload-' || n || '@test.local', 'authenticated', 'authenticated'
from generate_series(1, 8) n;
insert into public.organizations (name, slug)
values ('R2 upload A', 'pgtap-r2-upload-a'), ('R2 upload B', 'pgtap-r2-upload-b'),
       ('R2 upload C', 'pgtap-r2-upload-c');
insert into _ids select right(slug, 1), id from public.organizations
where slug in ('pgtap-r2-upload-a', 'pgtap-r2-upload-b', 'pgtap-r2-upload-c');
insert into public.organization_members (organization_id, user_id, role, status, display_name)
select (select id from _ids where key = 'a'),
       ('00000000-0000-0000-0000-00000000b20' || n)::uuid,
       role::public.org_role, status::public.member_status, 'R2 test ' || n
from (values (1, 'owner', 'active'), (2, 'admin', 'active'),
             (3, 'dispatcher', 'active'), (4, 'worker', 'active'),
             (5, 'worker', 'disabled'), (6, 'worker', 'invited')) as r(n, role, status);
-- Worker is also an employee in B: active-org mismatches must still fail.
insert into public.organization_members (organization_id, user_id, role, display_name)
values ((select id from _ids where key = 'b'), '00000000-0000-0000-0000-00000000b204', 'worker', 'Multi-org employee');
insert into public.clients (organization_id, display_name)
select id, 'R2 test client' from _ids;
insert into public.properties (organization_id, client_id, address_line1, city)
select organization_id, id, '1 Test St', 'Calgary' from public.clients
where organization_id in (select id from _ids);
insert into public.jobs (organization_id, client_id, property_id, title, start_date)
select organization_id, client_id, id, 'R2 test job', current_date from public.properties
where organization_id in (select id from _ids);
insert into _ids select 'job_' || i.key, j.id from public.jobs j
join _ids i on i.id = j.organization_id;
-- A portal-only user in A is not an employee.
insert into public.client_portal_users (organization_id, client_id, user_id)
select organization_id, id, '00000000-0000-0000-0000-00000000b207'::uuid
from public.clients where organization_id = (select id from _ids where key = 'a');

-- Covers every employee role, revoked service secret access, and tenant boundaries.
do $test$
declare n integer;
begin
  for n in 1..8 loop
    perform set_config('request.jwt.claims', json_build_object(
      'sub', '00000000-0000-0000-0000-00000000b20' || n,
      'role', 'authenticated', 'is_anonymous', n = 8)::text, true);
    perform set_config('role', 'authenticated', true);
    if n <= 4 then
      insert into _tap(line) select is(
        public.authorize_image_upload(i.id, 'company_logos/' || i.id), i.id,
        'active employee ' || n || ' can upload logo') from _ids i where key = 'a';
      insert into _tap(line) select is(
        public.authorize_image_upload((select id from _ids where key = 'a'), 'jobs/' || i.id),
        (select id from _ids where key = 'a'), 'active employee ' || n || ' can upload job photo')
      from _ids i where key = 'job_a';
    else
      insert into _tap(line) select throws_ok(
        $$select public.authorize_image_upload((select id from _ids where key = 'a'),
          'company_logos/' || (select id from _ids where key = 'a'))$$,
        '42501', 'Upload target is not permitted', 'inactive, portal, or anonymous user rejected: ' || n);
    end if;
    insert into _tap(line) select throws_ok(
      $$select public.authorize_image_upload((select id from _ids where key = 'c'),
        'company_logos/' || (select id from _ids where key = 'c'))$$,
      '42501', 'Upload target is not permitted', 'foreign org denied for user ' || n);
    insert into _tap(line) select throws_ok(
      $$select public.get_r2_upload_config()$$, '42501', null,
      'employee cannot read Vault config: ' || n);
    perform set_config('role', 'postgres', true);
  end loop;
end;
$test$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b204","role":"authenticated"}', true),
       set_config('role', 'authenticated', true);
insert into _tap(line) select is(
  public.authorize_image_upload(i.id, 'company_logos/' || i.id), i.id,
  'multi-org worker can explicitly select B') from _ids i where key = 'b';
insert into _tap(line) select throws_ok(
  $$select public.authorize_image_upload((select id from _ids where key = 'a'),
    'jobs/' || (select id from _ids where key = 'job_b'))$$,
  '42501', 'Upload target is not permitted', 'multi-org job mismatch denied');
insert into _tap(line) select throws_ok(
  $$select public.authorize_image_upload((select id from _ids where key = 'a'),
    'company_logos/' || (select id from _ids where key = 'b'))$$,
  '42501', 'Upload target is not permitted', 'multi-org logo mismatch denied');
insert into _tap(line) select throws_ok(
  $$select public.authorize_image_upload((select id from _ids where key = 'a'),
    'jobs/00000000-0000-0000-0000-000000000000')$$,
  '42501', 'Upload target is not permitted', 'missing job gives same denial');
insert into _tap(line) select throws_ok(
  format('select public.authorize_image_upload(%L::uuid, %L)',
    (select id from _ids where key = 'a'), folder),
  '42501', 'Upload target is not permitted', 'invalid folder denied: ' || folder)
from (values (''), ('jobs/../x'), ('jobs/%2f'), ('arbitrary/folder')) as f(folder);

select set_config('role', 'anon', true);
insert into _tap(line) select throws_ok($$select public.get_r2_upload_config()$$,
  '42501', null, 'anon cannot read Vault config');
insert into _tap(line) select throws_ok(
  $$select public.authorize_image_upload(null, null)$$, '42501', null,
  'anon cannot authorize upload');
select set_config('role', 'service_role', true);
insert into _tap(line) select throws_ok(
  $$select public.authorize_image_upload(null, null)$$, '42501', null,
  'service role cannot authorize user uploads');
select set_config('role', 'postgres', true);

-- Replace ONLY the five known config names inside this rolled-back transaction.
delete from vault.secrets where name = any (array[
  'r2_account_id', 'r2_access_key_id', 'r2_secret_access_key', 'r2_bucket_name', 'r2_public_base_url'
]);
select set_config('role', 'service_role', true);
insert into _tap(line) select throws_ok($$select public.get_r2_upload_config()$$,
  '55000', 'R2 upload configuration is incomplete', 'missing secrets fail closed');
select set_config('role', 'postgres', true);
select vault.create_secret('fake-test-value', name) from unnest(array[
  'r2_account_id', 'r2_access_key_id', 'r2_secret_access_key', 'r2_bucket_name', 'r2_public_base_url'
]) as f(name);
select vault.create_secret('unrelated-fake-value', 'pgtap_r2_unrelated');
select set_config('role', 'service_role', true);
insert into _tap(line) select is(
  (select count(*)::integer from jsonb_object_keys(public.get_r2_upload_config())), 5,
  'service role receives only five config entries');
insert into _tap(line) select ok(
  not public.get_r2_upload_config() ? 'pgtap_r2_unrelated', 'unrelated secrets not returned');
select set_config('role', 'postgres', true);
select vault.update_secret(id, '   ') from vault.secrets where name = 'r2_account_id';
select set_config('role', 'service_role', true);
insert into _tap(line) select throws_ok($$select public.get_r2_upload_config()$$,
  '55000', 'R2 upload configuration is incomplete', 'blank secret fails closed');
select set_config('role', 'postgres', true);
insert into _tap(line) select * from finish();
select string_agg(line, E'\n' order by n) as results from _tap;
rollback;
