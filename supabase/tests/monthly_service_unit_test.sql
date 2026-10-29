-- Hermetic pricing-unit contract. All fixtures roll back.
begin;
set local search_path = extensions, public;
create temp table _tap (n serial primary key, line text);
insert into _tap (line) select plan(6);

insert into _tap (line) select is(
  enum_range(null::public.service_unit)::text,
  '{monthly,hour,visit,sqft,linear_ft,yard,bag}',
  'monthly replaces each while preserving the other pricing units');
insert into _tap (line) select throws_ok($$select 'each'::public.service_unit$$,
  '22P02', 'invalid input value for enum service_unit: "each"',
  'each is no longer accepted');
insert into _tap (line) select throws_ok($$select 'job'::public.service_unit$$,
  '22P02', 'invalid input value for enum service_unit: "job"',
  'job is not a pricing unit');

insert into public.organizations (name, slug)
values ('Monthly unit QA', 'pgtap-monthly-unit');
insert into public.services (organization_id, name)
select id, 'Default monthly service' from public.organizations
where slug = 'pgtap-monthly-unit';
insert into _tap (line) select is(
  (select unit::text from public.services where name = 'Default monthly service'
   and organization_id = (select id from public.organizations where slug = 'pgtap-monthly-unit')),
  'monthly', 'omitting the unit uses the renamed default');

insert into public.services (organization_id, name, unit, default_price_cents)
select id, 'Explicit monthly service', 'monthly', 12500
from public.organizations where slug = 'pgtap-monthly-unit';
insert into _tap (line) select is(
  (select default_price_cents from public.services where name = 'Explicit monthly service'
   and organization_id = (select id from public.organizations where slug = 'pgtap-monthly-unit')),
  12500::bigint, 'monthly pricing preserves the supplied price');
insert into _tap (line) select is(
  (select frequencies::text from public.services where name = 'Explicit monthly service'
   and organization_id = (select id from public.organizations where slug = 'pgtap-monthly-unit')),
  '{one_time}', 'monthly pricing does not change visit frequency');

insert into _tap (line) select * from finish();
select string_agg(line, e'\n' order by n) as tap from _tap;
rollback;
