-- Tenancy & identity: organizations, profiles, staff membership, invitations,
-- pay rates, document numbering, and the RLS helpers every later migration
-- builds on.
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
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  timezone text not null default 'America/Edmonton',
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  country text not null default 'CA' check (country ~ '^[A-Z]{2}$'),
  email text check (email = lower(email)),
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  logo_path text,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  stripe_account_id text unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organizations_created_by_idx on public.organizations (created_by);

comment on table public.organizations is
  'A contractor business: the tenant boundary. See docs/database/tables/tenancy.md';
comment on column public.organizations.stripe_account_id is
  'Stripe Connect account. Written only by the service role during onboarding (ADR 0008).';

-- A CHECK constraint can't query pg_timezone_names, so a trigger validates
-- it. (`at time zone` would also accept abbreviations such as MST, which
-- have no DST rules.)
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

-- Rows are created by create_organization(). Slug, currency, and the Stripe
-- account are fixed after creation (service role only).
grant update (name, timezone, country, email, phone, address_line1, address_line2, city,
              region, postal_code, logo_path, settings)
  on public.organizations to authenticated;

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

grant update (full_name, phone, avatar_path) on public.profiles to authenticated;

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
  email text check (email = lower(email)),
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
  'Staff of an organization. user_id is null for crew members without a login. '
  'A login is linked only by accept_invitation() or create_organization().';

create trigger set_updated_at
  before update on public.organization_members
  for each row execute function extensions.moddatetime(updated_at);

-- user_id is never written through the API, so an admin can't attach a
-- login to (or detach one from) any member row, including an owner's.
grant insert (organization_id, role, status, display_name, email, phone, color, home_location)
  on public.organization_members to authenticated;
grant update (role, status, display_name, email, phone, color, home_location)
  on public.organization_members to authenticated;

------------------------------------------------------------------------------
-- RLS helpers
--
-- Policies use the array form, which the planner turns into an index
-- condition (the `in (select …)` form becomes a per-row hashed filter):
--   using (organization_id = any (array(select private.my_org_ids())))
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
    where m.user_id = (select auth.uid())
      and m.organization_id = p_org
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
    where m.user_id = (select auth.uid())
      and m.organization_id = p_org
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
  where m.user_id = (select auth.uid())
    and m.organization_id = p_org
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

-- Locks the organization row and reports whether it exists. Owner-count
-- checks take it first, so concurrent owner changes in one org run one at a
-- time.
create function private.lock_organization(p_org uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.organizations where id = p_org for update;
  return found;
end;
$$;

-- before insert/update/delete. Checks direct API writes only: trusted server
-- code and the security definer RPCs (create_organization,
-- accept_invitation) run as their owner, not as `authenticated`. So this
-- function is security invoker, and reads through definer helpers.
-- - Only owners add, change, or remove an owner row (any column, including
--   status), or grant the owner role.
-- - Nobody changes their own role or status.
create function private.guard_member_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  org uuid := coalesce(new.organization_id, old.organization_id);
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;

  if ((tg_op <> 'INSERT' and old.role = 'owner') or (tg_op <> 'DELETE' and new.role = 'owner'))
     and not private.has_org_role(org, '{owner}') then
    raise exception 'only owners can add, change, or remove an owner' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.user_id = (select auth.uid())
     and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'you cannot change your own role or status' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger guard_member_change
  before insert or update or delete on public.organization_members
  for each row execute function private.guard_member_change();

-- after update/delete: every organization keeps at least one active owner.
-- The org row is locked before counting, so two concurrent demotions can't
-- both see the other owner and pass.
create function private.ensure_org_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.status = 'active' then
    -- The whole organization is being deleted (cascade), so allow it.
    if not private.lock_organization(old.organization_id) then
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

------------------------------------------------------------------------------
-- organization_invitations
------------------------------------------------------------------------------

create table public.organization_invitations (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.org_role not null default 'worker' check (role <> 'owner'),
  member_id uuid,
  token_hash text not null unique,
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
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

grant insert (organization_id, email, role, member_id, token_hash, expires_at)
  on public.organization_invitations to authenticated;
grant update (role, token_hash, expires_at) on public.organization_invitations to authenticated;

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
  unique (organization_id, member_id, effective_from),
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete cascade
);

create trigger set_updated_at
  before update on public.member_pay_rates
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, member_id, hourly_rate_cents, effective_from, notes)
  on public.member_pay_rates to authenticated;
grant update (hourly_rate_cents, effective_from, notes) on public.member_pay_rates to authenticated;

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

revoke all on public.document_sequences from authenticated;

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

-- before insert: fills `number`. TG_ARGV[0] is the document_kind.
create function private.assign_document_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.number := private.next_document_number(new.organization_id, tg_argv[0]::public.document_kind);
  return new;
end;
$$;

------------------------------------------------------------------------------
-- RPCs
------------------------------------------------------------------------------

-- Creates an organization and makes the caller its owner.
create function public.create_organization(
  p_name text,
  p_slug text,
  p_timezone text default 'America/Edmonton',
  p_currency text default 'CAD',
  p_country text default 'CA'
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

  insert into public.organizations (name, slug, timezone, currency, country, created_by)
  values (p_name, p_slug, p_timezone, p_currency, p_country, uid)
  returning * into org;

  select coalesce(nullif(trim(p.full_name), ''), u.email), lower(u.email)
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
  user_email text;
  user_name text;
  inv public.organization_invitations;
  member public.organization_members;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select lower(u.email), coalesce(nullif(trim(p.full_name), ''), u.email)
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

-- The caller's memberships in every status (invited, active, disabled), for
-- an org switcher. Table policies only expose active memberships.
create function public.my_memberships()
returns table (
  member_id uuid,
  organization_id uuid,
  organization_name text,
  organization_slug text,
  role public.org_role,
  status public.member_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.organization_id, o.name, o.slug, m.role, m.status
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
  order by o.name
$$;

revoke execute on function
  public.create_organization(text, text, text, text, text),
  public.accept_invitation(text),
  public.my_memberships()
from public, anon;
grant execute on function
  public.create_organization(text, text, text, text, text),
  public.accept_invitation(text),
  public.my_memberships()
to authenticated;

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
-- Deletion is service-role only.
create policy "Staff can view their organizations"
  on public.organizations for select to authenticated
  using (id = any (array(select private.my_org_ids())));
create policy "Owners and admins can update their organization"
  on public.organizations for update to authenticated
  using (id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (id = any (array(select private.my_org_ids('{owner,admin}'))));

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
  using (organization_id = any (array(select private.my_org_ids())));
create policy "Owners and admins can add members"
  on public.organization_members for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can update members"
  on public.organization_members for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can remove members"
  on public.organization_members for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

-- organization_invitations and member_pay_rates: owner/admin only.
create policy "Owners and admins manage invitations"
  on public.organization_invitations for all to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins manage pay rates"
  on public.member_pay_rates for all to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
