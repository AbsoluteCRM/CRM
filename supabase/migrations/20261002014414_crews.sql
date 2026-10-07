-- Crews: teams (usually one truck) and their default rosters.
-- See docs/database/tables/crews-routing.md.
--
-- RLS: office staff manage crews, and all staff can read them.

create table public.crews (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  vehicle text,
  default_start_location extensions.geography(point, 4326),
  default_end_location extensions.geography(point, 4326),
  default_start_time time not null default '08:00',
  max_work_minutes integer check (max_work_minutes > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index crews_org_name_idx
  on public.crews (organization_id, lower(name)) where archived_at is null;

create trigger set_updated_at
  before update on public.crews
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, name, color, vehicle, default_start_location, default_end_location,
              default_start_time, max_work_minutes, archived_at)
  on public.crews to authenticated;
grant update (name, color, vehicle, default_start_location, default_end_location,
              default_start_time, max_work_minutes, archived_at)
  on public.crews to authenticated;

create table public.crew_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  crew_id uuid not null,
  member_id uuid not null,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, crew_id, member_id),
  foreign key (organization_id, crew_id)
    references public.crews (organization_id, id) on delete cascade,
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete cascade
);

create index crew_members_member_idx on public.crew_members (organization_id, member_id);
create unique index crew_members_one_lead_idx
  on public.crew_members (organization_id, crew_id) where is_lead;

grant insert (organization_id, crew_id, member_id, is_lead) on public.crew_members to authenticated;
grant update (is_lead) on public.crew_members to authenticated;

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;

create policy "Staff can view crews"
  on public.crews for select to authenticated
  using (organization_id = any (array(select private.my_org_ids())));
create policy "Office staff can add crews"
  on public.crews for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update crews"
  on public.crews for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete crews"
  on public.crews for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Staff can view crew members"
  on public.crew_members for select to authenticated
  using (organization_id = any (array(select private.my_org_ids())));
create policy "Office staff can add crew members"
  on public.crew_members for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update crew members"
  on public.crew_members for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can remove crew members"
  on public.crew_members for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
