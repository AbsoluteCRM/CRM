-- Clients & properties: who pays, where the work happens, who to contact,
-- and which logins can use the customer portal.
-- See docs/database/tables/clients.md.
--
-- RLS: office staff (owner/admin/dispatcher) only. Workers read what they
-- need through worker_* RPCs, and portal users through portal_* RPCs,
-- because RLS can't hide internal columns such as notes (ADR 0010).

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
  email text check (email = lower(email)),
  phone text,
  billing_address_line1 text,
  billing_address_line2 text,
  billing_city text,
  billing_region text,
  billing_postal_code text,
  billing_country text check (billing_country ~ '^[A-Z]{2}$'),
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
-- Name search within one org: btree_gin lets the org be part of the GIN key.
create index clients_org_display_name_trgm_idx
  on public.clients using gin (organization_id, display_name extensions.gin_trgm_ops);

create trigger set_updated_at
  before update on public.clients
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, kind, status, display_name, first_name, last_name, company_name,
              email, phone, billing_address_line1, billing_address_line2, billing_city,
              billing_region, billing_postal_code, billing_country, lead_source, tags, notes,
              tax_exempt, archived_at)
  on public.clients to authenticated;
grant update (kind, status, display_name, first_name, last_name, company_name, email, phone,
              billing_address_line1, billing_address_line2, billing_city, billing_region,
              billing_postal_code, billing_country, lead_source, tags, notes, tax_exempt,
              archived_at)
  on public.clients to authenticated;

------------------------------------------------------------------------------
-- client_contacts
------------------------------------------------------------------------------

create table public.client_contacts (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  role text,
  email text check (email = lower(email)),
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
  on public.client_contacts (organization_id, client_id) where is_primary;

create trigger set_updated_at
  before update on public.client_contacts
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, client_id, name, role, email, phone, is_primary, receives_invoices)
  on public.client_contacts to authenticated;
grant update (name, role, email, phone, is_primary, receives_invoices)
  on public.client_contacts to authenticated;

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
  country text not null default 'CA' check (country ~ '^[A-Z]{2}$'),
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
  -- Lets quotes and jobs prove with one composite FK that property_id
  -- belongs to client_id. Also serves the (organization_id, client_id) FK.
  unique (organization_id, client_id, id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict
);

create index properties_org_location_idx on public.properties using gist (organization_id, location);

create trigger set_updated_at
  before update on public.properties
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, client_id, name, address_line1, address_line2, city, region,
              postal_code, country, location, geocoded_at, geocode_source, access_notes,
              lot_size_sqft, archived_at)
  on public.properties to authenticated;
grant update (name, address_line1, address_line2, city, region, postal_code, country, location,
              geocoded_at, geocode_source, access_notes, lot_size_sqft, archived_at)
  on public.properties to authenticated;

------------------------------------------------------------------------------
-- client_portal_users
------------------------------------------------------------------------------

create table public.client_portal_users (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, client_id, user_id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete cascade
);

create index client_portal_users_user_idx on public.client_portal_users (user_id);

grant insert (organization_id, client_id, user_id) on public.client_portal_users to authenticated;

-- (organization_id, client_id) pairs the caller can see in the portal
-- (archived clients excluded). Portal RPCs join on both columns, so every
-- lookup uses an (organization_id, client_id, …) index.
create function private.portal_clients()
returns table (organization_id uuid, client_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select pu.organization_id, pu.client_id
  from public.client_portal_users pu
  join public.clients c on c.organization_id = pu.organization_id and c.id = pu.client_id
  where pu.user_id = (select auth.uid())
    and c.archived_at is null
$$;

------------------------------------------------------------------------------
-- Row level security (office staff)
------------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.properties enable row level security;
alter table public.client_portal_users enable row level security;

create policy "Office staff can view clients"
  on public.clients for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add clients"
  on public.clients for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update clients"
  on public.clients for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete clients"
  on public.clients for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view client contacts"
  on public.client_contacts for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add client contacts"
  on public.client_contacts for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update client contacts"
  on public.client_contacts for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete client contacts"
  on public.client_contacts for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view properties"
  on public.properties for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add properties"
  on public.properties for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update properties"
  on public.properties for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete properties"
  on public.properties for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view portal access"
  on public.client_portal_users for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can grant portal access"
  on public.client_portal_users for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can revoke portal access"
  on public.client_portal_users for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

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
  select c.id, c.organization_id, o.name, c.display_name, c.email, c.phone
  from private.portal_clients() pc
  join public.clients c on c.organization_id = pc.organization_id and c.id = pc.client_id
  join public.organizations o on o.id = c.organization_id
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
  from private.portal_clients() pc
  join public.properties p on p.organization_id = pc.organization_id and p.client_id = pc.client_id
  where p.archived_at is null
  order by p.address_line1
$$;

revoke execute on function public.portal_my_clients(), public.portal_my_properties() from public, anon;
grant execute on function public.portal_my_clients(), public.portal_my_properties() to authenticated;
