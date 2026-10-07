-- Jobs & visits: the work agreement, its per-visit price and taxes, the
-- concrete visits crews are routed to, and file attachments.
-- See docs/database/tables/jobs-visits.md and ADR 0005.
--
-- RLS: office staff only. Workers act through worker_* RPCs (ADR 0010), and
-- portal users read through portal_* RPCs.

create type public.job_kind as enum ('one_off', 'recurring');
create type public.job_status as enum ('active', 'on_hold', 'completed', 'cancelled');
create type public.job_billing_mode as enum ('per_visit', 'periodic');
create type public.billing_period as enum ('monthly');
create type public.visit_status as enum (
  'unscheduled', 'scheduled', 'in_progress', 'completed', 'skipped', 'cancelled', 'no_show'
);

------------------------------------------------------------------------------
-- jobs
------------------------------------------------------------------------------

create table public.jobs (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  client_id uuid not null,
  property_id uuid not null,
  quote_id uuid,
  kind public.job_kind not null default 'one_off',
  status public.job_status not null default 'active',
  title text not null check (length(trim(title)) > 0),
  instructions text,
  internal_notes text,
  billing_mode public.job_billing_mode not null default 'per_visit',
  billing_period public.billing_period,
  rrule text,
  start_date date not null,
  end_date date,
  -- Arrival window: a local start time plus a length, so it can run past
  -- midnight (e.g. 22:00 for 360 minutes for overnight snow clearing).
  window_start time,
  window_minutes integer check (window_minutes between 1 and 1440),
  visit_duration_minutes integer not null default 60 check (visit_duration_minutes > 0),
  preferred_crew_id uuid,
  generated_through date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  unique (organization_id, quote_id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id, property_id)
    references public.properties (organization_id, client_id, id) on delete restrict,
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete set null (quote_id),
  foreign key (organization_id, preferred_crew_id)
    references public.crews (organization_id, id) on delete set null (preferred_crew_id),
  check ((billing_mode = 'periodic') = (billing_period is not null)),
  -- A recurring job has an RFC 5545 RRULE with FREQ and without DTSTART.
  check ((kind = 'recurring') = (rrule is not null)),
  check (rrule is null or (rrule ~ '(^|;)FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;|$)' and rrule !~* 'DTSTART')),
  check (end_date is null or end_date >= start_date),
  check ((window_start is null) = (window_minutes is null))
);

create index jobs_org_status_idx on public.jobs (organization_id, status);
create index jobs_client_property_idx on public.jobs (organization_id, client_id, property_id);
create index jobs_preferred_crew_idx on public.jobs (organization_id, preferred_crew_id);
create index jobs_created_by_idx on public.jobs (created_by);
create index jobs_to_generate_idx
  on public.jobs (organization_id, generated_through)
  where kind = 'recurring' and status = 'active';

create trigger assign_number
  before insert on public.jobs
  for each row execute function private.assign_document_number('job');

create trigger set_updated_at
  before update on public.jobs
  for each row execute function extensions.moddatetime(updated_at);

-- before insert: a one-off job's single visit (created after insert) covers
-- its start date, so the generation watermark starts there.
create function private.job_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'one_off' then
    new.generated_through := new.start_date;
  end if;
  return new;
end;
$$;

create trigger set_defaults
  before insert on public.jobs
  for each row execute function private.job_defaults();

grant insert (organization_id, client_id, property_id, quote_id, kind, status, title, instructions,
              internal_notes, billing_mode, billing_period, rrule, start_date, end_date,
              window_start, window_minutes, visit_duration_minutes, preferred_crew_id)
  on public.jobs to authenticated;
grant update (property_id, status, title, instructions, internal_notes, billing_mode, billing_period,
              rrule, start_date, end_date, window_start, window_minutes, visit_duration_minutes,
              preferred_crew_id)
  on public.jobs to authenticated;

