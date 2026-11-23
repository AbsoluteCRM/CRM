-- Recover the four pre-existing hosted member fields in clean replay.
-- Existing production data is retained; exact hosted definitions were inspected.
alter table public.organization_members
  add column if not exists certifications text[] not null default '{}',
  add column if not exists jobs_completed integer not null default 0,
  add column if not exists hours_worked numeric(8,1) not null default 0,
  add column if not exists rating numeric(2,1);

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.organization_members'::regclass and conname = 'organization_members_jobs_completed_check') then
    alter table public.organization_members add constraint organization_members_jobs_completed_check check (jobs_completed >= 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.organization_members'::regclass and conname = 'organization_members_hours_worked_check') then
    alter table public.organization_members add constraint organization_members_hours_worked_check check (hours_worked >= 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.organization_members'::regclass and conname = 'organization_members_rating_check') then
    alter table public.organization_members add constraint organization_members_rating_check check (rating >= 1 and rating <= 5);
  end if;
end;
$$;

grant update (certifications) on public.organization_members to authenticated;
