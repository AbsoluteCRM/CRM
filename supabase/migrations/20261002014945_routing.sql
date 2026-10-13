-- Routing: optimizer runs, per-crew daily routes, the day's roster, and
-- ordered stops. See docs/database/tables/crews-routing.md and ADR 0006.
--
-- RLS: office staff only. Workers see their published routes through
-- worker_* RPCs (ADR 0010).

create type public.route_status as enum ('draft', 'optimized', 'published', 'in_progress', 'completed');
create type public.optimization_status as enum ('queued', 'running', 'succeeded', 'failed');

------------------------------------------------------------------------------
-- optimization_runs (+ payloads, service role only)
------------------------------------------------------------------------------

create table public.optimization_runs (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  route_date date not null,
  status public.optimization_status not null default 'queued',
  provider text not null,
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  crew_ids uuid[] not null default '{}',
  unassigned_visit_ids uuid[] not null default '{}',
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

comment on column public.optimization_runs.crew_ids is
  'Snapshot of the crews sent to the solver (a log, not a relationship).';

create index optimization_runs_org_date_idx on public.optimization_runs (organization_id, route_date desc);
create index optimization_runs_requested_by_idx on public.optimization_runs (requested_by);

create trigger set_updated_at
  before update on public.optimization_runs
  for each row execute function extensions.moddatetime(updated_at);

-- Office staff request runs. The optimizer (service role) writes progress,
-- results, and errors.
grant insert (organization_id, route_date, provider, crew_ids) on public.optimization_runs to authenticated;

-- Raw solver request and response. A separate table (not revoked columns)
-- so `select *` on optimization_runs keeps working for staff. Service role
-- only.
create table public.optimization_run_payloads (
  organization_id uuid not null,
  run_id uuid not null,
  request jsonb,
  response jsonb,
  primary key (organization_id, run_id),
  foreign key (organization_id, run_id)
    references public.optimization_runs (organization_id, id) on delete cascade
);

revoke all on public.optimization_run_payloads from authenticated;

------------------------------------------------------------------------------
-- routes
------------------------------------------------------------------------------

create table public.routes (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  crew_id uuid not null,
  route_date date not null,
  status public.route_status not null default 'draft',
  start_location extensions.geography(point, 4326),
  end_location extensions.geography(point, 4326),
  planned_start timestamptz,
  planned_end timestamptz,
  total_distance_m integer check (total_distance_m >= 0),
  total_duration_s integer check (total_duration_s >= 0),
  polyline text,
  optimization_run_id uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, crew_id, route_date),
  -- FK target that carries the date to route_members.
  unique (organization_id, id, route_date),
  foreign key (organization_id, crew_id)
    references public.crews (organization_id, id) on delete restrict,
  foreign key (organization_id, optimization_run_id)
    references public.optimization_runs (organization_id, id) on delete set null (optimization_run_id),
  check (planned_end is null or planned_end >= planned_start)
);

create index routes_org_date_idx on public.routes (organization_id, route_date);
create index routes_optimization_run_idx on public.routes (organization_id, optimization_run_id);

create trigger set_updated_at
  before update on public.routes
  for each row execute function extensions.moddatetime(updated_at);

-- crew_id and route_date are fixed: build a new route instead of moving one.
grant insert (organization_id, crew_id, route_date, status, start_location, end_location,
              planned_start, planned_end, optimization_run_id)
  on public.routes to authenticated;
grant update (status, start_location, end_location, planned_start, planned_end, total_distance_m,
              total_duration_s, polyline, optimization_run_id)
  on public.routes to authenticated;

-- before insert: copies depots and start time from the crew (start time in
-- org-local time).
create function private.route_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.crews;
  tz text;
begin
  select * into c from public.crews where organization_id = new.organization_id and id = new.crew_id;
  select timezone into tz from public.organizations where id = new.organization_id;
  new.start_location := coalesce(new.start_location, c.default_start_location);
  new.end_location := coalesce(new.end_location, c.default_end_location, c.default_start_location);
  new.planned_start := coalesce(new.planned_start, (new.route_date + c.default_start_time) at time zone tz);
  return new;
end;
$$;

create trigger set_defaults
  before insert on public.routes
  for each row execute function private.route_defaults();

-- before update of status: stamps published_at.
create function private.route_status_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger status_changed
  before update of status on public.routes
  for each row execute function private.route_status_changed();

------------------------------------------------------------------------------
-- route_members (that day's actual roster)
------------------------------------------------------------------------------

create table public.route_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  route_id uuid not null,
  member_id uuid not null,
  route_date date not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, route_id, member_id),
  -- A member is on at most one route per day. A real constraint, so two
  -- concurrent bookings can't both pass.
  unique (organization_id, member_id, route_date),
  foreign key (organization_id, route_id, route_date)
    references public.routes (organization_id, id, route_date) on delete cascade,
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete cascade
);

-- before insert: route_date is copied from the route (the FK proves it).
create function private.route_member_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select route_date into new.route_date from public.routes
  where organization_id = new.organization_id and id = new.route_id;
  return new;
end;
$$;

create trigger set_defaults
  before insert on public.route_members
  for each row execute function private.route_member_defaults();

