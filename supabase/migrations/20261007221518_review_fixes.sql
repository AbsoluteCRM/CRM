-- Fixes from the reviewer and security gates on the rebaseline PR.
--
-- 1. generate_visits / reset_job_schedule: security invoker needed column
--    grants the API deliberately withholds (visits.property_id,
--    occurrence_date, jobs.generated_through). They are now security definer
--    with an explicit office-role check (a null auth.uid() is trusted code).
-- 2. Several workers on a route can each time a visit (worker_join_visit).
-- 3. accept_invitation refuses an invitation that targets an owner row, which
--    otherwise let an admin demote an owner row and attach a login to it.
-- 4. Archived tax rates can't be attached to invoice lines either.
-- 5. create_invoice_for_visits rejects an empty visit list.
-- 6. A non-integer default_payment_terms_days setting no longer breaks issuing.

------------------------------------------------------------------------------
-- 1. Visit generation as definer with an office check
------------------------------------------------------------------------------

create or replace function public.generate_visits(p_job_id uuid, p_dates date[], p_through date)
returns integer
language plpgsql
security definer
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
  if (select auth.uid()) is not null
     and not private.has_org_role(j.organization_id, '{owner,admin,dispatcher}') then
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

create or replace function public.reset_job_schedule(p_job_id uuid, p_from date default null)
returns integer
language plpgsql
security definer
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
  if (select auth.uid()) is not null
     and not private.has_org_role(j.organization_id, '{owner,admin,dispatcher}') then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  select coalesce(p_from, (now() at time zone o.timezone)::date) into from_date
  from public.organizations o where o.id = j.organization_id;

  delete from public.visits v
  where v.organization_id = j.organization_id and v.job_id = j.id
    and v.occurrence_date is not null
    and not v.is_exception
    and v.status = 'scheduled'
    and v.scheduled_date >= from_date
    and not exists (
      select 1 from public.route_stops rs
      where rs.organization_id = v.organization_id and rs.visit_id = v.id
    );
  get diagnostics n = row_count;

  update public.jobs
  set generated_through = least(generated_through, from_date - 1)
  where organization_id = j.organization_id and id = j.id;

  return n;
end;
$$;

------------------------------------------------------------------------------
-- 2. Every rostered worker can time a visit
------------------------------------------------------------------------------

-- Opens the caller's own time entry on a visit someone has already started.
-- Idempotent: joining a visit you're already timing does nothing.
create function public.worker_join_visit(p_visit_id uuid)
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
  if st <> 'in_progress' then
    raise exception 'only a visit that has been started can be joined (this one is %)', st
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.visit_time_entries
    where organization_id = org and visit_id = p_visit_id and member_id = member and ended_at is null
  ) then
    return;
  end if;
  if exists (
    select 1 from public.visit_time_entries
    where organization_id = org and member_id = member and ended_at is null
  ) then
    raise exception 'finish your current visit first' using errcode = '55000';
  end if;

  insert into public.visit_time_entries (organization_id, visit_id, member_id, started_at, source)
  values (org, p_visit_id, member, clock_timestamp(), 'app');
end;
$$;

revoke execute on function public.worker_join_visit(uuid) from public, anon;
grant execute on function public.worker_join_visit(uuid) to authenticated;

------------------------------------------------------------------------------
-- 3. Invitations can't target an owner row
------------------------------------------------------------------------------

create or replace function public.accept_invitation(p_token text)
returns public.organization_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  user_email text;
  user_name text;
  inv public.organization_invitations;
  member public.organization_members;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select lower(u.email), coalesce(nullif(trim(p.full_name), ''), u.email)
  into user_email, user_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = uid;

  select * into inv
  from public.organization_invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and accepted_at is null
    and expires_at > now()
  for update;

  if not found or inv.email is distinct from user_email then
    raise exception 'invitation is invalid or has expired' using errcode = '22023';
  end if;

  -- An invitation never carries the owner role, so one that names an owner
  -- row would demote it. Owners are changed only by owners.
  if inv.member_id is not null and exists (
    select 1 from public.organization_members
    where organization_id = inv.organization_id and id = inv.member_id and role = 'owner'
  ) then
    raise exception 'an invitation can''t target an owner' using errcode = '42501';
  end if;

  if inv.member_id is not null then
    update public.organization_members
    set user_id = uid, status = 'active', role = inv.role
    where organization_id = inv.organization_id and id = inv.member_id and user_id is null
    returning * into member;
  else
    insert into public.organization_members (organization_id, user_id, role, display_name, email)
    values (inv.organization_id, uid, inv.role, user_name, user_email)
    on conflict (organization_id, user_id) do nothing
    returning * into member;
  end if;

  if member.id is null then
    raise exception 'you are already a member of this organization' using errcode = '23505';
  end if;

  update public.organization_invitations set accepted_at = now() where id = inv.id;

  return member;
end;
$$;

------------------------------------------------------------------------------
-- 4. Archived tax rates on invoice lines
------------------------------------------------------------------------------

create trigger guard_tax_rate_usable
  before insert on public.invoice_line_item_taxes
  for each row execute function private.guard_tax_rate_usable();

