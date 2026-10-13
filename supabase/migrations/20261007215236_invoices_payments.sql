-- Invoicing & payments. See docs/database/tables/billing.md and ADRs 0004
-- and 0008.
--
-- - The database owns the arithmetic: line amounts are generated, taxes are
--   snapshotted by trigger, and totals and amount_paid are maintained by
--   triggers. None of them are writable through the API.
-- - Invoice status after draft is derived from amount_paid vs total.
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
  -- sha256 hex of the pay-link token. The token itself is never stored.
  payment_link_token_hash text unique,
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

-- status is writable so admins can issue (draft → sent) and void. Every other
-- status is derived by the trigger below.
grant insert (organization_id, client_id, issue_date, due_date, period_start, period_end, message,
              terms, internal_notes)
  on public.invoices to authenticated;
grant update (status, issue_date, due_date, period_start, period_end, message, terms,
              internal_notes, void_reason)
  on public.invoices to authenticated;

-- before update:
-- - void is terminal, and voiding requires no money received
-- - an issued invoice never returns to draft, and its issue date and period
--   are fixed
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

create unique index invoice_visits_live_visit_idx
  on public.invoice_visits (organization_id, visit_id) where not is_void;
-- The FK index for visits (the partial one above skips voided rows).
create index invoice_visits_visit_idx on public.invoice_visits (organization_id, visit_id);

grant insert (organization_id, invoice_id, visit_id) on public.invoice_visits to authenticated;

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
  update public.invoice_visits set is_void = true
  where organization_id = new.organization_id and invoice_id = new.id;
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

grant insert (organization_id, invoice_id, job_id, visit_id, service_id, position, description,
              quantity, unit_price_cents)
  on public.invoice_line_items to authenticated;
grant update (service_id, position, description, quantity, unit_price_cents)
  on public.invoice_line_items to authenticated;

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

grant insert (organization_id, line_item_id, tax_rate_id) on public.invoice_line_item_taxes to authenticated;

------------------------------------------------------------------------------
-- Draft-only editing
------------------------------------------------------------------------------

-- Lines, taxes, and billed visits change only while the invoice is a draft.
-- The one exception is invoice_visits.is_void, which voiding flips.
-- Cascading deletes (the invoice is already gone) are allowed. The invoice
-- row is locked so a concurrent issue can't slip in between.
create function private.guard_invoice_child_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid := coalesce(new.organization_id, old.organization_id);
  inv_id uuid;
  st public.invoice_status;
begin
  if tg_table_name = 'invoice_line_item_taxes' then
    select l.invoice_id into inv_id from public.invoice_line_items l
    where l.organization_id = org and l.id = coalesce(new.line_item_id, old.line_item_id);
  else
    inv_id := coalesce(new.invoice_id, old.invoice_id);
  end if;

  select status into st from public.invoices
  where organization_id = org and id = inv_id
  for no key update;
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

-- before insert/update: snapshots the rate and computes the tax. New taxes
-- on a tax-exempt client's invoice are rejected.
create function private.compute_invoice_line_tax()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_amount bigint;
  exempt boolean;
begin
  select l.amount_cents, c.tax_exempt
  into line_amount, exempt
  from public.invoice_line_items l
  join public.invoices i on i.organization_id = l.organization_id and i.id = l.invoice_id
  join public.clients c on c.organization_id = i.organization_id and c.id = i.client_id
  where l.organization_id = new.organization_id and l.id = new.line_item_id;
  if not found then
    raise exception 'invoice line not found' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' and exempt then
    raise exception 'this client is tax exempt' using errcode = '23514';
  end if;

  select percentage into new.percentage from public.tax_rates
  where organization_id = new.organization_id and id = new.tax_rate_id;
  new.amount_cents := round(line_amount * new.percentage / 100);
  return new;
end;
$$;

create trigger compute_tax
  before insert or update on public.invoice_line_item_taxes
  for each row execute function private.compute_invoice_line_tax();