grant insert (organization_id, route_id, member_id) on public.route_members to authenticated;

-- after insert on routes: seeds the roster from the crew's active members.
-- Members already booked elsewhere that day are skipped.
create function private.route_seed_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.route_members (organization_id, route_id, member_id, route_date)
  select cm.organization_id, new.id, cm.member_id, new.route_date
  from public.crew_members cm
  join public.organization_members m on m.organization_id = cm.organization_id and m.id = cm.member_id
  where cm.organization_id = new.organization_id and cm.crew_id = new.crew_id
    and m.status = 'active'
  on conflict (organization_id, member_id, route_date) do nothing;
  return null;
end;
$$;

create trigger seed_members
  after insert on public.routes
  for each row execute function private.route_seed_members();

------------------------------------------------------------------------------
-- route_stops (a stop IS the visit's crew assignment)
------------------------------------------------------------------------------

create table public.route_stops (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  route_id uuid not null,
  visit_id uuid not null,
  sequence integer not null check (sequence > 0),
  planned_arrival timestamptz,
  planned_departure timestamptz,
  travel_distance_m integer check (travel_distance_m >= 0),
  travel_duration_s integer check (travel_duration_s >= 0),
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, visit_id),
  constraint route_stops_sequence_key
    unique (organization_id, route_id, sequence) deferrable initially deferred,
  foreign key (organization_id, route_id)
    references public.routes (organization_id, id) on delete cascade,
  foreign key (organization_id, visit_id)
    references public.visits (organization_id, id) on delete cascade,
  check (planned_departure is null or planned_departure >= planned_arrival)
);

create trigger set_updated_at
  before update on public.route_stops
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, route_id, visit_id, sequence, planned_arrival, planned_departure,
              travel_distance_m, travel_duration_s, is_locked)
  on public.route_stops to authenticated;
grant update (route_id, sequence, planned_arrival, planned_departure, travel_distance_m,
              travel_duration_s, is_locked)
  on public.route_stops to authenticated;

-- A stop's visit must be scheduled on the route's date.
create function private.guard_route_stop_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select scheduled_date from public.visits where organization_id = new.organization_id and id = new.visit_id)
     is distinct from
     (select route_date from public.routes where organization_id = new.organization_id and id = new.route_id) then
    raise exception 'a visit can only be routed on its scheduled date' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_date
  before insert or update of visit_id, route_id on public.route_stops
  for each row execute function private.guard_route_stop_date();

-- after update of scheduled_date on visits: a rescheduled visit leaves its
-- old route.
create function private.visit_rescheduled_unroute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.route_stops rs
  using public.routes r
  where rs.organization_id = new.organization_id and rs.visit_id = new.id
    and r.organization_id = rs.organization_id and r.id = rs.route_id
    and r.route_date is distinct from new.scheduled_date;
  return null;
end;
$$;

create trigger unroute_on_reschedule
  after update of scheduled_date on public.visits
  for each row when (new.scheduled_date is distinct from old.scheduled_date)
  execute function private.visit_rescheduled_unroute();

------------------------------------------------------------------------------
-- reset_job_schedule
------------------------------------------------------------------------------

-- Deletes future generated visits that nobody has touched (and that aren't
-- on a route), so they can be regenerated after the rule changes. Rewinds
-- the watermark. security invoker: office staff or the service role.
create function public.reset_job_schedule(p_job_id uuid, p_from date default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j public.jobs;
  from_date date;
  n integer;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  select coalesce(p_from, (now() at time zone o.timezone)::date) into from_date
  from public.organizations o where o.id = j.organization_id;

  delete from public.visits v
  where v.organization_id = j.organization_id and v.job_id = j.id
    and v.occurrence_date is not null
    and not v.is_exception
    and v.status = 'scheduled'
    and v.scheduled_date >= from_date
    and not exists (
      select 1 from public.route_stops rs
      where rs.organization_id = v.organization_id and rs.visit_id = v.id
    );
  get diagnostics n = row_count;

  update public.jobs
  set generated_through = least(generated_through, from_date - 1)
  where organization_id = j.organization_id and id = j.id;

  return n;
end;
$$;

revoke execute on function public.reset_job_schedule(uuid, date) from public, anon;
grant execute on function public.reset_job_schedule(uuid, date) to authenticated, service_role;

------------------------------------------------------------------------------
-- Row level security (office staff)
------------------------------------------------------------------------------

alter table public.optimization_runs enable row level security;
alter table public.optimization_run_payloads enable row level security;
alter table public.routes enable row level security;
alter table public.route_members enable row level security;
alter table public.route_stops enable row level security;
-- optimization_run_payloads: no policies (service role only).

create policy "Office staff can view optimization runs"
  on public.optimization_runs for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can start optimization runs"
  on public.optimization_runs for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view routes"
  on public.routes for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add routes"
  on public.routes for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update routes"
  on public.routes for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete routes"
  on public.routes for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view route members"
  on public.route_members for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add route members"
  on public.route_members for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can remove route members"
  on public.route_members for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view route stops"
  on public.route_stops for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add route stops"
  on public.route_stops for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update route stops"
  on public.route_stops for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete route stops"
  on public.route_stops for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
