-- Team availability: each member's weekly work schedule, and time off that
-- contractors request and managers (owner or admin) approve.
-- See docs/database/tables/tenancy.md ("Availability").

------------------------------------------------------------------------------
-- Weekly schedule on the member: ISO weekdays (1 = Monday … 7 = Sunday) and
-- daily hours. Default: Monday to Friday, 8 to 5.
------------------------------------------------------------------------------

alter table public.organization_members
  add column work_days smallint[] not null default '{1,2,3,4,5}'
    check (work_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add column work_start time not null default '08:00',
  add column work_end time not null default '17:00',
  add constraint organization_members_work_hours_check check (work_start < work_end);

-- Owners and admins already update member rows (RLS); these columns join them.
grant update (work_days, work_start, work_end) on public.organization_members to authenticated;

------------------------------------------------------------------------------
-- time_off
------------------------------------------------------------------------------

create type public.time_off_kind as enum ('sick', 'vacation', 'personal');
create type public.time_off_status as enum ('pending', 'approved', 'declined', 'cancelled');

create table public.time_off (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null,
  kind public.time_off_kind not null,
  start_date date not null,
  end_date date not null,
  note text check (length(note) <= 500),
  status public.time_off_status not null default 'pending',
  requested_by_member_id uuid,
  reviewed_by_member_id uuid,
  reviewed_at timestamptz,
  review_note text check (length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (end_date >= start_date and end_date - start_date <= 366),
  check ((status in ('approved', 'declined')) = (reviewed_at is not null) or status = 'cancelled'),
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete cascade,
  foreign key (organization_id, requested_by_member_id)
    references public.organization_members (organization_id, id) on delete set null (requested_by_member_id),
  foreign key (organization_id, reviewed_by_member_id)
    references public.organization_members (organization_id, id) on delete set null (reviewed_by_member_id)
);

comment on table public.time_off is
  'Sick days, vacation and personal time. Contractors request (pending); owners and admins approve or decline, or record approved time off directly. Only approved rows make someone unavailable.';

create index time_off_org_dates_idx on public.time_off (organization_id, start_date, end_date);
create index time_off_member_idx on public.time_off (organization_id, member_id, start_date);

create trigger set_updated_at
  before update on public.time_off
  for each row execute function extensions.moddatetime(updated_at);

alter table public.time_off enable row level security;

-- Office staff see everyone's time off; anyone sees their own. One policy,
-- because the audit forbids two permissive policies for one action.
create policy "Office staff see all time off, members their own"
  on public.time_off for select to authenticated
  using (
    organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}')))
    or member_id = (select private.my_member_id(organization_id))
  );

-- Every write goes through the functions below.
revoke all on public.time_off from anon, authenticated;
grant select on public.time_off to authenticated;

------------------------------------------------------------------------------
-- Functions
------------------------------------------------------------------------------

-- Raises 55000 when the member already has pending or approved time off that
-- overlaps the range.
create function private.assert_no_time_off_overlap(
  p_org uuid, p_member uuid, p_start date, p_end date, p_except uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_member::text, 3));
  if exists (
    select 1 from public.time_off t
    where t.organization_id = p_org and t.member_id = p_member
      and t.status in ('pending', 'approved')
      and t.start_date <= p_end and t.end_date >= p_start
      and t.id is distinct from p_except
  ) then
    raise exception 'this overlaps time off that is already requested or approved'
      using errcode = '55000';
  end if;
end;
$$;

revoke execute on function private.assert_no_time_off_overlap(uuid, uuid, date, date, uuid)
  from public, anon, authenticated;

-- Any active member asks for time off for themselves. Starts pending.
create function public.request_time_off(
  p_org uuid,
  p_kind public.time_off_kind,
  p_start date,
  p_end date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.my_member_id(p_org);
  new_id uuid;
begin
  if me is null then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  if p_end < p_start then
    raise exception 'the end date is before the start date' using errcode = '22023';
  end if;
  if p_end < (now() at time zone (select timezone from public.organizations where id = p_org))::date then
    raise exception 'time off can''t be requested for past dates' using errcode = '22023';
  end if;
  perform private.assert_no_time_off_overlap(p_org, me, p_start, p_end);

  insert into public.time_off
    (organization_id, member_id, kind, start_date, end_date, note, requested_by_member_id)
  values (p_org, me, p_kind, p_start, p_end, nullif(trim(p_note), ''), me)
  returning id into new_id;
  return new_id;
end;
$$;

-- Owners and admins record time off for anyone, already approved.
create function public.record_time_off(
  p_member_id uuid,
  p_kind public.time_off_kind,
  p_start date,
  p_end date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  me uuid;
  new_id uuid;
begin
  select organization_id into org from public.organization_members where id = p_member_id;
  if org is null or not private.has_org_role(org, '{owner,admin}') then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if p_end < p_start then
    raise exception 'the end date is before the start date' using errcode = '22023';
  end if;
  me := private.my_member_id(org);
  perform private.assert_no_time_off_overlap(org, p_member_id, p_start, p_end);

  insert into public.time_off
    (organization_id, member_id, kind, start_date, end_date, note, status,
     requested_by_member_id, reviewed_by_member_id, reviewed_at)
  values (org, p_member_id, p_kind, p_start, p_end, nullif(trim(p_note), ''), 'approved',
          me, me, now())
  returning id into new_id;
  return new_id;
end;
$$;

-- Owners and admins approve or decline a pending request. Nobody reviews
-- their own request.
create function public.review_time_off(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.time_off;
  me uuid;
begin
  select * into t from public.time_off where id = p_id for update;
  if not found or not private.has_org_role(t.organization_id, '{owner,admin}') then
    raise exception 'time off not found' using errcode = 'P0002';
  end if;
  me := private.my_member_id(t.organization_id);
  if t.member_id = me then
    raise exception 'someone else has to review your own request' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'this request was already reviewed' using errcode = '55000';
  end if;

  update public.time_off
  set status = case when p_approve then 'approved' else 'declined' end::public.time_off_status,
      reviewed_by_member_id = me,
      reviewed_at = now(),
      review_note = nullif(trim(p_note), '')
  where id = p_id;
end;
$$;

-- Withdraws time off: the member can cancel their own pending request;
-- owners and admins can cancel anyone's pending or approved time off.
create function public.cancel_time_off(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.time_off;
  manager boolean;
begin
  select * into t from public.time_off where id = p_id for update;
  if not found then
    raise exception 'time off not found' using errcode = 'P0002';
  end if;
  manager := private.has_org_role(t.organization_id, '{owner,admin}');
  if not manager and t.member_id is distinct from private.my_member_id(t.organization_id) then
    raise exception 'time off not found' using errcode = 'P0002';
  end if;
  if not (t.status = 'pending' or (manager and t.status = 'approved')) then
    raise exception 'this time off can''t be cancelled' using errcode = '55000';
  end if;

  update public.time_off set status = 'cancelled' where id = p_id;
end;
$$;

revoke execute on function
  public.request_time_off(uuid, public.time_off_kind, date, date, text),
  public.record_time_off(uuid, public.time_off_kind, date, date, text),
  public.review_time_off(uuid, boolean, text),
  public.cancel_time_off(uuid)
from public, anon;
grant execute on function
  public.request_time_off(uuid, public.time_off_kind, date, date, text),
  public.record_time_off(uuid, public.time_off_kind, date, date, text),
  public.review_time_off(uuid, boolean, text),
  public.cancel_time_off(uuid)
to authenticated;
