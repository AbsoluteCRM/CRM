-- Route optimizer: the database half of the external solver integration.
-- See docs/database/decisions/0015-optimizer-integration.md,
-- docs/database/tables/crews-routing.md and docs/plans/route-optimizer.md.
--
--   * routes.optimized_stop_count: how many stops the last optimization
--     placed, so the app can tell when a route has changed since.
--   * One active (queued or running) optimization run per organization and
--     date, enforced by a partial unique index.
--   * optimizer_inputs(): what the solver needs, read as the caller (RLS and
--     an explicit office-role check decide access).
--   * apply_optimization_results(): writes a solver's result back in one
--     transaction. Service role only; the trusted runner verifies the caller
--     first (ADR 0009, ADR 0015).
--
-- Nothing here calls a solver. Not applied to any database by the PR that adds it.

alter table public.routes
  add column optimized_stop_count integer check (optimized_stop_count >= 0);

comment on column public.routes.optimized_stop_count is
  'Stops placed by the last optimization. Written only by apply_optimization_results; a different count later means the route was edited.';

create unique index optimization_runs_one_active_idx
  on public.optimization_runs (organization_id, route_date)
  where status in ('queued', 'running');

------------------------------------------------------------------------------
-- optimizer_inputs
------------------------------------------------------------------------------

-- Returns
--   { "routes": [ { "route_id", "crew_id", "status", "planned_start",
--                   "start": {lon, lat} | null, "end": {lon, lat} | null,
--                   "max_work_minutes": n | null,
--                   "stops": [ { "stop_id", "visit_id", "sequence", "is_locked",
--                                "duration_minutes", "window_start", "window_end",
--                                "lon": n | null, "lat": n | null } ] } ],
--     "skipped": [ { "route_id", "reason" } ] }
-- for the date's draft and optimized routes (all of them, or only
-- p_route_ids). `skipped` names requested routes that were not returned:
-- not_found (no such route on that date in this org) or not_editable
-- (published, in progress or completed). security invoker: office-staff RLS on
-- routes, crews, stops, visits and properties applies on top of the role check.
create function public.optimizer_inputs(p_organization_id uuid, p_date date, p_route_ids uuid[] default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_routes jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  if p_organization_id is null or p_date is null then
    raise exception 'organization and date are required' using errcode = '22023';
  end if;
  if not private.has_org_role(p_organization_id, '{owner,admin,dispatcher}') then
    raise exception 'not allowed to optimize routes' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'route_id', r.id,
      'crew_id', r.crew_id,
      'status', r.status,
      'planned_start', r.planned_start,
      'start', case when r.start_location is null then null else jsonb_build_object(
        'lon', extensions.st_x(r.start_location::extensions.geometry),
        'lat', extensions.st_y(r.start_location::extensions.geometry)) end,
      'end', case when r.end_location is null then null else jsonb_build_object(
        'lon', extensions.st_x(r.end_location::extensions.geometry),
        'lat', extensions.st_y(r.end_location::extensions.geometry)) end,
      'max_work_minutes', c.max_work_minutes,
      'stops', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'stop_id', rs.id,
            'visit_id', rs.visit_id,
            'sequence', rs.sequence,
            'is_locked', rs.is_locked,
            'duration_minutes', vi.duration_minutes,
            'window_start', vi.window_start,
            'window_end', vi.window_end,
            'lon', pr.longitude,
            'lat', pr.latitude
          ) order by rs.sequence), '[]'::jsonb)
        from public.route_stops rs
        join public.visits vi on vi.organization_id = rs.organization_id and vi.id = rs.visit_id
        join public.properties pr on pr.organization_id = vi.organization_id and pr.id = vi.property_id
        where rs.organization_id = r.organization_id and rs.route_id = r.id
      )
    ) order by r.created_at, r.id), '[]'::jsonb)
  into v_routes
  from public.routes r
  join public.crews c on c.organization_id = r.organization_id and c.id = r.crew_id
  where r.organization_id = p_organization_id
    and r.route_date = p_date
    and r.status in ('draft', 'optimized')
    and (p_route_ids is null or r.id = any (p_route_ids));

  if p_route_ids is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object('route_id', x.id, 'reason', case when r.id is null then 'not_found' else 'not_editable' end)
      order by x.id), '[]'::jsonb)
    into v_skipped
    from (select distinct u as id from unnest(p_route_ids) u) x
    left join public.routes r
      on r.organization_id = p_organization_id and r.id = x.id and r.route_date = p_date
    where not exists (
      select 1 from jsonb_array_elements(v_routes) e where (e ->> 'route_id')::uuid = x.id
    );
  end if;

  return jsonb_build_object('routes', v_routes, 'skipped', v_skipped);