-- A visit's arrival window on local date `d`, resolved in the org timezone.
-- The end is start + length in elapsed time, so a window that crosses a DST
-- change keeps its length.
create function private.visit_window(p_date date, p_start time, p_minutes integer, p_tz text)
returns tstzrange
language sql
stable
set search_path = ''
as $$
  select case when p_start is null then null else
    tstzrange(
      (p_date + p_start) at time zone p_tz,
      ((p_date + p_start) at time zone p_tz) + make_interval(mins => p_minutes)
    )
  end
$$;

------------------------------------------------------------------------------
-- job_line_items (the price of one visit) and their taxes
------------------------------------------------------------------------------

create table public.job_line_items (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null,
  service_id uuid,
  position integer not null,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  amount_cents bigint generated always as (round(quantity * unit_price_cents)::bigint) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, job_id)
    references public.jobs (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id)
    references public.services (organization_id, id) on delete set null (service_id)
);

create index job_line_items_job_idx on public.job_line_items (organization_id, job_id, position);
create index job_line_items_service_idx on public.job_line_items (organization_id, service_id);

create trigger set_updated_at
  before update on public.job_line_items
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, job_id, service_id, position, description, quantity, unit_price_cents)
  on public.job_line_items to authenticated;
grant update (service_id, position, description, quantity, unit_price_cents)
  on public.job_line_items to authenticated;

-- Which rates apply to a job line. No snapshot: invoices snapshot the rate
-- when they're created. A rate in use can't be deleted (restrict), and its
-- percentage never changes (tax_rates grants).
create table public.job_line_item_taxes (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  line_item_id uuid not null,
  tax_rate_id uuid not null,
  primary key (organization_id, line_item_id, tax_rate_id),
  foreign key (organization_id, line_item_id)
    references public.job_line_items (organization_id, id) on delete cascade,
  foreign key (organization_id, tax_rate_id)
    references public.tax_rates (organization_id, id) on delete restrict
);

create index job_line_item_taxes_tax_rate_idx on public.job_line_item_taxes (organization_id, tax_rate_id);

create trigger guard_tax_rate_usable
  before insert on public.job_line_item_taxes
  for each row execute function private.guard_tax_rate_usable();

grant insert (organization_id, line_item_id, tax_rate_id) on public.job_line_item_taxes to authenticated;

------------------------------------------------------------------------------
-- visits
------------------------------------------------------------------------------

create table public.visits (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null,
  property_id uuid not null,
  occurrence_date date,
  status public.visit_status not null default 'scheduled',
  scheduled_date date,
  window_start timestamptz,
  window_end timestamptz,
  duration_minutes integer not null check (duration_minutes > 0),
  is_exception boolean not null default false,
  instructions text,
  actual_start timestamptz,
  actual_end timestamptz,
  completed_by_member_id uuid,
  completion_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  -- One generated visit per RRULE occurrence. Also the FK index for jobs.
  unique (organization_id, job_id, occurrence_date),
  foreign key (organization_id, job_id)
    references public.jobs (organization_id, id) on delete cascade,
  foreign key (organization_id, property_id)
    references public.properties (organization_id, id) on delete restrict,
  foreign key (organization_id, completed_by_member_id)
    references public.organization_members (organization_id, id) on delete set null (completed_by_member_id),
  constraint visits_scheduled_date_check check (status = 'unscheduled' or scheduled_date is not null),
  constraint visits_window_check check ((window_start is null) = (window_end is null) and (window_end is null or window_end > window_start)),
  constraint visits_actuals_check check (actual_end is null or (actual_start is not null and actual_end >= actual_start))
);

comment on column public.visits.is_exception is
  'Set automatically when a generated visit is moved, re-timed, skipped, or cancelled. Regeneration never touches exceptions.';

create index visits_board_idx on public.visits (organization_id, scheduled_date, status);
create index visits_property_idx on public.visits (organization_id, property_id);
create index visits_completed_by_idx on public.visits (organization_id, completed_by_member_id);

create trigger set_updated_at
  before update on public.visits
  for each row execute function extensions.moddatetime(updated_at);

-- Manual visits only: generated ones come from generate_visits(). property_id
-- comes from the job, and is_exception is maintained by trigger.
grant insert (organization_id, job_id, status, scheduled_date, window_start, window_end,
              duration_minutes, instructions)
  on public.visits to authenticated;