-- Recomputes one invoice's totals. Locks the invoice first, so the sums run
-- on a snapshot that includes every committed sibling change.
create function private.recalc_invoice_totals(p_org uuid, p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.invoices where organization_id = p_org and id = p_invoice_id for no key update;
  if not found then
    return;
  end if;

  update public.invoices i
  set
    subtotal_cents = coalesce((
      select sum(l.amount_cents) from public.invoice_line_items l
      where l.organization_id = p_org and l.invoice_id = p_invoice_id
    ), 0),
    tax_cents = coalesce((
      select sum(t.amount_cents)
      from public.invoice_line_items l
      join public.invoice_line_item_taxes t on t.organization_id = l.organization_id and t.line_item_id = l.id
      where l.organization_id = p_org and l.invoice_id = p_invoice_id
    ), 0)
  where i.organization_id = p_org and i.id = p_invoice_id;
end;
$$;

-- after each statement on invoice_line_items: lines whose amount changed get
-- their taxes recomputed, then every touched invoice is re-totalled once.
create function private.invoice_lines_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.recalc_invoice_totals(s.organization_id, s.invoice_id)
    from (select distinct organization_id, invoice_id from new_rows) s;
  elsif tg_op = 'DELETE' then
    perform private.recalc_invoice_totals(s.organization_id, s.invoice_id)
    from (select distinct organization_id, invoice_id from old_rows) s;
  else
    update public.invoice_line_item_taxes t
    set percentage = t.percentage
    from new_rows n
    join old_rows o on o.id = n.id
    where n.amount_cents is distinct from o.amount_cents
      and t.organization_id = n.organization_id and t.line_item_id = n.id;

    perform private.recalc_invoice_totals(s.organization_id, s.invoice_id)
    from (
      select organization_id, invoice_id from new_rows
      union
      select organization_id, invoice_id from old_rows
    ) s;
  end if;
  return null;
end;
$$;

create trigger recalc_totals_insert
  after insert on public.invoice_line_items
  referencing new table as new_rows
  for each statement execute function private.invoice_lines_changed();
create trigger recalc_totals_update
  after update on public.invoice_line_items
  referencing new table as new_rows old table as old_rows
  for each statement execute function private.invoice_lines_changed();
create trigger recalc_totals_delete
  after delete on public.invoice_line_items
  referencing old table as old_rows
  for each statement execute function private.invoice_lines_changed();

create function private.invoice_taxes_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.recalc_invoice_totals(s.organization_id, s.invoice_id)
    from (
      select distinct l.organization_id, l.invoice_id
      from old_rows t
      join public.invoice_line_items l on l.organization_id = t.organization_id and l.id = t.line_item_id
    ) s;
  else
    perform private.recalc_invoice_totals(s.organization_id, s.invoice_id)
    from (
      select distinct l.organization_id, l.invoice_id
      from new_rows t
      join public.invoice_line_items l on l.organization_id = t.organization_id and l.id = t.line_item_id
    ) s;
  end if;
  return null;
end;
$$;

create trigger recalc_totals_insert
  after insert on public.invoice_line_item_taxes
  referencing new table as new_rows
  for each statement execute function private.invoice_taxes_changed();
create trigger recalc_totals_update
  after update on public.invoice_line_item_taxes
  referencing new table as new_rows
  for each statement execute function private.invoice_taxes_changed();
create trigger recalc_totals_delete
  after delete on public.invoice_line_item_taxes
  referencing old table as old_rows
  for each statement execute function private.invoice_taxes_changed();

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

create index payments_invoice_idx on public.payments (organization_id, invoice_id);
create index payments_client_idx on public.payments (organization_id, client_id, received_at desc);
create index payments_received_idx on public.payments (organization_id, received_at desc);
create index payments_recorded_by_idx on public.payments (recorded_by);
-- Webhooks for refunds and disputes identify the charge.
create index payments_stripe_charge_idx on public.payments (stripe_charge_id) where stripe_charge_id is not null;

create trigger set_updated_at
  before update on public.payments
  for each row execute function extensions.moddatetime(updated_at);

-- Admins record manual payments (cash, cheque, e-transfer…). Stripe ids and
-- card payments come from the webhook (service role).
grant insert (organization_id, invoice_id, client_id, method, status, amount_cents, received_at,
              reference, notes)
  on public.payments to authenticated;
grant update (status, refunded_cents, received_at, reference, notes) on public.payments to authenticated;

-- before insert: payments can only be recorded against issued (non-draft,
-- non-void) invoices.
create function private.guard_payment_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select status from public.invoices where organization_id = new.organization_id and id = new.invoice_id)
     not in ('sent', 'partially_paid', 'paid') then
    raise exception 'payments can only be recorded on issued invoices' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger guard_invoice
  before insert on public.payments
  for each row execute function private.guard_payment_invoice();

