-- Route Builder writes. Each function is one transaction, runs as the caller
-- (security invoker, so the office-staff RLS on routes and route_stops
-- decides access), and locks the route row first so edits to one route
-- serialize. See docs/database/tables/crews-routing.md and ADR 0009.
--
-- Rules shared by the functions:
--   * a route that is not found (or is another org's) raises P0002;
--   * only draft and optimized routes can change; a published, in-progress
--     or completed route raises 55000;
--   * stop sequence is deferrable initially deferred, so renumbering needs no
--     temporary values, and the guard triggers still run on every stop write.

------------------------------------------------------------------------------
-- create_route
------------------------------------------------------------------------------

-- A draft route for a crew on a date. The triggers copy depots and the start
-- time from the crew and seed the day's roster.
create function public.create_route(p_organization_id uuid, p_route_date date, p_crew_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_archived timestamptz;
  v_id uuid;
begin
  select archived_at into v_archived from public.crews
  where organization_id = p_organization_id and id = p_crew_id;
  if not found or v_archived is not null then
    raise exception 'crew not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.routes
    where organization_id = p_organization_id and crew_id = p_crew_id and route_date = p_route_date
  ) then
    raise exception 'that crew already has a route on this date' using errcode = '23505';
  end if;

  insert into public.routes (organization_id, crew_id, route_date)
  values (p_organization_id, p_crew_id, p_route_date)
  returning id into v_id;
  return v_id;
end;
$$;

------------------------------------------------------------------------------
-- change_route_crew
------------------------------------------------------------------------------

-- routes.crew_id is fixed ("build a new route instead"), so a crew change
-- builds a route for the new crew, re-points the stops, and deletes the old
-- route. The old roster goes first so the seed trigger can place anyone who
-- was on it. Returns the new route's id (the same id when the crew is
-- unchanged). Planned times and travel are cleared: they belonged to the
-- old crew's day.
create function public.change_route_crew(p_organization_id uuid, p_route_id uuid, p_crew_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.routes;
  v_archived timestamptz;
  v_new uuid;
begin
  select * into r from public.routes
  where organization_id = p_organization_id and id = p_route_id
  for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if r.status not in ('draft', 'optimized') then
    raise exception 'only a draft or optimized route can be changed' using errcode = '55000';
  end if;
  if r.crew_id = p_crew_id then
    return r.id;
  end if;

  select archived_at into v_archived from public.crews
  where organization_id = p_organization_id and id = p_crew_id;
  if not found or v_archived is not null then
    raise exception 'crew not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.routes
    where organization_id = p_organization_id and crew_id = p_crew_id and route_date = r.route_date
  ) then
    raise exception 'that crew already has a route on this date' using errcode = '23505';
  end if;

  delete from public.route_members
  where organization_id = p_organization_id and route_id = r.id;

  insert into public.routes (organization_id, crew_id, route_date, status)
  values (p_organization_id, p_crew_id, r.route_date, r.status)
  returning id into v_new;

  update public.route_stops
  set route_id = v_new,
      planned_arrival = null, planned_departure = null,
      travel_distance_m = null, travel_duration_s = null
  where organization_id = p_organization_id and route_id = r.id;

  delete from public.routes where organization_id = p_organization_id and id = r.id;
  return v_new;
end;
$$;

------------------------------------------------------------------------------
-- add_route_stop
------------------------------------------------------------------------------

-- Puts a scheduled, unrouted visit on a route at p_position (1-based,
-- clamped; null = last) and shifts later stops down. The date guard trigger
-- rejects a visit whose scheduled_date differs from the route's date (23514).
-- Returns the stop id.
create function public.add_route_stop(
  p_organization_id uuid, p_route_id uuid, p_visit_id uuid, p_position integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.route_status;
  v_visit_status public.visit_status;
  v_count integer;
  v_pos integer;
  v_id uuid;
begin
  select status into v_status from public.routes
  where organization_id = p_organization_id and id = p_route_id
  for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'optimized') then
    raise exception 'only a draft or optimized route can be changed' using errcode = '55000';
  end if;

  select status into v_visit_status from public.visits
  where organization_id = p_organization_id and id = p_visit_id
  for no key update;
  if not found then
    raise exception 'visit not found' using errcode = 'P0002';
  end if;
  if v_visit_status <> 'scheduled' then
    raise exception 'only a scheduled visit can be routed' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.route_stops
    where organization_id = p_organization_id and visit_id = p_visit_id
  ) then
    raise exception 'that visit is already on a route' using errcode = '23505';
  end if;

  select count(*) into v_count from public.route_stops
  where organization_id = p_organization_id and route_id = p_route_id;
  v_pos := least(greatest(coalesce(p_position, v_count + 1), 1), v_count + 1);

  update public.route_stops
  set sequence = sequence + 1
  where organization_id = p_organization_id and route_id = p_route_id and sequence >= v_pos;

  insert into public.route_stops (organization_id, route_id, visit_id, sequence)
  values (p_organization_id, p_route_id, p_visit_id, v_pos)
  returning id into v_id;
  return v_id;
