-- Invoicing & payments.
-- See docs/database/tables/billing.md and ADRs 0004 and 0008.
--
-- - The database owns the arithmetic: line amounts are generated, taxes are
--   snapshotted by trigger, and totals and amount_paid are trigger-maintained.
-- - Invoice status after draft is derived from amount_paid vs total. Nobody
--   sets 'paid' by hand.
-- - invoice_visits gives "a visit is billed on at most one live invoice" a
--   real unique index.
--
-- RLS: owner/admin manage billing, dispatchers can read it, workers get
-- nothing. Portal users read through portal_* RPCs. stripe_events is
-- service role only.

create type public.invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'void');
create type public.payment_method as enum ('cash', 'cheque', 'etransfer', 'card', 'ach', 'other');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');

------------------------------------------------------------------------------
-- invoices
------------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  client_id uuid not null,
  status public.invoice_status not null default 'draft',
  issue_date date,
  due_date date,
  period_start date,
  period_end date,
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint generated always as (subtotal_cents + tax_cents) stored,
  amount_paid_cents bigint not null default 0,
  balance_cents bigint generated always as (subtotal_cents + tax_cents - amount_paid_cents) stored,
  message text,
  terms text,
  internal_notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  stripe_invoice_id text unique,
  payment_link_token text unique,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  -- FK target for payments, proving the payment's client matches the invoice's.
  unique (organization_id, client_id, id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  check (due_date is null or issue_date is null or due_date >= issue_date),
  check ((period_start is null) = (period_end is null)),
  check (period_end is null or period_end >= period_start)
);

create index invoices_org_status_due_idx on public.invoices (organization_id, status, due_date);
create index invoices_client_idx on public.invoices (organization_id, client_id, issue_date desc);
create index invoices_created_by_idx on public.invoices (created_by);

create trigger assign_number
  before insert on public.invoices
  for each row execute function private.assign_document_number('invoice');

create trigger set_updated_at
  before update on public.invoices
  for each row execute function extensions.moddatetime(updated_at);

-- before update:
-- - void is terminal, and voiding requires no money received
-- - an issued invoice never returns to draft
-- - issuing stamps sent_at, issue_date, and due_date (org-local, with terms)
-- - after draft, status is derived from amount_paid vs total
create function private.invoice_before_update()
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

  if new.status = 'void' then
    if new.amount_paid_cents <> 0 then
      raise exception 'refund all payments before voiding this invoice' using errcode = '55000';
    end if;
    new.voided_at := coalesce(new.voided_at, now());
    return new;
  end if;

  if new.status <> 'draft' then
    if old.status = 'draft' then
      select o.timezone, coalesce((o.settings ->> 'default_payment_terms_days')::integer, 30)
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

create trigger before_update
  before update on public.invoices
  for each row execute function private.invoice_before_update();

------------------------------------------------------------------------------
-- invoice_visits (bill each visit at most once)
------------------------------------------------------------------------------

create table public.invoice_visits (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  visit_id uuid not null,
  is_void boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, invoice_id, visit_id),
  foreign key (organization_id, invoice_id)
    references public.invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, visit_id)
    references public.visits (organization_id, id) on delete restrict
);

create unique index invoice_visits_live_visit_idx on public.invoice_visits (visit_id) where not is_void;
create index invoice_visits_visit_idx on public.invoice_visits (organization_id, visit_id);

-- A billed visit must be completed and belong to the invoice's client.
create function private.guard_invoice_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.visits v
    join public.jobs j on j.id = v.job_id
    join public.invoices i on i.id = new.invoice_id
    where v.id = new.visit_id and v.status = 'completed' and j.client_id = i.client_id
  ) then
    raise exception 'only a completed visit for the invoice''s client can be billed' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_visit
  before insert on public.invoice_visits
  for each row execute function private.guard_invoice_visit();

-- after update of status on invoices: voiding frees the invoice's visits for
-- re-billing.
create function private.invoice_voided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invoice_visits set is_void = true where invoice_id = new.id;
  return null;
end;
$$;

create trigger voided
  after update of status on public.invoices
  for each row when (new.status = 'void' and old.status <> 'void')
  execute function private.invoice_voided();

