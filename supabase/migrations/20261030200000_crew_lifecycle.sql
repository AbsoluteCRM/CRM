-- Crew lifecycle: disable (inactive, stays on the board), archive (hidden,
-- restorable) and permanent delete. See docs/database/tables/crews-routing.md.
--
-- A worker's own history lives on visit_time_entries, shifts and the visits
-- they completed, not on the crew, so deleting a crew keeps it.

alter table public.crews add column disabled_at timestamptz;

grant insert (disabled_at), update (disabled_at) on public.crews to authenticated;

-- before insert on routes: disabled and archived crews can't take new work.
create function private.guard_route_crew_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.crews
    where organization_id = new.organization_id and id = new.crew_id
      and (disabled_at is not null or archived_at is not null)
  ) then
    raise exception 'this crew is inactive' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger guard_crew_active
  before insert on public.routes
  for each row execute function private.guard_route_crew_active();

-- What a crew has done, so the app can recommend disabling or archiving over
-- deleting. Runs as the caller: routes and visits are office-staff only.
create function public.crew_history(p_crew_id uuid)
returns table (past_routes integer, upcoming_routes integer, completed_visits integer, last_route_date date)
language sql
stable
security invoker
set search_path = ''
as $$
  with today as (
    select (now() at time zone o.timezone)::date as d
    from public.crews c join public.organizations o on o.id = c.organization_id
    where c.id = p_crew_id
  )
  select
    (select count(*)::integer from public.routes r, today
       where r.crew_id = p_crew_id and r.route_date < today.d),
    (select count(*)::integer from public.routes r, today
       where r.crew_id = p_crew_id and r.route_date >= today.d),
    (select count(distinct v.id)::integer
       from public.routes r
       join public.route_stops rs on rs.organization_id = r.organization_id and rs.route_id = r.id
       join public.visits v on v.organization_id = rs.organization_id and v.id = rs.visit_id
       where r.crew_id = p_crew_id and v.status = 'completed'),
    (select max(r.route_date) from public.routes r, today
       where r.crew_id = p_crew_id and r.route_date < today.d);
$$;

-- Owners and admins delete a crew for good, with its routes. Route stops go
-- with the routes (their visits become unrouted); shifts keep their hours and
-- lose only the route link; visit time entries and completed visits stay.
-- Returns how many routes were removed.
create function public.delete_crew(p_crew_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  removed integer;
begin
  select organization_id into org from public.crews where id = p_crew_id for update;
  if org is null or not private.has_org_role(org, '{owner,admin}') then
    raise exception 'crew not found' using errcode = 'P0002';
  end if;

  delete from public.routes where organization_id = org and crew_id = p_crew_id;
  get diagnostics removed = row_count;
  delete from public.crews where organization_id = org and id = p_crew_id;
  return removed;
end;
$$;

revoke execute on function public.crew_history(uuid) from public, anon;
revoke execute on function public.delete_crew(uuid) from public, anon;
grant execute on function public.crew_history(uuid) to authenticated;
grant execute on function public.delete_crew(uuid) to authenticated;
