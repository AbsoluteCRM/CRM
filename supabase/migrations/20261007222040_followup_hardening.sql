-- Follow-ups from the reviewer and security gates (pre-existing gaps that the
-- rebaseline carried over from the original schema).
--
-- 1. A payment can no longer be changed or added while its invoice is void,
--    and payment guards lock the invoice, so a concurrent void can't slip
--    between the check and the commit.
-- 2. Billing a visit locks the visit, so a concurrent cancel or status change
--    can't leave a cancelled visit billed.
-- 3. Routing a stop locks the visit, so a concurrent reschedule can't leave a
--    stop on a route for the wrong date.
-- 4. optimization_runs.crew_ids and unassigned_visit_ids can only name crews
--    and visits from the run's own organization.
--
-- Locks are FOR NO KEY UPDATE, the same strength the totals recalculation
-- takes later in the transaction, so a guard never has to upgrade a lock and
-- two writers to one parent simply queue.

------------------------------------------------------------------------------
-- 1. Payments vs void invoices
------------------------------------------------------------------------------

create or replace function private.guard_payment_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.invoice_status;
begin
  select status into st from public.invoices
  where organization_id = new.organization_id and id = new.invoice_id
  for no key update;
  if st is null or st not in ('sent', 'partially_paid', 'paid') then
    raise exception 'payments can only be recorded on issued invoices' using errcode = '55000';
  end if;
  return new;
end;
$$;

-- before update: an amount, status, or refund can't change once the invoice
-- is void (it was settled to zero before voiding). Notes and reference can.
create function private.guard_payment_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.invoice_status;
begin
  if (new.amount_cents, new.status, new.refunded_cents)
       is distinct from (old.amount_cents, old.status, old.refunded_cents) then
    select status into st from public.invoices
    where organization_id = old.organization_id and id = old.invoice_id
    for no key update;
    if st = 'void' then
      raise exception 'this invoice is void; its payments can''t change' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_payment_update
  before update on public.payments
  for each row execute function private.guard_payment_update();

------------------------------------------------------------------------------
-- 2. Billing vs visit status changes
------------------------------------------------------------------------------

create or replace function private.guard_invoice_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Locking the visit row makes a concurrent status change wait for this
  -- transaction (and then see the new invoice_visits row in
  -- visit_before_update), instead of racing the check below.
  perform 1 from public.visits
  where organization_id = new.organization_id and id = new.visit_id
  for no key update;

  if not exists (
    select 1
    from public.visits v
    join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    join public.invoices i on i.organization_id = v.organization_id and i.id = new.invoice_id
    where v.organization_id = new.organization_id and v.id = new.visit_id
      and v.status = 'completed' and j.client_id = i.client_id
  ) then
    raise exception 'only a completed visit for the invoice''s client can be billed' using errcode = '23514';
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 3. Routing vs rescheduling
------------------------------------------------------------------------------

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

------------------------------------------------------------------------------
-- 4. Optimizer runs name only their own organization's crews and visits
------------------------------------------------------------------------------

create function private.validate_optimization_run_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select unnest(new.crew_ids)
    except
    select id from public.crews where organization_id = new.organization_id
  ) then
    raise exception 'crew_ids names a crew outside this organization' using errcode = '23503';
  end if;
  if exists (
    select unnest(new.unassigned_visit_ids)
    except
    select id from public.visits where organization_id = new.organization_id
  ) then
    raise exception 'unassigned_visit_ids names a visit outside this organization' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger validate_refs
  before insert or update of crew_ids, unassigned_visit_ids on public.optimization_runs
  for each row execute function private.validate_optimization_run_refs();