------------------------------------------------------------------------------
-- invoice_line_items and invoice_line_item_taxes
------------------------------------------------------------------------------

create table public.invoice_line_items (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  job_id uuid,
  visit_id uuid,
  service_id uuid,
  position integer not null,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(10, 2) not null default 1 check (quantity <> 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  amount_cents bigint generated always as (round(quantity * unit_price_cents)::bigint) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, invoice_id)
    references public.invoices (organization_id, id) on delete cascade,
  -- A visit line must be backed by the invoice's invoice_visits row.
  foreign key (organization_id, invoice_id, visit_id)
    references public.invoice_visits (organization_id, invoice_id, visit_id) on delete cascade,
  foreign key (organization_id, job_id)
    references public.jobs (organization_id, id) on delete set null (job_id),
  foreign key (organization_id, service_id)
    references public.services (organization_id, id) on delete set null (service_id)
);

comment on column public.invoice_line_items.quantity is
  'Non-zero. A negative quantity makes a discount or credit line.';

create index invoice_line_items_invoice_idx on public.invoice_line_items (organization_id, invoice_id, position);
create index invoice_line_items_invoice_visit_idx on public.invoice_line_items (organization_id, invoice_id, visit_id);
create index invoice_line_items_job_idx on public.invoice_line_items (organization_id, job_id);
create index invoice_line_items_service_idx on public.invoice_line_items (organization_id, service_id);

create trigger set_updated_at
  before update on public.invoice_line_items
  for each row execute function extensions.moddatetime(updated_at);

create table public.invoice_line_item_taxes (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  line_item_id uuid not null,
  tax_rate_id uuid not null,
  percentage numeric(7, 4) not null,
  amount_cents bigint not null,
  primary key (organization_id, line_item_id, tax_rate_id),
  foreign key (organization_id, line_item_id)
    references public.invoice_line_items (organization_id, id) on delete cascade,
  foreign key (organization_id, tax_rate_id)
    references public.tax_rates (organization_id, id) on delete restrict
);

create index invoice_line_item_taxes_tax_rate_idx
  on public.invoice_line_item_taxes (organization_id, tax_rate_id);

------------------------------------------------------------------------------
-- Draft-only editing
------------------------------------------------------------------------------

-- Lines, taxes, and billed visits change only while the invoice is a draft.
-- The one exception is invoice_visits.is_void, which voiding flips.
-- Cascading deletes (the invoice is already gone) are allowed.
create function private.guard_invoice_child_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv_id uuid;
  st public.invoice_status;
begin
  if tg_table_name = 'invoice_line_item_taxes' then
    select l.invoice_id into inv_id from public.invoice_line_items l
    where l.id = coalesce(new.line_item_id, old.line_item_id);
  else
    inv_id := coalesce(new.invoice_id, old.invoice_id);
  end if;

  select status into st from public.invoices where id = inv_id;
  if not found or st = 'draft' then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'invoice_visits' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'is_void') = (to_jsonb(old) - 'is_void') then
    return new;
  end if;

  raise exception 'this invoice has been issued; void it and create a new one instead'
    using errcode = '55000';
end;
$$;

create trigger guard_edit
  before insert or update or delete on public.invoice_line_items
  for each row execute function private.guard_invoice_child_edit();
create trigger guard_edit
  before insert or update or delete on public.invoice_line_item_taxes
  for each row execute function private.guard_invoice_child_edit();
create trigger guard_edit
  before insert or update or delete on public.invoice_visits
  for each row execute function private.guard_invoice_child_edit();

------------------------------------------------------------------------------
-- Tax snapshots and totals
------------------------------------------------------------------------------

create function private.compute_invoice_line_tax()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_amount bigint;
  exempt boolean;
  pct numeric(7, 4);
begin
  select l.amount_cents, c.tax_exempt
  into line_amount, exempt
  from public.invoice_line_items l
  join public.invoices i on i.id = l.invoice_id
  join public.clients c on c.id = i.client_id
  where l.id = new.line_item_id;

  if exempt then
    raise exception 'this client is tax exempt' using errcode = '23514';
  end if;

  select percentage into pct from public.tax_rates where id = new.tax_rate_id;
  new.percentage := pct;
  new.amount_cents := round(line_amount * pct / 100);
  return new;
