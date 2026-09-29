-- Routing: optimizer runs, per-crew daily routes, the day's roster, and
-- ordered stops. Also adds worker access: a worker sees exactly the
-- visits (and their jobs, properties, clients) on published routes they're
-- rostered on.
-- See docs/database/tables/crews-routing.md and ADR 0006.

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

create index optimization_runs_org_date_idx on public.optimization_runs (organization_id, route_date desc);
create index optimization_runs_requested_by_idx on public.optimization_runs (requested_by);

create trigger set_updated_at
  before update on public.optimization_runs
  for each row execute function extensions.moddatetime(updated_at);

-- Raw solver request and response. It's a separate table (not revoked
-- columns) so that `select *` on optimization_runs keeps working for
-- staff. Service role only.
create table public.optimization_run_payloads (
  organization_id uuid not null,
  run_id uuid not null,
  request jsonb,
  response jsonb,
  primary key (organization_id, run_id),
  foreign key (organization_id, run_id)
    references public.optimization_runs (organization_id, id) on delete cascade
);

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
  select * into c from public.crews where id = new.crew_id;
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
  created_at timestamptz not null default now(),
  primary key (organization_id, route_id, member_id),
  foreign key (organization_id, route_id)
    references public.routes (organization_id, id) on delete cascade,
  foreign key (organization_id, member_id)
    references public.organization_members (organization_id, id) on delete cascade
);

create index route_members_member_idx on public.route_members (organization_id, member_id, route_id);

-- A member can be on at most one route per day.
create function private.guard_route_member_double_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.route_members rm
    join public.routes r on r.id = rm.route_id
    join public.routes this on this.id = new.route_id
    where rm.member_id = new.member_id
      and rm.route_id <> new.route_id
      and r.route_date = this.route_date
  ) then
    raise exception 'this member is already on another route that day' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger guard_double_booking
  before insert or update on public.route_members
  for each row execute function private.guard_route_member_double_booking();

-- after insert on routes: seeds the roster from the crew's default members.
-- Members already booked elsewhere that day are skipped.
create function private.route_seed_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.route_members (organization_id, route_id, member_id)
  select cm.organization_id, new.id, cm.member_id
  from public.crew_members cm
  join public.organization_members m on m.id = cm.member_id and m.status = 'active'
  where cm.crew_id = new.crew_id
    and not exists (
      select 1 from public.route_members rm
      join public.routes r on r.id = rm.route_id
      where rm.member_id = cm.member_id and r.route_date = new.route_date
    );
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

-- A stop's visit must be scheduled on the route's date.
create function private.guard_route_stop_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select scheduled_date from public.visits where id = new.visit_id)
     is distinct from (select route_date from public.routes where id = new.route_id) then
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
  where rs.visit_id = new.id and r.id = rs.route_id and r.route_date is distinct from new.scheduled_date;
  return null;
end;
$$;

create trigger unroute_on_reschedule
  after update of scheduled_date on public.visits
  for each row when (new.scheduled_date is distinct from old.scheduled_date)
  execute function private.visit_rescheduled_unroute();

------------------------------------------------------------------------------
-- Worker scope helpers. Each is uncorrelated, so policies evaluate it once
-- per statement.
------------------------------------------------------------------------------

-- Routes the caller is rostered on that office staff have published (or
-- that are underway or done).
create function private.worker_route_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rm.route_id
  from public.route_members rm
  join public.organization_members m on m.id = rm.member_id
  join public.routes r on r.id = rm.route_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and r.status in ('published', 'in_progress', 'completed')
$$;

create function private.worker_visit_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rs.visit_id from public.route_stops rs
  where rs.route_id in (select private.worker_route_ids())
$$;

create function private.worker_job_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct v.job_id from public.visits v
  where v.id in (select private.worker_visit_ids())
$$;

create function private.worker_property_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct v.property_id from public.visits v
  where v.id in (select private.worker_visit_ids())
$$;

create function private.worker_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct j.client_id from public.jobs j
  where j.id in (select private.worker_job_ids())
$$;

-- Orgs where the caller is a worker and prices are visible to workers.
create function private.worker_price_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role = 'worker'
    and coalesce((o.settings ->> 'workers_see_prices')::boolean, false)
$$;

grant execute on function
  private.worker_route_ids(),
  private.worker_visit_ids(),
  private.worker_job_ids(),
  private.worker_property_ids(),
  private.worker_client_ids(),
  private.worker_price_org_ids()
to authenticated;

------------------------------------------------------------------------------
-- Workers may update only a visit's progress fields
------------------------------------------------------------------------------

