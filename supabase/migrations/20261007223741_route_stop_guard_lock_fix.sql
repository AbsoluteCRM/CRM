-- Lock the visit only when a stop is created or points at another visit. A
-- plain route move already holds the stop row, and locking the visit too
-- could deadlock with a reschedule that deletes that stop.
create or replace function private.guard_route_stop_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  visit_date date;
begin
  if tg_op = 'INSERT' or new.visit_id is distinct from old.visit_id then
    select scheduled_date into visit_date from public.visits
    where organization_id = new.organization_id and id = new.visit_id
    for no key update;
  else
    select scheduled_date into visit_date from public.visits
    where organization_id = new.organization_id and id = new.visit_id;
  end if;

  if visit_date is distinct from
     (select route_date from public.routes where organization_id = new.organization_id and id = new.route_id) then
    raise exception 'a visit can only be routed on its scheduled date' using errcode = '23514';
  end if;
  return new;
end;
$$;