end;
$$;

create trigger compute_tax
  before insert or update on public.invoice_line_item_taxes
  for each row execute function private.compute_invoice_line_tax();

create function private.refresh_invoice_line_taxes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invoice_line_item_taxes set percentage = percentage where line_item_id = new.id;
  return null;
end;
$$;

create trigger refresh_taxes
  after update of quantity, unit_price_cents on public.invoice_line_items
  for each row execute function private.refresh_invoice_line_taxes();

create function private.recalc_invoice_totals(p_invoice_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invoices i
  set
    subtotal_cents = coalesce((
      select sum(l.amount_cents) from public.invoice_line_items l where l.invoice_id = p_invoice_id
    ), 0),
    tax_cents = coalesce((
      select sum(t.amount_cents)
      from public.invoice_line_item_taxes t
      join public.invoice_line_items l on l.id = t.line_item_id
      where l.invoice_id = p_invoice_id
    ), 0)
  where i.id = p_invoice_id
$$;

create function private.invoice_lines_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalc_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

create trigger recalc_totals
  after insert or update or delete on public.invoice_line_items
  for each row execute function private.invoice_lines_changed();

create function private.invoice_taxes_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv_id uuid;
begin
  select invoice_id into inv_id from public.invoice_line_items
  where id = coalesce(new.line_item_id, old.line_item_id);
  if inv_id is not null then
    perform private.recalc_invoice_totals(inv_id);
  end if;
  return null;
end;
$$;

create trigger recalc_totals
  after insert or update or delete on public.invoice_line_item_taxes
  for each row execute function private.invoice_taxes_changed();

-- Tax rates used on any quote or invoice can't change percentage.
create or replace function private.guard_tax_rate_percentage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.percentage is distinct from old.percentage and (
       exists (select 1 from public.quote_line_item_taxes where tax_rate_id = old.id)
    or exists (select 1 from public.invoice_line_item_taxes where tax_rate_id = old.id)
  ) then
    raise exception 'this tax rate is used by documents; add a new rate instead of editing it'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- payments
------------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null,
  client_id uuid not null,
  method public.payment_method not null,
  status public.payment_status not null default 'succeeded',
  amount_cents bigint not null check (amount_cents > 0),
  refunded_cents bigint not null default 0,
  received_at timestamptz not null default now(),
  reference text,
  notes text,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, client_id, invoice_id)
    references public.invoices (organization_id, client_id, id) on delete restrict,
  check (refunded_cents between 0 and amount_cents),
  check (status <> 'refunded' or refunded_cents = amount_cents),
  check (status <> 'partially_refunded' or refunded_cents between 1 and amount_cents - 1)
);

create index payments_invoice_idx on public.payments (organization_id, client_id, invoice_id);
create index payments_received_idx on public.payments (organization_id, received_at desc);
create index payments_recorded_by_idx on public.payments (recorded_by);

create trigger set_updated_at
  before update on public.payments
  for each row execute function extensions.moddatetime(updated_at);

-- Payments can only be recorded against issued (non-draft, non-void)
-- invoices.
create function private.guard_payment_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select status from public.invoices where id = new.invoice_id) not in ('sent', 'partially_paid', 'paid') then
    raise exception 'payments can only be recorded on issued invoices' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger guard_invoice
  before insert on public.payments
  for each row execute function private.guard_payment_invoice();

-- after any payment change: recompute the invoice's amount_paid. The invoice
-- trigger then re-derives its status.
create function private.payments_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv_id uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices
  set amount_paid_cents = coalesce((
    select sum(p.amount_cents - p.refunded_cents)
    from public.payments p
    where p.invoice_id = inv_id and p.status in ('succeeded', 'partially_refunded', 'refunded')
  ), 0)
  where id = inv_id;
  return null;
end;
$$;

create trigger recalc_paid
  after insert or update or delete on public.payments
  for each row execute function private.payments_changed();