grant update (status, scheduled_date, window_start, window_end, duration_minutes, instructions,
              actual_start, actual_end, completed_by_member_id, completion_notes)
  on public.visits to authenticated;

-- before insert: property and duration come from the job.
create function private.visit_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where organization_id = new.organization_id and id = new.job_id;
  if found then
    new.property_id := j.property_id;
    new.duration_minutes := coalesce(new.duration_minutes, j.visit_duration_minutes);
  end if;
  return new;
end;
$$;

create trigger set_defaults
  before insert on public.visits
  for each row execute function private.visit_defaults();

-- before update:
-- - A billed visit (live invoice_visits row, created by the invoices
--   migration) can't change status, date, property, or duration.
-- - Stamps actuals on status changes.
-- - Marks generated visits as exceptions when a person moves, re-times,
--   skips, or cancels them.
create function private.visit_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status, new.scheduled_date, new.property_id, new.duration_minutes)
       is distinct from (old.status, old.scheduled_date, old.property_id, old.duration_minutes)
     and exists (
       select 1 from public.invoice_visits iv
       where iv.organization_id = old.organization_id and iv.visit_id = old.id and not iv.is_void
     ) then
    raise exception 'this visit has been billed; void its invoice first' using errcode = '55000';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_progress' then
      new.actual_start := coalesce(new.actual_start, now());
    elsif new.status = 'completed' then
      new.actual_start := coalesce(new.actual_start, now());
      new.actual_end := coalesce(new.actual_end, now());
    end if;
  end if;

  if old.occurrence_date is not null and (
       new.scheduled_date is distinct from old.scheduled_date
    or new.window_start is distinct from old.window_start
    or new.window_end is distinct from old.window_end
    or new.duration_minutes is distinct from old.duration_minutes
    or (new.status is distinct from old.status and new.status in ('skipped', 'cancelled', 'unscheduled'))
  ) then
    new.is_exception := true;
  end if;

  return new;
end;
$$;

create trigger before_update
  before update on public.visits
  for each row execute function private.visit_before_update();

------------------------------------------------------------------------------
-- Job lifecycle triggers
------------------------------------------------------------------------------


-- after insert: a job created from a quote converts the quote (which must be
-- approved and for the same client) and copies its counted lines and their
-- tax rates. Runs as definer, so archived rates already on the quote carry
-- over.
create function private.job_from_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.quote_line_items;
  job_line_id uuid;
begin
  update public.quotes
  set status = 'converted'
  where organization_id = new.organization_id and id = new.quote_id
    and status = 'approved' and client_id = new.client_id;
  if not found then
    raise exception 'a job can only be created from an approved quote for the same client'
      using errcode = '23514';
  end if;

  for l in
    select * from public.quote_line_items
    where organization_id = new.organization_id and quote_id = new.quote_id
      and (not is_optional or is_selected)
    order by position
  loop
    insert into public.job_line_items
      (organization_id, job_id, service_id, position, description, quantity, unit_price_cents)
    values
      (new.organization_id, new.id, l.service_id, l.position, l.description, l.quantity, l.unit_price_cents)
    returning id into job_line_id;

    insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id)
    select t.organization_id, job_line_id, t.tax_rate_id
    from public.quote_line_item_taxes t
    where t.organization_id = new.organization_id and t.line_item_id = l.id;
  end loop;

  return null;
end;
$$;

create trigger from_quote
  after insert on public.jobs
  for each row when (new.quote_id is not null)
  execute function private.job_from_quote();

-- after insert: a one-off job gets its single visit on start_date.
create function private.job_create_one_off_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  w tstzrange;
begin
  select private.visit_window(new.start_date, new.window_start, new.window_minutes, o.timezone)
  into w
  from public.organizations o where o.id = new.organization_id;

  insert into public.visits
    (organization_id, job_id, property_id, occurrence_date, scheduled_date, window_start, window_end, duration_minutes)
  values (
    new.organization_id, new.id, new.property_id, new.start_date, new.start_date,
    lower(w), upper(w), new.visit_duration_minutes
  );
  return null;