create function private.guard_worker_visit_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed constant text[] := '{status,actual_start,actual_end,completion_notes,completed_by_member_id,is_exception,updated_at}';
begin
  if (select auth.uid()) is null
     or private.has_org_role(new.organization_id, '{owner,admin,dispatcher}') then
    return new;
  end if;

  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'workers can only update a visit''s status, times, and completion notes'
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and new.status not in ('in_progress', 'completed', 'no_show') then
    raise exception 'workers can only start, complete, or mark a visit as no-show'
      using errcode = '42501';
  end if;
  if new.completed_by_member_id is distinct from old.completed_by_member_id
     and new.completed_by_member_id is distinct from private.my_member_id(new.organization_id) then
    raise exception 'workers can only record themselves as completing a visit'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_worker_update
  before update on public.visits
  for each row execute function private.guard_worker_visit_update();

------------------------------------------------------------------------------
-- reset_job_schedule: now also keeps visits that are already on a route
------------------------------------------------------------------------------

create or replace function public.reset_job_schedule(p_job_id uuid, p_from date default null)
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
  where v.job_id = j.id
    and v.occurrence_date is not null
    and not v.is_exception
    and v.status = 'scheduled'
    and v.scheduled_date >= from_date
    and not exists (select 1 from public.route_stops rs where rs.visit_id = v.id);
  get diagnostics n = row_count;

  update public.jobs
  set generated_through = least(generated_through, from_date - 1)
  where id = j.id;

  return n;
end;
$$;

------------------------------------------------------------------------------
-- RLS: routing tables
------------------------------------------------------------------------------

alter table public.optimization_runs enable row level security;
alter table public.optimization_run_payloads enable row level security;
alter table public.routes enable row level security;
alter table public.route_members enable row level security;
alter table public.route_stops enable row level security;
-- optimization_run_payloads: no policies (service role only).

create policy "Office staff can view optimization runs"
  on public.optimization_runs for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can start optimization runs"
  on public.optimization_runs for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update optimization runs"
  on public.optimization_runs for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

create policy "Office staff and rostered workers can view routes"
  on public.routes for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or id in (select private.worker_route_ids())
  );
create policy "Office staff can add routes"
  on public.routes for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update routes"
  on public.routes for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can delete routes"
  on public.routes for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

create policy "Office staff and rostered workers can view route members"
  on public.route_members for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or route_id in (select private.worker_route_ids())
  );
create policy "Office staff can add route members"
  on public.route_members for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can remove route members"
  on public.route_members for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

create policy "Office staff and rostered workers can view route stops"
  on public.route_stops for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or route_id in (select private.worker_route_ids())
  );
create policy "Office staff can add route stops"
  on public.route_stops for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update route stops"
  on public.route_stops for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can delete route stops"
  on public.route_stops for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

------------------------------------------------------------------------------
-- RLS: worker access to earlier tables (select policies replaced, not
-- added, so each table keeps a single permissive policy per action)
------------------------------------------------------------------------------

drop policy "Office staff can view visits" on public.visits;
create policy "Office staff and rostered workers can view visits"
  on public.visits for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or id in (select private.worker_visit_ids())
  );

drop policy "Office staff can update visits" on public.visits;
create policy "Office staff and rostered workers can update visits"
  on public.visits for update to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or id in (select private.worker_visit_ids())
  )
  with check (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or id in (select private.worker_visit_ids())
  );

drop policy "Office staff can view jobs" on public.jobs;
create policy "Office staff and rostered workers can view jobs"
  on public.jobs for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or id in (select private.worker_job_ids())
  );

drop policy "Office staff can view job lines" on public.job_line_items;
create policy "Office staff, and workers where prices are visible, can view job lines"
  on public.job_line_items for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or (
      organization_id in (select private.worker_price_org_ids())
      and job_id in (select private.worker_job_ids())
    )
  );

drop policy "Office staff can view properties" on public.properties;
create policy "Office staff and rostered workers can view properties"
  on public.properties for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or id in (select private.worker_property_ids())
  );

drop policy "Office staff can view clients" on public.clients;
create policy "Office staff and rostered workers can view clients"
  on public.clients for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or id in (select private.worker_client_ids())
  );

drop policy "Office staff can view client contacts" on public.client_contacts;
create policy "Office staff and rostered workers can view client contacts"
  on public.client_contacts for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or client_id in (select private.worker_client_ids())
  );

drop policy "Office staff can view attachments" on public.attachments;
create policy "Office staff and rostered workers can view attachments"
  on public.attachments for select to authenticated
  using (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or visit_id in (select private.worker_visit_ids())
    or job_id in (select private.worker_job_ids())
    or property_id in (select private.worker_property_ids())
  );

drop policy "Office staff can add attachments" on public.attachments;
create policy "Office staff, and workers on their visits, can add attachments"
  on public.attachments for insert to authenticated
  with check (
    organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
    or visit_id in (select private.worker_visit_ids())
  );