------------------------------------------------------------------------------
-- stripe_events (webhook idempotency; service role only)
------------------------------------------------------------------------------

create table public.stripe_events (
  id text primary key check (id like 'evt\_%'),
  account_id text,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create index stripe_events_unprocessed_idx on public.stripe_events (received_at) where processed_at is null;

------------------------------------------------------------------------------
-- Invoice creation
------------------------------------------------------------------------------

-- Creates a draft invoice for a client billing the given completed visits.
-- Each visit's job_line_items become invoice lines ("Jun 3 – Weekly
-- mowing"), with the job line's tax rates unless the client is tax exempt.
-- security invoker: owner/admin, or the service role.
create function public.create_invoice_for_visits(
  p_client_id uuid,
  p_visit_ids uuid[],
  p_period_start date default null,
  p_period_end date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.clients;
  inv_id uuid;
  v record;
  jl record;
  pos integer := 0;
  line_id uuid;
begin
  select * into c from public.clients where id = p_client_id;
  if not found then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  insert into public.invoices (organization_id, client_id, period_start, period_end)
  values (c.organization_id, c.id, p_period_start, p_period_end)
  returning id into inv_id;

  for v in
    select vi.id, vi.job_id, vi.scheduled_date
    from public.visits vi
    where vi.id = any (p_visit_ids)
    order by vi.scheduled_date, vi.id
  loop
    insert into public.invoice_visits (organization_id, invoice_id, visit_id)
    values (c.organization_id, inv_id, v.id);

    for jl in
      select * from public.job_line_items where job_id = v.job_id order by position
    loop
      pos := pos + 1;
      insert into public.invoice_line_items
        (organization_id, invoice_id, job_id, visit_id, service_id, position, description, quantity, unit_price_cents)
      values
        (c.organization_id, inv_id, v.job_id, v.id, jl.service_id, pos,
         to_char(v.scheduled_date, 'Mon FMDD') || ' – ' || jl.description,
         jl.quantity, jl.unit_price_cents)
      returning id into line_id;

      if not c.tax_exempt then
        insert into public.invoice_line_item_taxes (organization_id, line_item_id, tax_rate_id)
        select c.organization_id, line_id, t from unnest(jl.tax_rate_ids) as t;
      end if;
    end loop;
  end loop;

  return inv_id;
end;
$$;

revoke execute on function public.create_invoice_for_visits(uuid, uuid[], date, date) from public, anon;
grant execute on function public.create_invoice_for_visits(uuid, uuid[], date, date) to authenticated, service_role;

-- Nightly: drafts invoices for completed, unbilled visits.
-- - per_visit jobs: one invoice per visit.
-- - periodic monthly jobs: on the 1st (org-local), one invoice per client
--   covering unbilled visits through the end of last month.
create function private.run_invoice_generation()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  r record;
  today date;
  n integer := 0;
begin
  for o in select id, timezone from public.organizations loop
    today := (now() at time zone o.timezone)::date;

    for r in
      select vi.id, j.client_id
      from public.visits vi
      join public.jobs j on j.id = vi.job_id
      where vi.organization_id = o.id
        and j.billing_mode = 'per_visit'
        and vi.status = 'completed'
        and not exists (select 1 from public.invoice_visits iv where iv.visit_id = vi.id and not iv.is_void)
    loop
      perform public.create_invoice_for_visits(r.client_id, array[r.id]);
      n := n + 1;
    end loop;

    if extract(day from today) = 1 then
      for r in
        select j.client_id, array_agg(vi.id order by vi.scheduled_date) as visit_ids
        from public.visits vi
        join public.jobs j on j.id = vi.job_id
        where vi.organization_id = o.id
          and j.billing_mode = 'periodic'
          and j.billing_period = 'monthly'
          and vi.status = 'completed'
          and vi.scheduled_date < today
          and not exists (select 1 from public.invoice_visits iv where iv.visit_id = vi.id and not iv.is_void)
        group by j.client_id
      loop
        perform public.create_invoice_for_visits(
          r.client_id, r.visit_ids, (today - interval '1 month')::date, today - 1
        );
        n := n + 1;
      end loop;
    end if;
  end loop;

  return n;
end;
$$;

select cron.schedule('generate-invoices', '45 7 * * *', $cron$ select private.run_invoice_generation() $cron$);

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.invoice_visits enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_line_item_taxes enable row level security;
alter table public.payments enable row level security;
alter table public.stripe_events enable row level security;
-- stripe_events: no policies (service role only).

create policy "Office staff can view invoices"
  on public.invoices for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Owners and admins can create invoices"
  on public.invoices for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can update invoices"
  on public.invoices for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can delete draft invoices"
  on public.invoices for delete to authenticated
  using (status = 'draft' and organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Office staff can view billed visits"
  on public.invoice_visits for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Owners and admins can bill visits"
  on public.invoice_visits for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can unbill visits"
  on public.invoice_visits for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Office staff can view invoice lines"
  on public.invoice_line_items for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Owners and admins can add invoice lines"
  on public.invoice_line_items for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can update invoice lines"
  on public.invoice_line_items for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can delete invoice lines"
  on public.invoice_line_items for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Office staff can view invoice taxes"
  on public.invoice_line_item_taxes for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Owners and admins can add invoice taxes"
  on public.invoice_line_item_taxes for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can delete invoice taxes"
  on public.invoice_line_item_taxes for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')));

create policy "Office staff can view payments"
  on public.payments for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Owners and admins can record payments"
  on public.payments for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));
create policy "Owners and admins can update payments"
  on public.payments for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin}')));