end;
$$;

create trigger create_one_off_visit
  after insert on public.jobs
  for each row when (new.kind = 'one_off')
  execute function private.job_create_one_off_visit();

-- after update of property_id: open visits follow the job to its new property.
create function private.job_property_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.visits
  set property_id = new.property_id
  where organization_id = new.organization_id and job_id = new.id
    and status in ('unscheduled', 'scheduled');
  return null;
end;
$$;

create trigger property_changed
  after update of property_id on public.jobs
  for each row when (new.property_id is distinct from old.property_id)
  execute function private.job_property_changed();

------------------------------------------------------------------------------
-- Visit generation (the app expands the RRULE; see ADR 0005).
-- reset_job_schedule() lives in the routing migration, because it must keep
-- visits that are already on a route.
------------------------------------------------------------------------------

-- Inserts visits for the given RRULE dates, clipped to the job's range and
-- to (generated_through, p_through]. Arrival windows are resolved in the
-- org's timezone. Idempotent: existing (job, occurrence_date) pairs are
-- skipped. Advances the watermark and returns the number of new visits.
-- security invoker, so the caller's RLS applies (office staff or service
-- role).
create function public.generate_visits(p_job_id uuid, p_dates date[], p_through date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  j public.jobs;
  tz text;
  n integer;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  if j.kind <> 'recurring' or j.status <> 'active' then
    return 0;
  end if;

  select timezone into tz from public.organizations where id = j.organization_id;

  insert into public.visits
    (organization_id, job_id, property_id, occurrence_date, scheduled_date, window_start, window_end, duration_minutes)
  select j.organization_id, j.id, j.property_id, d, d, lower(w), upper(w), j.visit_duration_minutes
  from unnest(p_dates) as d
  cross join lateral (select private.visit_window(d, j.window_start, j.window_minutes, tz) as w) win
  where d >= j.start_date
    and (j.end_date is null or d <= j.end_date)
    and (j.generated_through is null or d > j.generated_through)
    and d <= p_through
  on conflict (organization_id, job_id, occurrence_date) do nothing;
  get diagnostics n = row_count;

  update public.jobs
  set generated_through = greatest(coalesce(generated_through, p_through), p_through)
  where organization_id = j.organization_id and id = j.id;

  return n;
end;
$$;

revoke execute on function public.generate_visits(uuid, date[], date) from public, anon;
grant execute on function public.generate_visits(uuid, date[], date) to authenticated, service_role;
grant execute on function private.visit_window(date, time, integer, text) to authenticated, service_role;

------------------------------------------------------------------------------
-- attachments + storage
------------------------------------------------------------------------------

create table public.attachments (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  caption text,
  is_client_visible boolean not null default false,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  client_id uuid,
  property_id uuid,
  job_id uuid,
  visit_id uuid,
  quote_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (num_nonnulls(client_id, property_id, job_id, visit_id, quote_id) = 1),
  -- {organization_id}/{clients|properties|jobs|visits|quotes}/{parent id}/{file},
  -- naming the row's own parent. Storage policies key off this layout.
  constraint attachments_storage_path_check check (
    storage_path = organization_id::text
      || case
           when client_id is not null then '/clients/'
           when property_id is not null then '/properties/'
           when job_id is not null then '/jobs/'
           when visit_id is not null then '/visits/'
           else '/quotes/'
         end
      || coalesce(client_id, property_id, job_id, visit_id, quote_id)::text
      || '/' || split_part(storage_path, '/', 4)
    and split_part(storage_path, '/', 4) <> ''
  ),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  foreign key (organization_id, job_id) references public.jobs (organization_id, id) on delete cascade,
  foreign key (organization_id, visit_id) references public.visits (organization_id, id) on delete cascade,
  foreign key (organization_id, quote_id) references public.quotes (organization_id, id) on delete cascade
);

create index attachments_client_idx on public.attachments (organization_id, client_id);
create index attachments_property_idx on public.attachments (organization_id, property_id);
create index attachments_job_idx on public.attachments (organization_id, job_id);
create index attachments_visit_idx on public.attachments (organization_id, visit_id);
create index attachments_quote_idx on public.attachments (organization_id, quote_id);
create index attachments_uploaded_by_idx on public.attachments (uploaded_by);

create trigger set_updated_at
  before update on public.attachments
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, storage_path, mime_type, size_bytes, caption, is_client_visible,
              client_id, property_id, job_id, visit_id, quote_id)
  on public.attachments to authenticated;
