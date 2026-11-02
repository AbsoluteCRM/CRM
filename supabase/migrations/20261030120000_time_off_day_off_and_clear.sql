-- Time off: a one-off "day off" kind, and clearing approved time off for a
-- range of dates, so a manager can mark someone available again.
-- See docs/database/tables/tenancy.md ("time_off").

alter type public.time_off_kind add value if not exists 'day_off';

-- Owners and admins clear a member's approved time off between p_start and
-- p_end. Time off that runs past the range keeps those days: the original row
-- is cancelled and the parts outside the range are saved again as approved.
-- Returns how many time-off rows were touched.
create function public.clear_time_off(p_member_id uuid, p_start date, p_end date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  me uuid;
  t public.time_off;
  touched integer := 0;
begin
  select organization_id into org from public.organization_members where id = p_member_id;
  if org is null or not private.has_org_role(org, '{owner,admin}') then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if p_end < p_start then
    raise exception 'the end date is before the start date' using errcode = '22023';
  end if;
  me := private.my_member_id(org);
  -- Same lock as assert_no_time_off_overlap, so a request can't slip in between.
  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text, 3));

  for t in
    select * from public.time_off
    where organization_id = org and member_id = p_member_id and status = 'approved'
      and start_date <= p_end and end_date >= p_start
    for update
  loop
    update public.time_off set status = 'cancelled' where id = t.id;
    if t.start_date < p_start then
      insert into public.time_off
        (organization_id, member_id, kind, start_date, end_date, note, status,
         requested_by_member_id, reviewed_by_member_id, reviewed_at)
      values (org, p_member_id, t.kind, t.start_date, p_start - 1, t.note, 'approved',
              t.requested_by_member_id, me, now());
    end if;
    if t.end_date > p_end then
      insert into public.time_off
        (organization_id, member_id, kind, start_date, end_date, note, status,
         requested_by_member_id, reviewed_by_member_id, reviewed_at)
      values (org, p_member_id, t.kind, p_end + 1, t.end_date, t.note, 'approved',
              t.requested_by_member_id, me, now());
    end if;
    touched := touched + 1;
  end loop;
  return touched;
end;
$$;

revoke execute on function public.clear_time_off(uuid, date, date) from public, anon;
grant execute on function public.clear_time_off(uuid, date, date) to authenticated;