------------------------------------------------------------------------------
-- 5. create_invoice_for_visits rejects an empty list
------------------------------------------------------------------------------

create or replace function public.create_invoice_for_visits(
  p_client_id uuid,
  p_visit_ids uuid[],
  p_period_start date default null,
  p_period_end date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.clients;
  inv_id uuid;
  wanted integer := cardinality(array(select distinct unnest(p_visit_ids)));
  found_visits integer;
begin
  if coalesce(cardinality(p_visit_ids), 0) = 0 then
    raise exception 'choose at least one visit to bill' using errcode = '22023';
  end if;

  select * into c from public.clients where id = p_client_id;
  if not found then
    raise exception 'client not found' using errcode = 'P0002';
  end if;
  if (select auth.uid()) is not null and not private.has_org_role(c.organization_id, '{owner,admin}') then
    raise exception 'only owners and admins can create invoices' using errcode = '42501';
  end if;

  select count(*) into found_visits from public.visits
  where organization_id = c.organization_id and id = any (p_visit_ids);
  if found_visits <> wanted then
    raise exception 'some visits were not found' using errcode = 'P0002';
  end if;

  insert into public.invoices (organization_id, client_id, period_start, period_end)
  values (c.organization_id, c.id, p_period_start, p_period_end)
  returning id into inv_id;

  insert into public.invoice_visits (organization_id, invoice_id, visit_id)
  select c.organization_id, inv_id, v.id
  from public.visits v
  where v.organization_id = c.organization_id and v.id = any (p_visit_ids);

  -- One line per (visit, job line). position is unique within the invoice,
  -- so the tax insert below can find each line again by it.
  insert into public.invoice_line_items
    (organization_id, invoice_id, job_id, visit_id, service_id, position, description, quantity, unit_price_cents)
  select c.organization_id, inv_id, v.job_id, v.id, jl.service_id,
         row_number() over (order by v.scheduled_date, v.id, jl.position, jl.id),
         to_char(v.scheduled_date, 'Mon FMDD') || ' – ' || jl.description,
         jl.quantity, jl.unit_price_cents
  from public.visits v
  join public.job_line_items jl on jl.organization_id = v.organization_id and jl.job_id = v.job_id
  where v.organization_id = c.organization_id and v.id = any (p_visit_ids);

  if not c.tax_exempt then
    insert into public.invoice_line_item_taxes (organization_id, line_item_id, tax_rate_id)
    select c.organization_id, il.id, t.tax_rate_id
    from (
      select jl.id as job_line_id,
             row_number() over (order by v.scheduled_date, v.id, jl.position, jl.id) as pos
      from public.visits v
      join public.job_line_items jl on jl.organization_id = v.organization_id and jl.job_id = v.job_id
      where v.organization_id = c.organization_id and v.id = any (p_visit_ids)
    ) src
    join public.invoice_line_items il
      on il.organization_id = c.organization_id and il.invoice_id = inv_id and il.position = src.pos
    join public.job_line_item_taxes t
      on t.organization_id = c.organization_id and t.line_item_id = src.job_line_id;
  end if;

  return inv_id;
end;
$$;

------------------------------------------------------------------------------
-- 6. Safe payment-terms parsing
------------------------------------------------------------------------------

create or replace function private.invoice_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  terms_days integer;
begin
  if old.status = 'void' then
    if new.status <> 'void' then
      raise exception 'a void invoice cannot be reopened' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'an issued invoice cannot return to draft' using errcode = '23514';
  end if;

  if old.status <> 'draft'
     and (new.issue_date, new.period_start, new.period_end)
         is distinct from (old.issue_date, old.period_start, old.period_end) then
    raise exception 'an issued invoice''s date and period are fixed' using errcode = '55000';
  end if;

  if new.status = 'void' then
    if new.amount_paid_cents <> 0 then
      raise exception 'refund all payments before voiding this invoice' using errcode = '55000';
    end if;
    new.voided_at := coalesce(new.voided_at, now());
    return new;
  end if;

  if new.status <> 'draft' then
    if old.status = 'draft' then
      -- settings is admin-editable jsonb, so a bad value falls back to 30.
      select o.timezone,
             case when o.settings ->> 'default_payment_terms_days' ~ '^[0-9]{1,3}$'
                  then (o.settings ->> 'default_payment_terms_days')::integer
                  else 30 end
      into tz, terms_days
      from public.organizations o where o.id = new.organization_id;
      new.sent_at := coalesce(new.sent_at, now());
      new.issue_date := coalesce(new.issue_date, (now() at time zone tz)::date);
      new.due_date := coalesce(new.due_date, new.issue_date + terms_days);
    end if;

    new.status := case
      when new.amount_paid_cents >= new.subtotal_cents + new.tax_cents then 'paid'
      when new.amount_paid_cents > 0 then 'partially_paid'
      else 'sent'
    end::public.invoice_status;

    if new.status = 'paid' then
      new.paid_at := coalesce(new.paid_at, now());
    else
      new.paid_at := null;
    end if;
  end if;

  return new;
end;
$$;