grant update (caption, is_client_visible) on public.attachments to authenticated;

-- Private bucket. Object paths follow the attachments layout above.
insert into storage.buckets (id, name, public)
values ('org-files', 'org-files', false)
on conflict (id) do nothing;

-- Office staff update and delete anything in the org folder. Read and upload
-- are single office-or-worker policies, created with the worker API (workers
-- only get their visits' folders).
create policy "Office staff can update their org's files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'org-files'
    and (storage.foldername(name))[1] = any (array(select o::text from private.my_org_ids('{owner,admin,dispatcher}') o))
  );
create policy "Office staff can delete their org's files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'org-files'
    and (storage.foldername(name))[1] = any (array(select o::text from private.my_org_ids('{owner,admin,dispatcher}') o))
  );

------------------------------------------------------------------------------
-- Row level security (office staff)
------------------------------------------------------------------------------

alter table public.jobs enable row level security;
alter table public.job_line_items enable row level security;
alter table public.job_line_item_taxes enable row level security;
alter table public.visits enable row level security;
alter table public.attachments enable row level security;

create policy "Office staff can view jobs"
  on public.jobs for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add jobs"
  on public.jobs for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update jobs"
  on public.jobs for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete jobs"
  on public.jobs for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view job lines"
  on public.job_line_items for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add job lines"
  on public.job_line_items for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update job lines"
  on public.job_line_items for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete job lines"
  on public.job_line_items for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view job line taxes"
  on public.job_line_item_taxes for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add job line taxes"
  on public.job_line_item_taxes for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete job line taxes"
  on public.job_line_item_taxes for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view visits"
  on public.visits for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add visits"
  on public.visits for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update visits"
  on public.visits for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete visits"
  on public.visits for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create policy "Office staff can view attachments"
  on public.attachments for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can add attachments"
  on public.attachments for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update attachments"
  on public.attachments for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can delete attachments"
  on public.attachments for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

------------------------------------------------------------------------------
-- Portal RPCs
------------------------------------------------------------------------------

create function public.portal_my_jobs()
returns table (
  job_id uuid,
  client_id uuid,
  property_id uuid,
  number text,
  title text,
  kind public.job_kind,
  status public.job_status,
  start_date date,
  end_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id, j.client_id, j.property_id, j.number, j.title, j.kind, j.status, j.start_date, j.end_date
  from private.portal_clients() pc
  join public.jobs j on j.organization_id = pc.organization_id and j.client_id = pc.client_id
  order by j.start_date desc
$$;

create function public.portal_my_visits(p_from date default null, p_to date default null)
returns table (
  visit_id uuid,
  job_id uuid,
  job_title text,
  property_id uuid,
  status public.visit_status,
  scheduled_date date,
  window_start timestamptz,
  window_end timestamptz,
  completed_at timestamptz,
  completion_notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.job_id, j.title, v.property_id, v.status, v.scheduled_date,
         v.window_start, v.window_end, v.actual_end, v.completion_notes
  from private.portal_clients() pc
  join public.jobs j on j.organization_id = pc.organization_id and j.client_id = pc.client_id
  join public.visits v on v.organization_id = j.organization_id and v.job_id = j.id
  where v.status <> 'cancelled'
    and (p_from is null or v.scheduled_date >= p_from)
    and (p_to is null or v.scheduled_date <= p_to)
  order by v.scheduled_date, v.window_start
$$;

revoke execute on function public.portal_my_jobs(), public.portal_my_visits(date, date) from public, anon;
grant execute on function public.portal_my_jobs(), public.portal_my_visits(date, date) to authenticated;
