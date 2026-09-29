-- Catalog & tax: the org's price list and its named, stackable tax rates.
-- See docs/database/tables/catalog-tax.md.
--
-- RLS: owner/admin manage both. Dispatchers read both. Workers read
-- services (the names shown on visits) but not tax rates.

create type public.service_unit as enum ('each', 'hour', 'visit', 'sqft', 'linear_ft', 'yard', 'bag');

------------------------------------------------------------------------------
-- services
------------------------------------------------------------------------------

create table public.services (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  unit public.service_unit not null default 'each',
  default_price_cents bigint not null default 0 check (default_price_cents >= 0),
  default_duration_minutes integer check (default_duration_minutes > 0),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index services_org_name_idx
  on public.services (organization_id, lower(name)) where archived_at is null;

create trigger set_updated_at
  before update on public.services
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- tax_rates
------------------------------------------------------------------------------

create table public.tax_rates (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  percentage numeric(7, 4) not null check (percentage >= 0 and percentage <= 100),
  registration_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

comment on column public.tax_rates.percentage is
  '5.0000 = 5%. Never edit a rate once documents use it: add a new rate and deactivate the old one.';

create trigger set_updated_at
  before update on public.tax_rates
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- service_default_taxes
------------------------------------------------------------------------------

create table public.service_default_taxes (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_id uuid not null,
  tax_rate_id uuid not null,
  primary key (organization_id, service_id, tax_rate_id),
  foreign key (organization_id, service_id)
    references public.services (organization_id, id) on delete cascade,
  foreign key (organization_id, tax_rate_id)
    references public.tax_rates (organization_id, id) on delete cascade
);

create index service_default_taxes_tax_rate_idx
  on public.service_default_taxes (organization_id, tax_rate_id);

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------

alter table public.services enable row level security;
alter table public.tax_rates enable row level security;
alter table public.service_default_taxes enable row level security;

create policy "Staff can view services"
  on public.services for select to authenticated
  using (organization_id in (select private.my_org_ids()));
create policy "Owners and admins can add services"
  on public.services for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can update services"
  on public.services for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can delete services"
  on public.services for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Office staff can view tax rates"
  on public.tax_rates for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Owners and admins can add tax rates"
  on public.tax_rates for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can update tax rates"
  on public.tax_rates for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can delete tax rates"
  on public.tax_rates for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Office staff can view service default taxes"
  on public.service_default_taxes for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Owners and admins can add service default taxes"
  on public.service_default_taxes for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can remove service default taxes"
  on public.service_default_taxes for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')));
