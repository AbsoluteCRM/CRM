-- Recovered hosted member metadata must retain defaults and bounds.
begin;
set local search_path = extensions, public;
select plan(6);
insert into public.organizations (id, name, slug)
values ('00000000-0000-0000-0000-00000000cd01', 'Member metadata test', 'pgtap-member-metadata');
insert into public.organization_members (id, organization_id, display_name)
values ('00000000-0000-0000-0000-00000000cd02', '00000000-0000-0000-0000-00000000cd01', 'Metadata member');
select is((select certifications from public.organization_members where id='00000000-0000-0000-0000-00000000cd02'), '{}'::text[], 'certifications default to empty');
select is((select jobs_completed from public.organization_members where id='00000000-0000-0000-0000-00000000cd02'), 0, 'completed jobs default to zero');
select is((select hours_worked from public.organization_members where id='00000000-0000-0000-0000-00000000cd02'), 0::numeric, 'hours default to zero');
select throws_ok($$update public.organization_members set jobs_completed=-1 where id='00000000-0000-0000-0000-00000000cd02'$$, '23514', null, 'negative job counts rejected');
select throws_ok($$update public.organization_members set hours_worked=-1 where id='00000000-0000-0000-0000-00000000cd02'$$, '23514', null, 'negative hours rejected');
select throws_ok($$update public.organization_members set rating=6 where id='00000000-0000-0000-0000-00000000cd02'$$, '23514', null, 'out-of-range ratings rejected');
select * from finish();
rollback;
