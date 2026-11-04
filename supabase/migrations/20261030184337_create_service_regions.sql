
create table public.service_regions (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null
    references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  crew_id uuid,
  boundary extensions.geometry(Polygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),

  foreign key (organization_id, crew_id)
    references public.crews (organization_id, id)
    on delete set null (crew_id),

  constraint service_regions_valid_boundary
    check (extensions.ST_IsValid(boundary))
);

create unique index service_regions_org_name_idx
  on public.service_regions (organization_id, lower(name));

create index service_regions_boundary_idx
  on public.service_regions
  using gist (boundary);

create trigger set_updated_at
  before update on public.service_regions
  for each row execute function extensions.moddatetime(updated_at);

grant select on public.service_regions to authenticated;
grant insert (organization_id, name, crew_id, boundary)
  on public.service_regions to authenticated;
grant update (name, crew_id, boundary)
  on public.service_regions to authenticated;
grant delete on public.service_regions to authenticated;

alter table public.service_regions enable row level security;

create policy "Staff can view service regions"
  on public.service_regions for select to authenticated
  using (
    organization_id = any (array(select private.my_org_ids()))
  );

create policy "Admins can add service regions"
  on public.service_regions for insert to authenticated
  with check (
    organization_id = any (
      array(select private.my_org_ids('{owner,admin}'))
    )
  );

create policy "Admins can update service regions"
  on public.service_regions for update to authenticated
  using (
    organization_id = any (
      array(select private.my_org_ids('{owner,admin}'))
    )
  )
  with check (
    organization_id = any (
      array(select private.my_org_ids('{owner,admin}'))
    )
  );

create policy "Admins can delete service regions"
  on public.service_regions for delete to authenticated
  using (
    organization_id = any (
      array(select private.my_org_ids('{owner,admin}'))
    )
  );
