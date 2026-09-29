-- Tenancy & identity: organizations, profiles, staff membership, invitations,
-- pay rates, document numbering, and the RLS helper functions every later
-- migration builds on.
-- See docs/database/tables/tenancy.md and docs/database/rls.md.

------------------------------------------------------------------------------
-- Enums
------------------------------------------------------------------------------

create type public.org_role as enum ('owner', 'admin', 'dispatcher', 'worker');
create type public.member_status as enum ('invited', 'active', 'disabled');
create type public.document_kind as enum ('quote', 'job', 'invoice');

------------------------------------------------------------------------------
-- organizations
------------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default private.uuid_generate_v7(),
  name text not null check (length(trim(name)) > 0),
  slug extensions.citext not null unique
    check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone text not null default 'America/Edmonton',
  currency char(3) not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  country char(2) not null default 'CA' check (country ~ '^[A-Z]{2}$'),
  email extensions.citext,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  logo_path text,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  stripe_account_id text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_created_by_idx on public.organizations (created_by);

comment on table public.organizations is
  'A contractor business: the tenant boundary. See docs/database/tables/tenancy.md';

-- A CHECK constraint can't query pg_timezone_names, so a trigger validates it.
create function private.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger validate_timezone
  before insert or update of timezone on public.organizations
  for each row execute function private.validate_timezone();

create trigger set_updated_at
  before update on public.organizations
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- profiles (one per auth user)
------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.profiles
  for each row execute function extensions.moddatetime(updated_at);

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill users that signed up before this trigger existed.
insert into public.profiles (id, full_name, phone)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.phone
from auth.users u
on conflict (id) do nothing;

------------------------------------------------------------------------------
-- organization_members (staff; the employee record)
------------------------------------------------------------------------------

create table public.organization_members (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  role public.org_role not null default 'worker',
  status public.member_status not null default 'active',
  display_name text not null check (length(trim(display_name)) > 0),
  email extensions.citext,
  phone text,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  home_location extensions.geography(point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id)
);

-- Used by every RLS helper: "which orgs is the caller in, with what role?"
create index organization_members_user_org_idx
  on public.organization_members (user_id, organization_id) include (role, status);

comment on table public.organization_members is
  'Staff of an organization. user_id is null for crew members without a login.';

create trigger set_updated_at
  before update on public.organization_members
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- RLS helpers
--
-- The my_org_ids() form is the one policies should use:
--   using (organization_id in (select private.my_org_ids()))
-- The subquery has no reference to the row, so Postgres evaluates it once
-- per statement (an InitPlan) rather than once per row.
------------------------------------------------------------------------------

create function private.my_org_ids(p_roles public.org_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and (p_roles is null or m.role = any (p_roles))
$$;

create function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
$$;

create function private.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (p_roles)
  )
$$;

create function private.my_member_id(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.organization_members m
  where m.organization_id = p_org
    and m.user_id = (select auth.uid())
    and m.status = 'active'
$$;

grant execute on function
  private.my_org_ids(public.org_role[]),
  private.is_org_member(uuid),
  private.has_org_role(uuid, public.org_role[]),
  private.my_member_id(uuid)
to authenticated;

------------------------------------------------------------------------------
-- Membership integrity
------------------------------------------------------------------------------

-- Every organization keeps at least one active owner.
create function private.ensure_org_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active' then
    -- The whole organization is being deleted (cascade), so allow it.
    if not exists (select 1 from public.organizations where id = old.organization_id) then
      return null;
    end if;
    if not exists (
      select 1 from public.organization_members
      where organization_id = old.organization_id and role = 'owner' and status = 'active'
    ) then
      raise exception 'an organization must keep at least one active owner'
        using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create trigger ensure_org_has_owner
  after update of role, status or delete on public.organization_members
  for each row execute function private.ensure_org_has_owner();

-- Blocks role escalation. Only owners grant, remove, or demote the owner
-- role, and nobody changes their own role or status. Trusted server code
-- (no auth.uid()) is exempt.
create function private.guard_member_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role public.org_role;
begin
  if caller is null then
    return new;
  end if;

  -- Bootstrap: the first member of a brand-new organization (inserted by
  -- create_organization) becomes its owner.
  if tg_op = 'INSERT' and not exists (
    select 1 from public.organization_members where organization_id = new.organization_id
  ) then
    return new;
  end if;

  select role into caller_role
  from public.organization_members
  where organization_id = new.organization_id and user_id = caller and status = 'active';

  if tg_op = 'UPDATE' then
    if old.user_id = caller
       and (new.role is distinct from old.role or new.status is distinct from old.status) then
      raise exception 'you cannot change your own role or status' using errcode = '42501';
    end if;
    if old.role = 'owner' and new.role <> 'owner' and caller_role is distinct from 'owner' then
      raise exception 'only owners can change an owner''s role' using errcode = '42501';
    end if;
  end if;

  if new.role = 'owner'
     and (tg_op = 'INSERT' or old.role <> 'owner')
     and caller_role is distinct from 'owner' then
    raise exception 'only owners can grant the owner role' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_member_role
  before insert or update of role, status on public.organization_members
  for each row execute function private.guard_member_role();

------------------------------------------------------------------------------
-- organization_invitations
------------------------------------------------------------------------------

create table public.organization_invitations (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email extensions.citext not null,
  role public.org_role not null default 'worker' check (role <> 'owner'),
  member_id uuid,
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete cascade
);

create unique index organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, email)
  where accepted_at is null;
