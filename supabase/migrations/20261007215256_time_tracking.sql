-- Time tracking: shifts (payroll hours) and visit time entries (job
-- costing), plus a labor-cost report view.
-- See docs/database/tables/time.md.
--
-- RLS: office staff manage all time. Workers clock in and out, and time
-- their visits, through worker_* RPCs that stamp the server clock (ADR 0011).

create type public.time_source as enum ('app', 'manual', 'auto');

------------------------------------------------------------------------------
-- shifts
------------------------------------------------------------------------------

create table public.shifts (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null,
  route_id uuid,
  clock_in timestamptz not null,
  clock_out timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  source public.time_source not null default 'manual',
  notes text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete restrict,
  foreign key (organization_id, route_id)
    references public.routes (organization_id, id) on delete set null (route_id),
  check (clock_out is null or clock_out > clock_in),
  check (clock_out is null or break_minutes * interval '1 minute' < clock_out - clock_in),
  check (approved_at is null or clock_out is not null),
  -- No overlapping shifts per member. An open shift extends to infinity, so
  -- a member has at most one open shift.
  constraint shifts_no_overlap exclude using gist (
    member_id with =,
    tstzrange(clock_in, clock_out, '[)') with &&
  )
);

create index shifts_org_clock_in_idx on public.shifts (organization_id, clock_in desc);
create index shifts_member_idx on public.shifts (organization_id, member_id, clock_in desc);
create index shifts_route_idx on public.shifts (organization_id, route_id);
create index shifts_approved_by_idx on public.shifts (approved_by);

create trigger set_updated_at
  before update on public.shifts
  for each row execute function extensions.moddatetime(updated_at);

-- before update of approved_at: records who approved (or clears it).
create function private.shift_approval_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.approved_by := case when new.approved_at is null then null else (select auth.uid()) end;
  return new;
end;
$$;

create trigger approval_changed
  before update of approved_at on public.shifts
  for each row when (new.approved_at is distinct from old.approved_at)
  execute function private.shift_approval_changed();

grant insert (organization_id, member_id, route_id, clock_in, clock_out, break_minutes, notes)
  on public.shifts to authenticated;
grant update (route_id, clock_in, clock_out, break_minutes, notes, approved_at)
  on public.shifts to authenticated;

------------------------------------------------------------------------------
-- visit_time_entries
------------------------------------------------------------------------------

create table public.visit_time_entries (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  visit_id uuid not null,
  member_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source public.time_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, visit_id)
    references public.visits (organization_id, id) on delete cascade,
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete restrict,
  check (ended_at is null or ended_at > started_at),
  -- A worker can't be on two visits at once.
  constraint visit_time_entries_no_overlap exclude using gist (
    member_id with =,
    tstzrange(started_at, ended_at, '[)') with &&
  )
);

create index visit_time_entries_visit_idx on public.visit_time_entries (organization_id, visit_id);
create index visit_time_entries_member_idx on public.visit_time_entries (organization_id, member_id, started_at desc);

create trigger set_updated_at
  before update on public.visit_time_entries
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, visit_id, member_id, started_at, ended_at)
  on public.visit_time_entries to authenticated;
grant update (started_at, ended_at) on public.visit_time_entries to authenticated;

------------------------------------------------------------------------------
-- Row level security (office staff)
------------------------------------------------------------------------------

alter table public.shifts enable row level security;
alter table public.visit_time_entries enable row level security;

create policy "Office staff can view shifts"
  on public.shifts for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add shifts"
  on public.shifts for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update shifts"
  on public.shifts for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete shifts"
  on public.shifts for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view visit time"
  on public.visit_time_entries for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add visit time"
  on public.visit_time_entries for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update visit time"
  on public.visit_time_entries for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete visit time"
  on public.visit_time_entries for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

------------------------------------------------------------------------------
-- labor_cost_report
------------------------------------------------------------------------------

-- One row per closed shift: net hours and cost at the pay rate in effect on
-- the shift's org-local date. security_invoker, so shift visibility follows
-- shift RLS (office staff), and hourly_rate_cents / labor_cost_cents are
-- null for anyone who can't read member_pay_rates (dispatchers).
create view public.labor_cost_report
with (security_invoker = true)
as
select
  s.id as shift_id,
  s.organization_id,
  s.member_id,
  m.display_name,
  (s.clock_in at time zone o.timezone)::date as work_date,
  s.clock_in,
  s.clock_out,
  s.break_minutes,
  round(((extract(epoch from (s.clock_out - s.clock_in)) / 60 - s.break_minutes) / 60)::numeric, 2) as hours,
  r.hourly_rate_cents,
  round(((extract(epoch from (s.clock_out - s.clock_in)) / 60 - s.break_minutes) / 60)::numeric * r.hourly_rate_cents)::bigint
    as labor_cost_cents,
  s.approved_at
from public.shifts s
join public.organization_members m on m.organization_id = s.organization_id and m.id = s.member_id
join public.organizations o on o.id = s.organization_id
left join lateral (
  select pr.hourly_rate_cents
  from public.member_pay_rates pr
  where pr.organization_id = s.organization_id
    and pr.member_id = s.member_id
    and pr.effective_from <= (s.clock_in at time zone o.timezone)::date
  order by pr.effective_from desc
  limit 1
) r on true
where s.clock_out is not null;

revoke all on public.labor_cost_report from anon;
grant select on public.labor_cost_report to authenticated;
