-- Security review: moving a stop to another route without locking its visit
-- let a concurrent reschedule commit with the stop left on a route for the
-- old date. Lock the visit on every stop write again (the worst case is a
-- retryable deadlock, 40P01), and make the reschedule's unroute delete use a
-- correlated NOT EXISTS so a READ COMMITTED re-check can't skip a stop that
-- was just moved.
create or replace function private.guard_route_stop_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  visit_date date;
begin
  select scheduled_date into visit_date from public.visits
  where organization_id = new.organization_id and id = new.visit_id
  for no key update;

  if visit_date is distinct from
     (select route_date from public.routes where organization_id = new.organization_id and id = new.route_id) then
    raise exception 'a visit can only be routed on its scheduled date' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.visit_rescheduled_unroute()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.route_stops rs
  where rs.organization_id = new.organization_id and rs.visit_id = new.id
    and not exists (
      select 1 from public.routes r
      where r.organization_id = rs.organization_id and r.id = rs.route_id
        and r.route_date is not distinct from new.scheduled_date);
  return null;
end;
$$;
