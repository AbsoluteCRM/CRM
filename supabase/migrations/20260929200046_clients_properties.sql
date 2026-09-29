-- Clients & properties: who pays, where the work happens, who to contact,
-- and which logins can use the customer portal.
-- See docs/database/tables/clients.md.
--
-- RLS: office staff (owner/admin/dispatcher) have full access. Worker read
-- access is added in the routing migration, once "visits on my routes"
-- exists. Portal users have no direct access to these tables, because RLS
-- can't hide internal columns such as notes. They read through portal_*
-- RPCs instead.

create type public.client_kind as enum ('individual', 'company');
create type public.client_status as enum ('lead', 'active', 'inactive');

------------------------------------------------------------------------------
-- clients
------------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.client_kind not null default 'individual',
  status public.client_status not null default 'active',
  display_name text not null check (length(trim(display_name)) > 0),
  first_name text,
  last_name text,
  company_name text,
  email extensions.citext,
  phone text,
  billing_address_line1 text,
  billing_address_line2 text,
  billing_city text,
  billing_region text,
  billing_postal_code text,
  billing_country char(2) check (billing_country ~ '^[A-Z]{2}$'),
  lead_source text,
  tags text[] not null default '{}',
  notes text,
  tax_exempt boolean not null default false,
  stripe_customer_id text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, stripe_customer_id),
  check (kind <> 'company' or coalesce(length(trim(company_name)), 0) > 0)
);

create index clients_org_status_idx
  on public.clients (organization_id, status) where archived_at is null;
create index clients_display_name_trgm_idx
  on public.clients using gin (display_name extensions.gin_trgm_ops);

create trigger set_updated_at
  before update on public.clients
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- client_contacts
------------------------------------------------------------------------------

create table public.client_contacts (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  role text,
  email extensions.citext,
  phone text,
  is_primary boolean not null default false,
  receives_invoices boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete cascade
);

create index client_contacts_client_idx on public.client_contacts (organization_id, client_id);
create unique index client_contacts_one_primary_idx
  on public.client_contacts (client_id) where is_primary;

create trigger set_updated_at
  before update on public.client_contacts
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- properties
------------------------------------------------------------------------------

create table public.properties (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  name text,
  address_line1 text not null check (length(trim(address_line1)) > 0),
  address_line2 text,
  city text not null,
  region text,
  postal_code text,
  country char(2) not null default 'CA' check (country ~ '^[A-Z]{2}$'),
  location extensions.geography(point, 4326),
  latitude double precision
    generated always as (extensions.st_y(location::extensions.geometry)) stored,
  longitude double precision
    generated always as (extensions.st_x(location::extensions.geometry)) stored,
  geocoded_at timestamptz,
  geocode_source text,
  access_notes text,
  lot_size_sqft integer check (lot_size_sqft > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict
);

create index properties_client_idx on public.properties (organization_id, client_id);
create index properties_location_idx on public.properties using gist (location);

create trigger set_updated_at
  before update on public.properties
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- client_portal_users
------------------------------------------------------------------------------

create table public.client_portal_users (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, user_id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete cascade
);

create index client_portal_users_client_idx on public.client_portal_users (organization_id, client_id);
create index client_portal_users_user_idx on public.client_portal_users (user_id);

create trigger set_updated_at
  before update on public.client_portal_users
  for each row execute function extensions.moddatetime(updated_at);

-- Clients the caller can see in the portal (archived clients excluded).
create function private.portal_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pu.client_id
  from public.client_portal_users pu
  join public.clients c on c.id = pu.client_id
  where pu.user_id = (select auth.uid())
    and c.archived_at is null
$$;

grant execute on function private.portal_client_ids() to authenticated;

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.properties enable row level security;
alter table public.client_portal_users enable row level security;

-- clients: office staff. The select policy is replaced in the routing
-- migration to add worker access.
create policy "Office staff can view clients"
  on public.clients for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can add clients"
  on public.clients for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update clients"
  on public.clients for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can delete clients"
  on public.clients for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

-- client_contacts: office staff. Worker access is added with routing.
create policy "Office staff can view client contacts"
  on public.client_contacts for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can add client contacts"
  on public.client_contacts for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update client contacts"
  on public.client_contacts for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can delete client contacts"
  on public.client_contacts for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

-- properties: office staff. Worker access is added with routing.
create policy "Office staff can view properties"
  on public.properties for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can add properties"
  on public.properties for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update properties"
  on public.properties for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can delete properties"
  on public.properties for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

-- client_portal_users: office staff manage them, and portal users can see
-- their own links.
create policy "Office staff and the linked user can view portal access"
  on public.client_portal_users for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or user_id = (select auth.uid())
  );
create policy "Office staff can grant portal access"
  on public.client_portal_users for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update portal access"
  on public.client_portal_users for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can revoke portal access"
  on public.client_portal_users for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

------------------------------------------------------------------------------
-- Portal RPCs (client-safe columns only)
------------------------------------------------------------------------------

create function public.portal_my_clients()
returns table (
  client_id uuid,
  organization_id uuid,
  organization_name text,
  display_name text,
  email text,
  phone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.organization_id, o.name, c.display_name, c.email::text, c.phone
  from public.clients c
  join public.organizations o on o.id = c.organization_id
  where c.id in (select private.portal_client_ids())
  order by o.name, c.display_name
$$;

create function public.portal_my_properties()
returns table (
  property_id uuid,
  client_id uuid,
  name text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  access_notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.client_id, p.name, p.address_line1, p.address_line2,
         p.city, p.region, p.postal_code, p.access_notes
  from public.properties p
  where p.client_id in (select private.portal_client_ids())
    and p.archived_at is null
  order by p.address_line1
$$;

revoke execute on function public.portal_my_clients() from public, anon;
revoke execute on function public.portal_my_properties() from public, anon;
grant execute on function public.portal_my_clients() to authenticated;
grant execute on function public.portal_my_properties() to authenticated;