-- before update: a Stripe-backed payment is the webhook's record; through the
-- API only its notes can change. (security invoker, so current_user tells
-- an API write from trusted code.)
create function private.guard_stripe_payment_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.stripe_payment_intent_id is not null
     and (to_jsonb(new) - '{notes,updated_at}'::text[]) is distinct from (to_jsonb(old) - '{notes,updated_at}'::text[]) then
    raise exception 'Stripe payments are updated by Stripe; refund them in Stripe' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_stripe_edit
  before update on public.payments
  for each row execute function private.guard_stripe_payment_edit();

-- Recomputes an invoice's amount_paid; the invoice trigger then re-derives
-- its status. Locks the invoice first, so two concurrent payments each see
-- the other once it commits (no lost update).
create function private.recalc_invoice_paid(p_org uuid, p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.invoices where organization_id = p_org and id = p_invoice_id for no key update;
  if not found then
    return;
  end if;

  update public.invoices
  set amount_paid_cents = coalesce((
    select sum(p.amount_cents - p.refunded_cents)
    from public.payments p
    where p.organization_id = p_org and p.invoice_id = p_invoice_id
      and p.status in ('succeeded', 'partially_refunded', 'refunded')
  ), 0)
  where organization_id = p_org and id = p_invoice_id;
end;
$$;

create function private.payments_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.recalc_invoice_paid(s.organization_id, s.invoice_id)
    from (select distinct organization_id, invoice_id from new_rows) s;
  elsif tg_op = 'DELETE' then
    perform private.recalc_invoice_paid(s.organization_id, s.invoice_id)
    from (select distinct organization_id, invoice_id from old_rows) s;
  else
    perform private.recalc_invoice_paid(s.organization_id, s.invoice_id)
    from (
      select organization_id, invoice_id from new_rows
      union
      select organization_id, invoice_id from old_rows
    ) s;
  end if;
  return null;
end;
$$;

create trigger recalc_paid_insert
  after insert on public.payments
  referencing new table as new_rows
  for each statement execute function private.payments_changed();
create trigger recalc_paid_update
  after update on public.payments
  referencing new table as new_rows old table as old_rows
  for each statement execute function private.payments_changed();
create trigger recalc_paid_delete
  after delete on public.payments
  referencing old table as old_rows
  for each statement execute function private.payments_changed();

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

revoke all on public.stripe_events from authenticated;

------------------------------------------------------------------------------
-- Invoice creation
------------------------------------------------------------------------------

-- Creates a draft invoice for a client billing the given completed visits.
-- Each visit's job lines become invoice lines ("Jun 3 – Weekly mowing"),
-- with the job lines' tax rates unless the client is tax exempt.
-- Owner/admin, or trusted server code (no auth.uid()).
create function public.create_invoice_for_visits(
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

revoke execute on function public.create_invoice_for_visits(uuid, uuid[], date, date) from public, anon;
grant execute on function public.create_invoice_for_visits(uuid, uuid[], date, date) to authenticated, service_role;

-- Nightly: drafts invoices for completed, unbilled visits.
-- - per_visit jobs: one invoice per visit.
-- - periodic monthly jobs: on the 1st (org-local), one invoice per client
--   covering unbilled visits through the end of last month.
-- Each invoice is created in its own subtransaction: a failure is logged as
-- a warning with its org and client, and the run carries on. Returns the
-- number of invoices created.
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
      join public.jobs j on j.organization_id = vi.organization_id and j.id = vi.job_id
      where vi.organization_id = o.id
        and vi.status = 'completed'
        and j.billing_mode = 'per_visit'
        and not exists (
          select 1 from public.invoice_visits iv
          where iv.organization_id = vi.organization_id and iv.visit_id = vi.id and not iv.is_void
        )
    loop
      begin
        perform public.create_invoice_for_visits(r.client_id, array[r.id]);
        n := n + 1;
      exception when others then
        raise warning 'invoice generation failed: org %, client %, visit %: % (%)',
          o.id, r.client_id, r.id, sqlerrm, sqlstate;
      end;
    end loop;

    if extract(day from today) = 1 then
      for r in
        select j.client_id, array_agg(vi.id order by vi.scheduled_date) as visit_ids
        from public.visits vi
        join public.jobs j on j.organization_id = vi.organization_id and j.id = vi.job_id
        where vi.organization_id = o.id
          and vi.status = 'completed'
          and j.billing_mode = 'periodic'
          and j.billing_period = 'monthly'
          and vi.scheduled_date < today
          and not exists (
            select 1 from public.invoice_visits iv
            where iv.organization_id = vi.organization_id and iv.visit_id = vi.id and not iv.is_void
          )
        group by j.client_id
      loop
        begin
          perform public.create_invoice_for_visits(
            r.client_id, r.visit_ids, (today - interval '1 month')::date, today - 1
          );
          n := n + 1;
        exception when others then
          raise warning 'invoice generation failed: org %, client % (monthly): % (%)',
            o.id, r.client_id, sqlerrm, sqlstate;
        end;
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
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Owners and admins can create invoices"
  on public.invoices for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can update invoices"
  on public.invoices for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can delete draft invoices"
  on public.invoices for delete to authenticated
  using (status = 'draft' and organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

create policy "Office staff can view billed visits"
  on public.invoice_visits for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Owners and admins can bill visits"
  on public.invoice_visits for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can unbill visits"
  on public.invoice_visits for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

create policy "Office staff can view invoice lines"
  on public.invoice_line_items for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Owners and admins can add invoice lines"
  on public.invoice_line_items for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can update invoice lines"
  on public.invoice_line_items for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can delete invoice lines"
  on public.invoice_line_items for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

create policy "Office staff can view invoice taxes"
  on public.invoice_line_item_taxes for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Owners and admins can add invoice taxes"
  on public.invoice_line_item_taxes for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can delete invoice taxes"
  on public.invoice_line_item_taxes for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

create policy "Office staff can view payments"
  on public.payments for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Owners and admins can record payments"
  on public.payments for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Owners and admins can update payments"
  on public.payments for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

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
  from private.portal_clients() pc
  join public.invoices i on i.organization_id = pc.organization_id and i.client_id = pc.client_id
  join public.organizations o on o.id = i.organization_id
  where i.status <> 'draft'
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
         coalesce((
           select sum(t.amount_cents) from public.invoice_line_item_taxes t
           where t.organization_id = l.organization_id and t.line_item_id = l.id
         ), 0)::bigint
  from private.portal_clients() pc
  join public.invoices i on i.organization_id = pc.organization_id and i.client_id = pc.client_id
  join public.invoice_line_items l on l.organization_id = i.organization_id and l.invoice_id = i.id
  where i.id = p_invoice_id
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
  from private.portal_clients() pc
  join public.payments p on p.organization_id = pc.organization_id and p.client_id = pc.client_id
  order by p.received_at desc
$$;

revoke execute on function
  public.portal_my_invoices(),
  public.portal_invoice_lines(uuid),
  public.portal_my_payments()
from public, anon;
grant execute on function
  public.portal_my_invoices(),
  public.portal_invoice_lines(uuid),
  public.portal_my_payments()
to authenticated;