create index organization_invitations_member_idx
  on public.organization_invitations (organization_id, member_id);
create index organization_invitations_invited_by_idx
  on public.organization_invitations (invited_by);

create trigger set_updated_at
  before update on public.organization_invitations
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- member_pay_rates
------------------------------------------------------------------------------

create table public.member_pay_rates (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null,
  hourly_rate_cents bigint not null check (hourly_rate_cents >= 0),
  effective_from date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, effective_from),
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete cascade
);

create index member_pay_rates_org_member_idx
  on public.member_pay_rates (organization_id, member_id, effective_from desc);

create trigger set_updated_at
  before update on public.member_pay_rates
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- document_sequences + next_document_number()
------------------------------------------------------------------------------

create table public.document_sequences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.document_kind not null,
  next_value bigint not null default 1001 check (next_value > 0),
  primary key (organization_id, kind)
);

comment on table public.document_sequences is
  'Per-org gap-free counters for Q-/J-/INV- numbers. Only accessed via private.next_document_number().';

-- Gap-free: the counter row is locked until the calling transaction commits,
-- and a rollback returns the number. Counters are created lazily.
create function private.next_document_number(p_org uuid, p_kind public.document_kind)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v bigint;
  prefix text;
begin
  insert into public.document_sequences as s (organization_id, kind, next_value)
  values (p_org, p_kind, 1002)
  on conflict (organization_id, kind)
    do update set next_value = s.next_value + 1
  returning s.next_value - 1 into v;

  select coalesce(
    o.settings ->> (p_kind::text || '_prefix'),
    case p_kind when 'quote' then 'Q-' when 'job' then 'J-' else 'INV-' end
  )
  into prefix
  from public.organizations o
  where o.id = p_org;

  return prefix || v;
end;
$$;

------------------------------------------------------------------------------
-- RPCs
------------------------------------------------------------------------------

-- Creates an organization and makes the caller its owner.
create function public.create_organization(
  p_name text,
  p_slug text,
  p_timezone text default 'America/Edmonton'
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org public.organizations;
  owner_name text;
  owner_email text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, timezone, created_by)
  values (p_name, p_slug, p_timezone, uid)
  returning * into org;

  select coalesce(nullif(trim(p.full_name), ''), u.email), u.email
  into owner_name, owner_email
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = uid;

  insert into public.organization_members (organization_id, user_id, role, display_name, email)
  values (org.id, uid, 'owner', coalesce(owner_name, 'Owner'), owner_email);

  return org;
end;
$$;

-- Accepts an invitation for the signed-in user, whose email must match.
create function public.accept_invitation(p_token text)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  user_email extensions.citext;
  user_name text;
  inv public.organization_invitations;
  member public.organization_members;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select u.email, coalesce(nullif(trim(p.full_name), ''), u.email)
  into user_email, user_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = uid;

  select * into inv
  from public.organization_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found or inv.email is distinct from user_email then
    raise exception 'invitation is invalid or has expired' using errcode = '22023';
  end if;

  if inv.member_id is not null then
    update public.organization_members
    set user_id = uid, status = 'active', role = inv.role
    where organization_id = inv.organization_id and id = inv.member_id and user_id is null
    returning * into member;
  else
    insert into public.organization_members (organization_id, user_id, role, display_name, email)
    values (inv.organization_id, uid, inv.role, user_name, user_email)
    on conflict (organization_id, user_id) do nothing
    returning * into member;
  end if;

  if member.id is null then
    raise exception 'you are already a member of this organization' using errcode = '23505';
  end if;

  update public.organization_invitations set accepted_at = now() where id = inv.id;

  return member;
end;
$$;

revoke execute on function public.create_organization(text, text, text) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.member_pay_rates enable row level security;
alter table public.document_sequences enable row level security;
-- document_sequences: no policies. Accessed only through the function above.

-- organizations: staff read their orgs, and owner/admin update them.
-- Rows are created through create_organization(), and deletion is service-role only.
create policy "Staff can view their organizations"
  on public.organizations for select to authenticated
  using (id in (select private.my_org_ids()));

create policy "Owners and admins can update their organization"
  on public.organizations for update to authenticated
  using (id in (select private.my_org_ids('{owner,admin}')))
  with check (id in (select private.my_org_ids('{owner,admin}')));

-- profiles: each user manages their own profile. Created by the auth trigger.
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organization_members: all staff can see the roster, and owner/admin manage it.
create policy "Staff can view members of their organizations"
  on public.organization_members for select to authenticated
  using (organization_id in (select private.my_org_ids()));

create policy "Owners and admins can add members"
  on public.organization_members for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Owners and admins can update members"
  on public.organization_members for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Owners and admins can remove members"
  on public.organization_members for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')));

-- organization_invitations and member_pay_rates: owner/admin only.
create policy "Owners and admins manage invitations"
  on public.organization_invitations for all to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Owners and admins manage pay rates"
  on public.member_pay_rates for all to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
