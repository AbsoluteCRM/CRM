-- Auto-assignment: generate_draft_routes(org, date) puts a date's scheduled,
-- unrouted visits on draft routes by service area. Runs as the caller
-- (security invoker), so the office-staff RLS on routes, route_stops, visits,
-- jobs and properties decides access; it also checks the role explicitly.
-- See docs/database/tables/crews-routing.md and docs/plans/auto-assign-routes.md.
--
-- Owning crew, in order (roadmap decision D1 and Q4):
--   1. jobs.preferred_crew_id, when that crew is not archived;
--   2. the rotation crew for the visit date's ISO weekday on the property's
--      service area (service_area_rotations);
--   3. the area's crew.
-- Where the service area comes from: properties.service_area_id, which the
-- service-areas triggers keep current (priority desc, smaller area, oldest).

------------------------------------------------------------------------------
-- private.order_stops: straight-line visiting order (pure)
------------------------------------------------------------------------------

-- Returns the order to visit p_points, as indexes into the array. Nearest
-- neighbour from p_origin, then 2-opt passes on the open path (the origin
-- stays first and nothing returns to it) until no reversal shortens the path
-- or 100 passes have run. Distances are ST_Distance on geography (metres, as
-- the crow flies; no roads). A null origin makes point 1 the fixed first stop.
-- Ties break toward the lower index, so the result is deterministic.
create function private.order_stops(p_origin extensions.geography, p_points extensions.geography[])
returns integer[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := coalesce(cardinality(p_points), 0);
  shift integer := case when p_origin is null then 0 else 1 end;
  m integer := n + shift;            -- nodes: the origin (if any), then the points
  nodes extensions.geography[];
  d double precision[];              -- flat m x m matrix: d[(a - 1) * m + b]
  tour integer[];
  seen boolean[];
  a integer;
  b integer;
  c integer;
  e integer;
  best integer;
  best_d double precision;
  delta double precision;
  improved boolean;
  passes integer := 0;
  i integer;
  j integer;
  result integer[] := '{}';
begin
  if n = 0 then
    return result;
  end if;
  if n = 1 then
    return array[1];
  end if;

  nodes := case when p_origin is null then p_points else array[p_origin] || p_points end;

  d := array_fill(0::double precision, array[m * m]);
  for a in 1..m loop
    for b in a + 1..m loop
      d[(a - 1) * m + b] := extensions.st_distance(nodes[a], nodes[b]);
      d[(b - 1) * m + a] := d[(a - 1) * m + b];
    end loop;
  end loop;

  -- Nearest neighbour from node 1.
  tour := array[1];
  seen := array_fill(false, array[m]);
  seen[1] := true;
  for i in 2..m loop
    best := null;
    best_d := null;
    a := tour[i - 1];
    for b in 1..m loop
      if not seen[b] and (best is null or d[(a - 1) * m + b] < best_d) then
        best := b;
        best_d := d[(a - 1) * m + b];
      end if;
    end loop;
    tour := tour || best;
    seen[best] := true;
  end loop;

  -- 2-opt: reverse tour[i..j] when that shortens the path. Position 1 is fixed.
  loop
    improved := false;
    for i in 2..m - 1 loop
      for j in i + 1..m loop
        a := tour[i - 1];
        b := tour[i];
        c := tour[j];
        delta := d[(a - 1) * m + c] - d[(a - 1) * m + b];
        if j < m then
          e := tour[j + 1];
          delta := delta + d[(b - 1) * m + e] - d[(c - 1) * m + e];
        end if;
        if delta < -0.001 then
          tour := tour[1:i - 1] || (
            select coalesce(array_agg(tour[k] order by k desc), '{}')
            from generate_series(i, j) k
          ) || tour[j + 1:m];
          improved := true;
        end if;
      end loop;
    end loop;
    passes := passes + 1;
    exit when not improved or passes >= 100;
  end loop;

  -- Node numbers back to indexes into p_points.
  for i in 1 + shift..m loop
    result := result || (tour[i] - shift);
  end loop;
  return result;
end;
$$;

grant execute on function private.order_stops(extensions.geography, extensions.geography[]) to authenticated;

------------------------------------------------------------------------------
-- generate_draft_routes
------------------------------------------------------------------------------

-- Returns
--   { "assigned": n, "routes_created": n, "remaining": n,
--     "unassigned": [ { "visit_id": uuid, "reason": text }, ... ] }
-- reason is one of: no_location (the property has no map location),
-- no_area (no service area covers it and no preferred crew), area_has_no_crew,
-- crew_archived (the owning crew is archived), route_locked (the crew's route
-- for the date is published, in progress or completed). `remaining` counts
-- eligible visits beyond the 500 handled per call; run again to place them.
--
-- One transaction: any error undoes everything. Runs for one org and date at
-- a time (advisory lock). Existing stops, locked stops and non-draft routes
-- are never changed; new stops are appended after the highest sequence with
-- travel_distance_m set from straight-line distance. travel_duration_s and
-- the planned times stay null. A second run places nothing new.
create function public.generate_draft_routes(p_organization_id uuid, p_date date)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c_max constant integer := 500;
  v_total integer;
  v_ids uuid[];
  v_crews uuid[];
  v_reasons text[];
  v_crew uuid;
  v_route uuid;
  v_status public.route_status;
  v_start extensions.geography;
  v_origin extensions.geography;
  v_base integer;
  v_visit_ids uuid[];
  v_points extensions.geography[];
  v_order integer[];
  v_assigned integer := 0;
  v_created integer := 0;
  v_unassigned jsonb;
begin
  if p_organization_id is null or p_date is null then
    raise exception 'organization and date are required' using errcode = '22023';
  end if;
  if not private.has_org_role(p_organization_id, '{owner,admin,dispatcher}') then
    raise exception 'not allowed to build routes' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('generate_draft_routes:' || p_organization_id::text || ':' || p_date::text, 0)
  );

  -- Classify the eligible visits: each gets a crew or a reason.
  select coalesce(max(x.total), 0),
         coalesce(array_agg(x.visit_id order by x.ord), '{}'),
         coalesce(array_agg(x.crew_id order by x.ord), '{}'),
         coalesce(array_agg(x.reason order by x.ord), '{}')
  into v_total, v_ids, v_crews, v_reasons
  from (
    select b.visit_id, b.ord, b.total,
      case
        when b.no_location then null
        when b.pref_id is not null and not b.pref_archived then b.pref_id
        when b.area_id is null or b.owner_id is null or b.owner_archived then null
        else b.owner_id
      end as crew_id,
      case
        when b.no_location then 'no_location'
        when b.pref_id is not null and not b.pref_archived then null
        when b.area_id is null then case when b.pref_id is not null then 'crew_archived' else 'no_area' end
        when b.owner_id is null then 'area_has_no_crew'
        when b.owner_archived then 'crew_archived'
        else null
      end as reason
    from (
      select vi.id as visit_id,
             row_number() over (order by vi.window_start nulls last, vi.id) as ord,
             count(*) over () as total,
             pr.location is null as no_location,
             j.preferred_crew_id as pref_id,
             pc.archived_at is not null as pref_archived,
             pr.service_area_id as area_id,
             oc.id as owner_id,
             oc.archived_at is not null as owner_archived
      from public.visits vi
      join public.jobs j
        on j.organization_id = vi.organization_id and j.id = vi.job_id
      join public.properties pr
        on pr.organization_id = vi.organization_id and pr.id = vi.property_id
      left join public.crews pc
        on pc.organization_id = vi.organization_id and pc.id = j.preferred_crew_id
      left join public.service_areas sa
        on sa.organization_id = pr.organization_id and sa.id = pr.service_area_id
      left join public.service_area_rotations rot
        on rot.organization_id = sa.organization_id and rot.service_area_id = sa.id
           and rot.weekday = extract(isodow from p_date)::smallint
      left join public.crews oc
        on oc.organization_id = sa.organization_id and oc.id = coalesce(rot.crew_id, sa.crew_id)
      where vi.organization_id = p_organization_id
        and vi.scheduled_date = p_date
        and vi.status = 'scheduled'
        and not exists (
          select 1 from public.route_stops rs
          where rs.organization_id = vi.organization_id and rs.visit_id = vi.id
        )
      order by vi.window_start nulls last, vi.id
      limit c_max
    ) b
  ) x;

  select coalesce(jsonb_agg(
           jsonb_build_object('visit_id', t.vid, 'reason', t.reason) order by t.ord
         ), '[]'::jsonb)
  into v_unassigned
  from unnest(v_ids, v_reasons) with ordinality as t(vid, reason, ord)
  where t.reason is not null;

  for v_crew in
    select distinct c from unnest(v_crews) c where c is not null order by c
  loop
    select array_agg(t.vid order by t.ord)
    into v_visit_ids
    from unnest(v_ids, v_crews) with ordinality as t(vid, cid, ord)
    where t.cid = v_crew;

    -- The crew's route for the date: lock it, or create it the way a manual
    -- create does (the triggers copy depots and the start time, seed the roster).
    select r.id, r.status, r.start_location
    into v_route, v_status, v_start
    from public.routes r
    where r.organization_id = p_organization_id and r.crew_id = v_crew and r.route_date = p_date
    for update;

    if not found then
      v_route := public.create_route(p_organization_id, p_date, v_crew);
      v_created := v_created + 1;
      select r.start_location into v_start from public.routes r
      where r.organization_id = p_organization_id and r.id = v_route;
    elsif v_status not in ('draft', 'optimized') then
      v_unassigned := v_unassigned || (
        select jsonb_agg(jsonb_build_object('visit_id', x, 'reason', 'route_locked'))
        from unnest(v_visit_ids) x
      );
      continue;
    end if;

    -- New stops go after the existing ones, which stay as they are.
    select coalesce(max(rs.sequence), 0) into v_base
    from public.route_stops rs
    where rs.organization_id = p_organization_id and rs.route_id = v_route;

    if v_base > 0 then
      select pr.location into v_origin
      from public.route_stops rs
      join public.visits vi on vi.organization_id = rs.organization_id and vi.id = rs.visit_id
      join public.properties pr on pr.organization_id = vi.organization_id and pr.id = vi.property_id
      where rs.organization_id = p_organization_id and rs.route_id = v_route and rs.sequence = v_base;
    else
      v_origin := v_start;
    end if;

    select array_agg(pr.location order by t.ord)
    into v_points
    from unnest(v_visit_ids) with ordinality as t(vid, ord)
    join public.visits vi on vi.organization_id = p_organization_id and vi.id = t.vid
    join public.properties pr on pr.organization_id = vi.organization_id and pr.id = vi.property_id;

    v_order := private.order_stops(v_origin, v_points);

    insert into public.route_stops (organization_id, route_id, visit_id, sequence, travel_distance_m)
    select p_organization_id, v_route, v_visit_ids[o.pt], v_base + o.k::integer,
           case
             when o.prev is not null
               then round(extensions.st_distance(v_points[o.prev], v_points[o.pt]))::integer
             when v_origin is not null
               then round(extensions.st_distance(v_origin, v_points[o.pt]))::integer
           end
    from (
      select s.pt, s.k, lag(s.pt) over (order by s.k) as prev
      from unnest(v_order) with ordinality as s(pt, k)
    ) o;

    v_assigned := v_assigned + cardinality(v_visit_ids);
  end loop;

  return jsonb_build_object(
    'assigned', v_assigned,
    'routes_created', v_created,
    'remaining', greatest(v_total - c_max, 0),
    'unassigned', v_unassigned
  );
end;
$$;

comment on function public.generate_draft_routes(uuid, date) is
  'Places a date''s scheduled, unrouted visits on draft routes by service area. Straight-line ordering only; no ETAs. security invoker.';

revoke execute on function public.generate_draft_routes(uuid, date) from public, anon, service_role;
grant execute on function public.generate_draft_routes(uuid, date) to authenticated;