end;
$$;

------------------------------------------------------------------------------
-- move_route_stop
------------------------------------------------------------------------------

-- Moves a stop to p_position (1-based, clamped) on p_to_route_id, which may
-- be its own route (a reorder). Both routes are locked in id order, so two
-- opposite moves can't deadlock on the routes. Both must be editable and on
-- the same date. The gap closes on the source and the slot opens on the
-- target; the moved stop's planned times and travel are cleared.
create function public.move_route_stop(
  p_organization_id uuid, p_stop_id uuid, p_to_route_id uuid, p_position integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from uuid;
  v_old integer;
  v_from_status public.route_status;
  v_to_status public.route_status;
  v_from_date date;
  v_to_date date;
  v_count integer;
  v_pos integer;
begin
  select route_id into v_from from public.route_stops
  where organization_id = p_organization_id and id = p_stop_id;
  if not found then
    raise exception 'stop not found' using errcode = 'P0002';
  end if;

  perform 1 from public.routes
  where organization_id = p_organization_id and id in (v_from, p_to_route_id)
  order by id
  for update;

  select status, route_date into v_from_status, v_from_date from public.routes
  where organization_id = p_organization_id and id = v_from;
  select status, route_date into v_to_status, v_to_date from public.routes
  where organization_id = p_organization_id and id = p_to_route_id;
  if v_from_status is null or v_to_status is null then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if v_from_status not in ('draft', 'optimized') or v_to_status not in ('draft', 'optimized') then
    raise exception 'only a draft or optimized route can be changed' using errcode = '55000';
  end if;
  if v_from_date <> v_to_date then
    raise exception 'a visit can only be routed on its scheduled date' using errcode = '23514';
  end if;

  -- Re-read under the routes' locks: another move may have won.
  select sequence into v_old from public.route_stops
  where organization_id = p_organization_id and id = p_stop_id and route_id = v_from
  for update;
  if not found then
    raise exception 'that stop changed; reload and try again' using errcode = '55000';
  end if;

  select count(*) into v_count from public.route_stops
  where organization_id = p_organization_id and route_id = p_to_route_id;

  if v_from = p_to_route_id then
    v_pos := least(greatest(coalesce(p_position, v_count), 1), v_count);
    if v_pos > v_old then
      update public.route_stops set sequence = sequence - 1
      where organization_id = p_organization_id and route_id = v_from
        and sequence > v_old and sequence <= v_pos;
    elsif v_pos < v_old then
      update public.route_stops set sequence = sequence + 1
      where organization_id = p_organization_id and route_id = v_from
        and sequence >= v_pos and sequence < v_old;
    end if;
    update public.route_stops
    set sequence = v_pos,
        planned_arrival = case when v_pos <> v_old then null else planned_arrival end,
        planned_departure = case when v_pos <> v_old then null else planned_departure end,
        travel_distance_m = case when v_pos <> v_old then null else travel_distance_m end,
        travel_duration_s = case when v_pos <> v_old then null else travel_duration_s end
    where organization_id = p_organization_id and id = p_stop_id;
  else
    v_pos := least(greatest(coalesce(p_position, v_count + 1), 1), v_count + 1);
    update public.route_stops set sequence = sequence - 1
    where organization_id = p_organization_id and route_id = v_from and sequence > v_old;
    update public.route_stops set sequence = sequence + 1
    where organization_id = p_organization_id and route_id = p_to_route_id and sequence >= v_pos;
    update public.route_stops
    set route_id = p_to_route_id, sequence = v_pos,
        planned_arrival = null, planned_departure = null,
        travel_distance_m = null, travel_duration_s = null
    where organization_id = p_organization_id and id = p_stop_id;
  end if;
end;
$$;

------------------------------------------------------------------------------
-- reorder_route_stops
------------------------------------------------------------------------------

-- Applies a full order: p_stop_ids must be exactly the route's stops, each
-- once (22023 otherwise). Stops whose position changed lose their planned
-- times and travel.
create function public.reorder_route_stops(p_organization_id uuid, p_route_id uuid, p_stop_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.route_status;
  v_count integer;
begin
  select status into v_status from public.routes
  where organization_id = p_organization_id and id = p_route_id
  for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'optimized') then
    raise exception 'only a draft or optimized route can be changed' using errcode = '55000';
  end if;

  select count(*) into v_count from public.route_stops
  where organization_id = p_organization_id and route_id = p_route_id;

  if coalesce(cardinality(p_stop_ids), 0) <> v_count
     or (select count(distinct x) from unnest(p_stop_ids) x) <> v_count
     or exists (
       select 1 from unnest(p_stop_ids) x
       where x not in (
         select id from public.route_stops
         where organization_id = p_organization_id and route_id = p_route_id
       )
     ) then
    raise exception 'the stop list must name every stop on the route exactly once' using errcode = '22023';
  end if;

  update public.route_stops s
  set sequence = o.ord::integer,
      planned_arrival = null, planned_departure = null,
      travel_distance_m = null, travel_duration_s = null
  from unnest(p_stop_ids) with ordinality as o(id, ord)
  where s.organization_id = p_organization_id and s.route_id = p_route_id
    and s.id = o.id and s.sequence is distinct from o.ord::integer;
end;
$$;

------------------------------------------------------------------------------
-- remove_route_stop
------------------------------------------------------------------------------

-- Takes a stop off its route (the visit becomes unrouted) and closes the gap.
create function public.remove_route_stop(p_organization_id uuid, p_stop_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_route uuid;
  v_status public.route_status;
  v_seq integer;
begin
  select route_id into v_route from public.route_stops
  where organization_id = p_organization_id and id = p_stop_id;
  if not found then
    raise exception 'stop not found' using errcode = 'P0002';
  end if;

  select status into v_status from public.routes
  where organization_id = p_organization_id and id = v_route
  for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if v_status not in ('draft', 'optimized') then
    raise exception 'only a draft or optimized route can be changed' using errcode = '55000';
  end if;

  delete from public.route_stops
  where organization_id = p_organization_id and id = p_stop_id and route_id = v_route
  returning sequence into v_seq;
  if not found then
    raise exception 'that stop changed; reload and try again' using errcode = '55000';
  end if;

  update public.route_stops set sequence = sequence - 1
  where organization_id = p_organization_id and route_id = v_route and sequence > v_seq;
end;
$$;

------------------------------------------------------------------------------
-- delete_route
------------------------------------------------------------------------------

-- Deletes a draft route that has no stops (its roster goes with it).
create function public.delete_route(p_organization_id uuid, p_route_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.route_status;
begin
  select status into v_status from public.routes
  where organization_id = p_organization_id and id = p_route_id
  for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'only a draft route can be deleted' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.route_stops
    where organization_id = p_organization_id and route_id = p_route_id
  ) then
    raise exception 'remove the route''s stops before deleting it' using errcode = '55000';
  end if;

  delete from public.routes where organization_id = p_organization_id and id = p_route_id;
end;
$$;

------------------------------------------------------------------------------
-- Grants: signed-in users only (RLS limits them to office staff).
------------------------------------------------------------------------------

revoke execute on function public.create_route(uuid, date, uuid) from public, anon, service_role;
revoke execute on function public.change_route_crew(uuid, uuid, uuid) from public, anon, service_role;
revoke execute on function public.add_route_stop(uuid, uuid, uuid, integer) from public, anon, service_role;
revoke execute on function public.move_route_stop(uuid, uuid, uuid, integer) from public, anon, service_role;
revoke execute on function public.reorder_route_stops(uuid, uuid, uuid[]) from public, anon, service_role;
revoke execute on function public.remove_route_stop(uuid, uuid) from public, anon, service_role;
revoke execute on function public.delete_route(uuid, uuid) from public, anon, service_role;

grant execute on function public.create_route(uuid, date, uuid) to authenticated;
grant execute on function public.change_route_crew(uuid, uuid, uuid) to authenticated;
grant execute on function public.add_route_stop(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.move_route_stop(uuid, uuid, uuid, integer) to authenticated;
grant execute on function public.reorder_route_stops(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.remove_route_stop(uuid, uuid) to authenticated;
grant execute on function public.delete_route(uuid, uuid) to authenticated;