end;
$$;

comment on function public.optimizer_inputs(uuid, date, uuid[]) is
  'What the route optimizer needs for a date: open routes, depots, stops. security invoker with an office-role check.';

revoke execute on function public.optimizer_inputs(uuid, date, uuid[]) from public, anon, service_role;
grant execute on function public.optimizer_inputs(uuid, date, uuid[]) to authenticated;

------------------------------------------------------------------------------
-- apply_optimization_results
------------------------------------------------------------------------------

-- p_routes is an array of
--   { "route_id", "planned_start", "planned_end", "total_distance_m",
--     "total_duration_s", "polyline",
--     "stops": [ { "stop_id", "sequence", "planned_arrival", "planned_departure",
--                  "travel_distance_m", "travel_duration_s" } ] }
-- Each route's stops must be exactly the route's current stops, numbered
-- 1..n, with locked stops at the sequence they already have.
--
-- Returns { "applied": [route_id], "skipped": [ { "route_id", "reason" } ] }.
-- Reasons: not_found (no such route on the run's date in this org),
-- not_editable (status is not draft or optimized), no_stops, changed (the
-- route's stops are not the ones the solver saw), locked_moved (a locked
-- stop would change position). A skipped route is left exactly as it was.
--
-- Every route is locked (in id order) before it is read or written, so it
-- serializes with the Route Builder functions, which lock the same row.
-- sequence is deferrable initially deferred, so renumbering needs no
-- temporary values. The date guard trigger fires only when a stop's visit or
-- route changes, which this function never does.
--
-- The run becomes `succeeded` (error carries a note when routes were
-- skipped), or `failed` when routes were sent and none could be applied.
--
-- security invoker, execute for service_role only: it runs as the service
-- role (RLS bypassed), so access control is the grant. The trusted runner
-- (src/server/trusted/optimization-runner.ts) checks the caller's active
-- office membership in this organization before it calls this, and the
-- function scopes every statement to p_organization_id.
create function public.apply_optimization_results(
  p_organization_id uuid,
  p_run_id uuid,
  p_routes jsonb,
  p_unassigned uuid[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.optimization_runs;
  v_item jsonb;
  v_route public.routes;
  v_applied uuid[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  v_cur uuid[];
  v_new uuid[];
  v_n integer;
  v_reason text;
  v_failed boolean;
begin
  if p_organization_id is null or p_run_id is null or jsonb_typeof(p_routes) is distinct from 'array' then
    raise exception 'organization, run and routes are required' using errcode = '22023';
  end if;

  select * into v_run
  from public.optimization_runs
  where organization_id = p_organization_id and id = p_run_id
  for update;
  if not found then
    raise exception 'optimization run not found' using errcode = 'P0002';
  end if;
  if v_run.status not in ('queued', 'running') then
    raise exception 'that optimization run has already finished' using errcode = '55000';
  end if;

  for v_item in
    select e from jsonb_array_elements(p_routes) e order by e ->> 'route_id'
  loop
    v_reason := null;

    select * into v_route
    from public.routes r
    where r.organization_id = p_organization_id
      and r.id = (v_item ->> 'route_id')::uuid
      and r.route_date = v_run.route_date
    for update;

    if not found then
      v_reason := 'not_found';
    elsif v_route.status not in ('draft', 'optimized') then
      v_reason := 'not_editable';
    else
      select array_agg(rs.id order by rs.id) into v_cur
      from public.route_stops rs
      where rs.organization_id = p_organization_id and rs.route_id = v_route.id;
      select array_agg((s ->> 'stop_id')::uuid order by (s ->> 'stop_id')::uuid) into v_new
      from jsonb_array_elements(v_item -> 'stops') s;

      if v_cur is null then
        v_reason := 'no_stops';
      elsif v_cur is distinct from v_new then
        v_reason := 'changed';
      else
        v_n := cardinality(v_cur);
        if (
          select count(distinct (s ->> 'sequence')::integer) <> v_n
              or min((s ->> 'sequence')::integer) <> 1
              or max((s ->> 'sequence')::integer) <> v_n
          from jsonb_array_elements(v_item -> 'stops') s
        ) then
          raise exception 'stop sequences must be 1..n' using errcode = '22023';
        end if;

        if exists (
          select 1
          from public.route_stops rs
          join jsonb_to_recordset(v_item -> 'stops') as x(stop_id uuid, sequence integer)
            on x.stop_id = rs.id
          where rs.organization_id = p_organization_id and rs.route_id = v_route.id
            and rs.is_locked and rs.sequence <> x.sequence
        ) then
          v_reason := 'locked_moved';
        end if;
      end if;
    end if;

    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_object('route_id', v_item ->> 'route_id', 'reason', v_reason);
      continue;
    end if;

    update public.route_stops rs
    set sequence = x.sequence,
        planned_arrival = x.planned_arrival,
        planned_departure = x.planned_departure,
        travel_distance_m = x.travel_distance_m,
        travel_duration_s = x.travel_duration_s
    from jsonb_to_recordset(v_item -> 'stops') as x(
      stop_id uuid, sequence integer, planned_arrival timestamptz, planned_departure timestamptz,
      travel_distance_m integer, travel_duration_s integer
    )
    where rs.organization_id = p_organization_id and rs.route_id = v_route.id and rs.id = x.stop_id;

    update public.routes r
    set status = 'optimized',
        planned_start = coalesce((v_item ->> 'planned_start')::timestamptz, r.planned_start),
        planned_end = (v_item ->> 'planned_end')::timestamptz,
        total_distance_m = (v_item ->> 'total_distance_m')::integer,
        total_duration_s = (v_item ->> 'total_duration_s')::integer,
        polyline = nullif(v_item ->> 'polyline', ''),
        optimized_stop_count = v_n,
        optimization_run_id = p_run_id
    where r.organization_id = p_organization_id and r.id = v_route.id;

    v_applied := v_applied || v_route.id;
  end loop;

  v_failed := cardinality(v_applied) = 0 and jsonb_array_length(v_skipped) > 0;

  update public.optimization_runs
  set status = case when v_failed then 'failed'::public.optimization_status else 'succeeded'::public.optimization_status end,
      finished_at = now(),
      unassigned_visit_ids = coalesce(p_unassigned, '{}'),
      error = case
        when v_failed then 'Every route changed while the optimizer was working. Run it again.'
        when jsonb_array_length(v_skipped) > 0 then
          jsonb_array_length(v_skipped)::text || ' route(s) changed while the optimizer was working and were left as they were.'
        else null
      end
  where organization_id = p_organization_id and id = p_run_id;

  return jsonb_build_object('applied', to_jsonb(v_applied), 'skipped', v_skipped);
end;
$$;

comment on function public.apply_optimization_results(uuid, uuid, jsonb, uuid[]) is
  'Writes an optimizer result back to routes and route_stops in one transaction and finishes the run. service_role only; the trusted runner checks the caller first.';

revoke execute on function public.apply_optimization_results(uuid, uuid, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.apply_optimization_results(uuid, uuid, jsonb, uuid[]) to service_role;
