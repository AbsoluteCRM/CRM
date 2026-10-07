-- Worker API: what crew members (the mobile app) read and do. Workers have
-- no policies on clients, jobs, properties, visits, or time tables. These
-- security definer RPCs return crew-safe columns only and perform the few
-- actions a worker takes, stamping times from the server clock.
-- See ADR 0011 and docs/database/rls.md.
--
-- Scope: routes the caller is rostered on (route_members) that office staff
-- have published. Published and in-progress routes are actionable; completed
-- routes are read-only.

------------------------------------------------------------------------------
-- Scope helpers
------------------------------------------------------------------------------

-- The caller's rostered routes that are published, underway, or done.
create function private.worker_routes()
returns table (organization_id uuid, route_id uuid, route_status public.route_status, member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select r.organization_id, r.id, r.status, m.id
  from public.organization_members m
  join public.route_members rm on rm.organization_id = m.organization_id and rm.member_id = m.id
  join public.routes r on r.organization_id = rm.organization_id and r.id = rm.route_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and r.status in ('published', 'in_progress', 'completed')
$$;

-- The visits on those routes.
create function private.worker_visits()
returns table (organization_id uuid, visit_id uuid, route_id uuid, route_status public.route_status, member_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select wr.organization_id, rs.visit_id, wr.route_id, wr.route_status, wr.member_id
  from private.worker_routes() wr
  join public.route_stops rs on rs.organization_id = wr.organization_id and rs.route_id = wr.route_id
$$;

grant execute on function private.worker_routes(), private.worker_visits() to authenticated;

-- Resolves a visit the caller may act on (published or in-progress route)
-- and locks it. Raises if the visit isn't theirs.
create function private.worker_lock_visit(
  p_visit_id uuid,
  out o_organization_id uuid,
  out o_member_id uuid,
  out o_status public.visit_status
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  select w.organization_id, w.member_id into o_organization_id, o_member_id
  from private.worker_visits() w
  where w.visit_id = p_visit_id and w.route_status in ('published', 'in_progress')
  limit 1;
  if o_organization_id is null then
    raise exception 'visit not found on your published routes' using errcode = 'P0002';
  end if;

  select v.status into o_status from public.visits v
  where v.organization_id = o_organization_id and v.id = p_visit_id
  for update;
end;
$$;

------------------------------------------------------------------------------
-- Reads
------------------------------------------------------------------------------

-- The caller's routes on a date, across all their organizations.
create function public.worker_my_routes(p_date date)
returns table (
  route_id uuid,
  organization_id uuid,
  organization_name text,
  crew_id uuid,
  crew_name text,
  route_date date,
  status public.route_status,
  planned_start timestamptz,
  planned_end timestamptz,
  stop_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.organization_id, o.name, r.crew_id, c.name, r.route_date, r.status,
         r.planned_start, r.planned_end,
         (select count(*) from public.route_stops rs
          where rs.organization_id = r.organization_id and rs.route_id = r.id)::integer
  from private.worker_routes() wr
  join public.routes r on r.organization_id = wr.organization_id and r.id = wr.route_id
  join public.organizations o on o.id = r.organization_id
  join public.crews c on c.organization_id = r.organization_id and c.id = r.crew_id
  where r.route_date = p_date
  order by r.planned_start
$$;

-- A route's stops with what the crew needs on site. Internal fields (client
-- notes, job internal notes, billing) are never returned. price_cents (the
-- job's per-visit price) is null unless the org sets workers_see_prices.
create function public.worker_route_stops(p_route_id uuid)
returns table (
  stop_id uuid,
  sequence integer,
  planned_arrival timestamptz,
  planned_departure timestamptz,
  visit_id uuid,
  visit_status public.visit_status,
  window_start timestamptz,
  window_end timestamptz,
  duration_minutes integer,
  visit_instructions text,
  completion_notes text,
  job_id uuid,
  job_title text,
  job_instructions text,
  property_id uuid,
  property_name text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  access_notes text,
  client_name text,
  client_phone text,
  price_cents bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select rs.id, rs.sequence, rs.planned_arrival, rs.planned_departure,
         v.id, v.status, v.window_start, v.window_end, v.duration_minutes, v.instructions, v.completion_notes,
         j.id, j.title, j.instructions,
         p.id, p.name, p.address_line1, p.address_line2, p.city, p.region, p.postal_code,
         p.latitude, p.longitude, p.access_notes,
         c.display_name, c.phone,
         case when coalesce((o.settings ->> 'workers_see_prices')::boolean, false) then (
           select sum(jl.amount_cents)::bigint from public.job_line_items jl
           where jl.organization_id = j.organization_id and jl.job_id = j.id
         ) end
  from private.worker_routes() wr
  join public.organizations o on o.id = wr.organization_id
  join public.route_stops rs on rs.organization_id = wr.organization_id and rs.route_id = wr.route_id
  join public.visits v on v.organization_id = rs.organization_id and v.id = rs.visit_id
  join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
  join public.properties p on p.organization_id = v.organization_id and p.id = v.property_id
  join public.clients c on c.organization_id = j.organization_id and c.id = j.client_id
  where wr.route_id = p_route_id
  order by rs.sequence
$$;

-- The caller's own shifts whose org-local clock-in date is in [p_from, p_to].
create function public.worker_my_shifts(p_from date, p_to date)
returns table (
  shift_id uuid,
  organization_id uuid,
  route_id uuid,
  clock_in timestamptz,
  clock_out timestamptz,
  break_minutes integer,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.organization_id, s.route_id, s.clock_in, s.clock_out, s.break_minutes, s.approved_at
  from public.organization_members m
  join public.organizations o on o.id = m.organization_id
  join public.shifts s on s.organization_id = m.organization_id and s.member_id = m.id
  where m.user_id = (select auth.uid())
    and (s.clock_in at time zone o.timezone)::date between p_from and p_to
  order by s.clock_in desc
$$;

------------------------------------------------------------------------------
-- Visit actions
------------------------------------------------------------------------------

-- scheduled → in_progress, and opens the caller's time entry for the visit.
create function public.worker_start_visit(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  member uuid;
  st public.visit_status;
begin
  select * into org, member, st from private.worker_lock_visit(p_visit_id);
  if st <> 'scheduled' then
    raise exception 'only a scheduled visit can be started (this one is %)', st using errcode = '55000';
  end if;
  if exists (
    select 1 from public.visit_time_entries
    where organization_id = org and member_id = member and ended_at is null
  ) then
    raise exception 'finish your current visit first' using errcode = '55000';
  end if;

  update public.visits set status = 'in_progress' where organization_id = org and id = p_visit_id;
  insert into public.visit_time_entries (organization_id, visit_id, member_id, started_at, source)
  values (org, p_visit_id, member, clock_timestamp(), 'app');
end;
$$;

-- scheduled|in_progress → completed. Records the caller as completing it
-- and closes every open time entry on the visit.
create function public.worker_complete_visit(p_visit_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  member uuid;
  st public.visit_status;
begin
  select * into org, member, st from private.worker_lock_visit(p_visit_id);
  if st not in ('scheduled', 'in_progress') then
    raise exception 'this visit is already %', st using errcode = '55000';
  end if;

  update public.visits
  set status = 'completed',
      completion_notes = coalesce(p_notes, completion_notes),
      completed_by_member_id = member
  where organization_id = org and id = p_visit_id;

  update public.visit_time_entries set ended_at = clock_timestamp()
  where organization_id = org and visit_id = p_visit_id and ended_at is null;
end;
$$;

-- scheduled|in_progress → no_show (nobody home, no access…). Closes open
-- time entries on the visit.
create function public.worker_mark_no_show(p_visit_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  member uuid;
  st public.visit_status;
begin
  select * into org, member, st from private.worker_lock_visit(p_visit_id);
  if st not in ('scheduled', 'in_progress') then
    raise exception 'this visit is already %', st using errcode = '55000';
  end if;

  update public.visits
  set status = 'no_show', completion_notes = coalesce(p_notes, completion_notes)
  where organization_id = org and id = p_visit_id;

  update public.visit_time_entries set ended_at = clock_timestamp()
  where organization_id = org and visit_id = p_visit_id and ended_at is null;
end;
$$;

-- Records a photo or file the app already uploaded to
-- {org}/visits/{visit}/{file} (storage policies allow that folder).
create function public.worker_add_attachment(
  p_visit_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_caption text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  member uuid;
  st public.visit_status;
  att_id uuid;
begin
  select * into org, member, st from private.worker_lock_visit(p_visit_id);
  insert into public.attachments (organization_id, storage_path, mime_type, size_bytes, caption, visit_id)
  values (org, p_storage_path, p_mime_type, p_size_bytes, p_caption, p_visit_id)
  returning id into att_id;
  return att_id;
end;
$$;

------------------------------------------------------------------------------
-- Clock in / out
------------------------------------------------------------------------------

-- Opens a shift now for the caller in an org, optionally on one of their
-- routes.
create function public.worker_clock_in(p_organization_id uuid, p_route_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid := private.my_member_id(p_organization_id);
  shift_id uuid;
begin
  if member is null then
    raise exception 'you are not an active member of this organization' using errcode = '42501';
  end if;
  if p_route_id is not null and not exists (
    select 1 from public.route_members
    where organization_id = p_organization_id and route_id = p_route_id and member_id = member
  ) then
    raise exception 'you are not on that route' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.shifts
    where organization_id = p_organization_id and member_id = member and clock_out is null
  ) then
    raise exception 'you are already clocked in' using errcode = '55000';
  end if;

  insert into public.shifts (organization_id, member_id, route_id, clock_in, source)
  values (p_organization_id, member, p_route_id, clock_timestamp(), 'app')
  returning id into shift_id;
  return shift_id;
end;
$$;

-- Closes the caller's open shift in an org now.
create function public.worker_clock_out(p_organization_id uuid, p_break_minutes integer default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid := private.my_member_id(p_organization_id);
  shift_id uuid;
begin
  update public.shifts
  set clock_out = clock_timestamp(), break_minutes = coalesce(p_break_minutes, 0)
  where organization_id = p_organization_id and member_id = member and clock_out is null
  returning id into shift_id;
  if shift_id is null then
    raise exception 'you are not clocked in' using errcode = 'P0002';
  end if;
  return shift_id;
end;
$$;

revoke execute on function
  public.worker_my_routes(date),
  public.worker_route_stops(uuid),
  public.worker_my_shifts(date, date),
  public.worker_start_visit(uuid),
  public.worker_complete_visit(uuid, text),
  public.worker_mark_no_show(uuid, text),
  public.worker_add_attachment(uuid, text, text, bigint, text),
  public.worker_clock_in(uuid, uuid),
  public.worker_clock_out(uuid, integer)
from public, anon;
grant execute on function
  public.worker_my_routes(date),
  public.worker_route_stops(uuid),
  public.worker_my_shifts(date, date),
  public.worker_start_visit(uuid),
  public.worker_complete_visit(uuid, text),
  public.worker_mark_no_show(uuid, text),
  public.worker_add_attachment(uuid, text, text, bigint, text),
  public.worker_clock_in(uuid, uuid),
  public.worker_clock_out(uuid, integer)
to authenticated;

------------------------------------------------------------------------------
-- Storage: read and upload (office: whole org folder; workers: their
-- visits' folders, uploads only while the route is actionable)
------------------------------------------------------------------------------

create policy "Staff can read their org's files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'org-files'
    and (
      (storage.foldername(name))[1] = any (array(select o::text from private.my_org_ids('{owner,admin,dispatcher}') o))
      or (
        (storage.foldername(name))[2] = 'visits'
        and (storage.foldername(name))[1] || '/' || (storage.foldername(name))[3]
            = any (array(select w.organization_id::text || '/' || w.visit_id::text from private.worker_visits() w))
      )
    )
  );

create policy "Staff can upload to their org's files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'org-files'
    and (
      (storage.foldername(name))[1] = any (array(select o::text from private.my_org_ids('{owner,admin,dispatcher}') o))
      or (
        (storage.foldername(name))[2] = 'visits'
        and (storage.foldername(name))[1] || '/' || (storage.foldername(name))[3]
            = any (array(
                select w.organization_id::text || '/' || w.visit_id::text from private.worker_visits() w
                where w.route_status in ('published', 'in_progress')
              ))
      )
    )
  );