------------------------------------------------------------------------------
-- Portal RPCs
------------------------------------------------------------------------------

create function public.portal_my_invoices()
returns table (
  invoice_id uuid,
  client_id uuid,
  number text,
  status public.invoice_status,
  is_overdue boolean,
  issue_date date,
  due_date date,
  period_start date,
  period_end date,
  subtotal_cents bigint,
  tax_cents bigint,
  total_cents bigint,
  amount_paid_cents bigint,
  balance_cents bigint,
  message text,
  terms text,
  sent_at timestamptz,
  paid_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.client_id, i.number, i.status,
         i.status in ('sent', 'partially_paid')
           and i.due_date < (now() at time zone o.timezone)::date,
         i.issue_date, i.due_date, i.period_start, i.period_end,
         i.subtotal_cents, i.tax_cents, i.total_cents, i.amount_paid_cents, i.balance_cents,
         i.message, i.terms, i.sent_at, i.paid_at
  from public.invoices i
  join public.organizations o on o.id = i.organization_id
  where i.client_id in (select private.portal_client_ids())
    and i.status <> 'draft'
  order by i.issue_date desc nulls last, i.number desc
$$;

create function public.portal_invoice_lines(p_invoice_id uuid)
returns table (
  line_item_id uuid,
  "position" integer,
  description text,
  quantity numeric,
  unit_price_cents bigint,
  amount_cents bigint,
  tax_cents bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.position, l.description, l.quantity, l.unit_price_cents, l.amount_cents,
         coalesce((select sum(t.amount_cents) from public.invoice_line_item_taxes t where t.line_item_id = l.id), 0)::bigint
  from public.invoice_line_items l
  join public.invoices i on i.id = l.invoice_id
  where i.id = p_invoice_id
    and i.client_id in (select private.portal_client_ids())
    and i.status <> 'draft'
  order by l.position
$$;

create function public.portal_my_payments()
returns table (
  payment_id uuid,
  invoice_id uuid,
  method public.payment_method,
  status public.payment_status,
  amount_cents bigint,
  refunded_cents bigint,
  received_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.invoice_id, p.method, p.status, p.amount_cents, p.refunded_cents, p.received_at
  from public.payments p
  where p.client_id in (select private.portal_client_ids())
  order by p.received_at desc
$$;

revoke execute on function public.portal_my_invoices() from public, anon;
revoke execute on function public.portal_invoice_lines(uuid) from public, anon;
revoke execute on function public.portal_my_payments() from public, anon;
grant execute on function public.portal_my_invoices() to authenticated;
grant execute on function public.portal_invoice_lines(uuid) to authenticated;
grant execute on function public.portal_my_payments() to authenticated;
