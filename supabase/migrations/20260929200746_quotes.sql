-- Quotes: priced proposals, their lines, and per-line tax snapshots.
-- See docs/database/tables/quotes.md.
--
-- The database owns the arithmetic. Line amounts are generated columns, tax
-- rows snapshot the rate and compute their amount, and quote totals are
-- recalculated by triggers. The app never writes totals.
--
-- RLS: office staff only. Portal users read through portal_* RPCs and
-- approve or decline through RPCs.

create type public.quote_status as enum ('draft', 'sent', 'approved', 'declined', 'expired', 'converted');

------------------------------------------------------------------------------
-- Shared: "property belongs to client" as a foreign key target, and
-- document numbering
------------------------------------------------------------------------------

-- Lets quotes (and later jobs) use one composite FK to prove that
-- property_id belongs to client_id. It replaces the (organization_id,
-- client_id) index, which is a prefix of it.
alter table public.properties
  add constraint properties_org_client_id_key unique (organization_id, client_id, id);
drop index public.properties_client_idx;

-- before insert: fills `number` from document_sequences. TG_ARGV[0] is the
-- document_kind.
create function private.assign_document_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.number is null then
    new.number := private.next_document_number(new.organization_id, tg_argv[0]::public.document_kind);
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- quotes
------------------------------------------------------------------------------

create table public.quotes (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number text not null,
  client_id uuid not null,
  property_id uuid,
  status public.quote_status not null default 'draft',
  title text not null check (length(trim(title)) > 0),
  message text,
  internal_notes text,
  valid_until date,
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint generated always as (subtotal_cents + tax_cents) stored,
  sent_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  declined_reason text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete restrict,
  foreign key (organization_id, client_id, property_id)
    references public.properties (organization_id, client_id, id) on delete restrict
);

create index quotes_org_status_idx on public.quotes (organization_id, status, created_at desc);
create index quotes_client_property_idx on public.quotes (organization_id, client_id, property_id);
create index quotes_approved_by_idx on public.quotes (approved_by_user_id);
create index quotes_created_by_idx on public.quotes (created_by);

create trigger assign_number
  before insert on public.quotes
  for each row execute function private.assign_document_number('quote');

create trigger set_updated_at
  before update on public.quotes
  for each row execute function extensions.moddatetime(updated_at);

-- Allowed: draft→sent, sent→draft|approved|declined|expired,
-- approved→converted. Also stamps sent_at and approved_at.
create function private.quote_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status = 'sent')
      or (old.status = 'sent' and new.status in ('draft', 'approved', 'declined', 'expired'))
      or (old.status = 'approved' and new.status = 'converted')
    ) then
      raise exception 'a quote cannot move from % to %', old.status, new.status
        using errcode = '23514';
    end if;

    if new.status = 'draft' then
      new.sent_at := null;
    elsif new.status = 'sent' then
      new.sent_at := coalesce(new.sent_at, now());
    elsif new.status = 'approved' then
      new.approved_at := coalesce(new.approved_at, now());
      new.approved_by_user_id := coalesce(new.approved_by_user_id, (select auth.uid()));
    end if;
  end if;
  return new;
end;
$$;

create trigger status_transition
  before update of status on public.quotes
  for each row execute function private.quote_status_transition();

------------------------------------------------------------------------------
-- quote_line_items
------------------------------------------------------------------------------

create table public.quote_line_items (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null,
  service_id uuid,
  position integer not null,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  amount_cents bigint generated always as (round(quantity * unit_price_cents)::bigint) stored,
  is_optional boolean not null default false,
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete cascade,
  foreign key (organization_id, service_id)
    references public.services (organization_id, id) on delete set null (service_id)
);

comment on column public.quote_line_items.is_selected is
  'Optional lines count toward totals only when selected (set by the client on approval).';

create index quote_line_items_quote_idx on public.quote_line_items (organization_id, quote_id, position);
create index quote_line_items_service_idx on public.quote_line_items (organization_id, service_id);

create trigger set_updated_at
  before update on public.quote_line_items
  for each row execute function extensions.moddatetime(updated_at);

------------------------------------------------------------------------------
-- quote_line_item_taxes
------------------------------------------------------------------------------

create table public.quote_line_item_taxes (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  line_item_id uuid not null,
  tax_rate_id uuid not null,
  percentage numeric(7, 4) not null,
  amount_cents bigint not null,
  primary key (organization_id, line_item_id, tax_rate_id),
  foreign key (organization_id, line_item_id)
    references public.quote_line_items (organization_id, id) on delete cascade,
  foreign key (organization_id, tax_rate_id)
    references public.tax_rates (organization_id, id) on delete restrict
);

create index quote_line_item_taxes_tax_rate_idx
  on public.quote_line_item_taxes (organization_id, tax_rate_id);

------------------------------------------------------------------------------
-- Line and tax behaviour
------------------------------------------------------------------------------

-- Lines are editable only while the quote is a draft. The one exception is
-- approval, which flips is_selected on a sent quote.
create function private.guard_quote_line_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.quote_status;
begin
  select status into st from public.quotes where id = coalesce(new.quote_id, old.quote_id);
  if not found or st = 'draft' then
    return coalesce(new, old);  -- quote deleted (cascade), or still a draft
  end if;
  -- (Generated columns such as amount_cents aren't computed yet in a BEFORE
  -- trigger, so they're excluded from the comparison too.)
  if tg_op = 'UPDATE' and st = 'sent'
     and (to_jsonb(new) - '{is_selected,updated_at,amount_cents}'::text[])
       = (to_jsonb(old) - '{is_selected,updated_at,amount_cents}'::text[]) then
    return new;
  end if;
  raise exception 'quote lines can only be changed while the quote is a draft'
    using errcode = '55000';
end;
$$;

create trigger guard_edit
  before insert or update or delete on public.quote_line_items
  for each row execute function private.guard_quote_line_edit();

create function private.guard_quote_tax_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  st public.quote_status;
begin
  select q.status into st
  from public.quote_line_items l
  join public.quotes q on q.id = l.quote_id
  where l.id = coalesce(new.line_item_id, old.line_item_id);
  if not found or st = 'draft' then
    return coalesce(new, old);
  end if;
  raise exception 'quote taxes can only be changed while the quote is a draft'
    using errcode = '55000';
end;
$$;

create trigger guard_edit
  before insert or update or delete on public.quote_line_item_taxes
  for each row execute function private.guard_quote_tax_edit();

-- Snapshots the rate and computes the tax for its line. The app inserts only
-- (organization_id, line_item_id, tax_rate_id). Tax-exempt clients are rejected.
create function private.compute_quote_line_tax()
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
  from public.quote_line_items l
  join public.quotes q on q.id = l.quote_id
  join public.clients c on c.id = q.client_id
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
  before insert or update on public.quote_line_item_taxes
  for each row execute function private.compute_quote_line_tax();

-- When a line's amount changes, recompute its tax rows. The no-op update
-- re-fires compute_tax.
create function private.refresh_quote_line_taxes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quote_line_item_taxes set percentage = percentage where line_item_id = new.id;
  return null;
end;
$$;

create trigger refresh_taxes
  after update of quantity, unit_price_cents on public.quote_line_items
  for each row execute function private.refresh_quote_line_taxes();

create function private.recalc_quote_totals(p_quote_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.quotes q
  set
    subtotal_cents = coalesce((
      select sum(l.amount_cents) from public.quote_line_items l
      where l.quote_id = p_quote_id and (not l.is_optional or l.is_selected)
    ), 0),
    tax_cents = coalesce((
      select sum(t.amount_cents)
      from public.quote_line_item_taxes t
      join public.quote_line_items l on l.id = t.line_item_id
      where l.quote_id = p_quote_id and (not l.is_optional or l.is_selected)
    ), 0)
  where q.id = p_quote_id
$$;

create function private.quote_lines_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalc_quote_totals(coalesce(new.quote_id, old.quote_id));
  return null;
end;
$$;

create trigger recalc_totals
  after insert or update or delete on public.quote_line_items
  for each row execute function private.quote_lines_changed();

create function private.quote_taxes_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  qid uuid;
begin
  select quote_id into qid from public.quote_line_items
  where id = coalesce(new.line_item_id, old.line_item_id);
  if qid is not null then
    perform private.recalc_quote_totals(qid);
  end if;
  return null;
end;
$$;

create trigger recalc_totals
  after insert or update or delete on public.quote_line_item_taxes
  for each row execute function private.quote_taxes_changed();

-- A tax rate's percentage is frozen once any document uses it. The
-- invoices migration extends this check to invoice taxes.
create function private.guard_tax_rate_percentage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.percentage is distinct from old.percentage
     and exists (select 1 from public.quote_line_item_taxes where tax_rate_id = old.id) then
    raise exception 'this tax rate is used by documents; add a new rate instead of editing it'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger guard_percentage
  before update of percentage on public.tax_rates
  for each row execute function private.guard_tax_rate_percentage();

------------------------------------------------------------------------------
-- Row level security (office staff only)
------------------------------------------------------------------------------

alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.quote_line_item_taxes enable row level security;

create policy "Office staff can view quotes"
  on public.quotes for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can add quotes"
  on public.quotes for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update quotes"
  on public.quotes for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can delete draft quotes"
  on public.quotes for delete to authenticated
  using (
    status = 'draft'
    and organization_id in (select private.my_org_ids('{owner,admin,dispatcher}'))
  );

create policy "Office staff can view quote lines"
  on public.quote_line_items for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can add quote lines"
  on public.quote_line_items for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can update quote lines"
  on public.quote_line_items for update to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')))
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can delete quote lines"
  on public.quote_line_items for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

create policy "Office staff can view quote taxes"
  on public.quote_line_item_taxes for select to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can add quote taxes"
  on public.quote_line_item_taxes for insert to authenticated
  with check (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));
create policy "Office staff can delete quote taxes"
  on public.quote_line_item_taxes for delete to authenticated
  using (organization_id in (select private.my_org_ids('{owner,admin,dispatcher}')));

------------------------------------------------------------------------------
-- Portal RPCs
------------------------------------------------------------------------------

create function public.portal_my_quotes()
returns table (
  quote_id uuid,
  client_id uuid,
  property_id uuid,
  number text,
  status public.quote_status,
  title text,
  message text,
  valid_until date,
  subtotal_cents bigint,
  tax_cents bigint,
  total_cents bigint,
  sent_at timestamptz,
  approved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.client_id, q.property_id, q.number, q.status, q.title, q.message,
         q.valid_until, q.subtotal_cents, q.tax_cents, q.total_cents, q.sent_at, q.approved_at
  from public.quotes q
  where q.client_id in (select private.portal_client_ids())
    and q.status <> 'draft'
  order by q.sent_at desc nulls last
$$;

create function public.portal_quote_lines(p_quote_id uuid)
returns table (
  line_item_id uuid,
  "position" integer,
  description text,
  quantity numeric,
  unit_price_cents bigint,
  amount_cents bigint,
  tax_cents bigint,
  is_optional boolean,
  is_selected boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.position, l.description, l.quantity, l.unit_price_cents, l.amount_cents,
         coalesce((select sum(t.amount_cents) from public.quote_line_item_taxes t where t.line_item_id = l.id), 0)::bigint,
         l.is_optional, l.is_selected
  from public.quote_line_items l
  join public.quotes q on q.id = l.quote_id
  where q.id = p_quote_id
    and q.client_id in (select private.portal_client_ids())
    and q.status <> 'draft'
  order by l.position
$$;

-- A portal user approves a sent quote, choosing which optional lines to
-- include.
create function public.approve_quote(p_quote_id uuid, p_selected_optional_line_ids uuid[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes;
  today date;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into q from public.quotes
  where id = p_quote_id and client_id in (select private.portal_client_ids())
  for update;
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status <> 'sent' then
    raise exception 'only a sent quote can be approved' using errcode = '55000';
  end if;

  select (now() at time zone o.timezone)::date into today
  from public.organizations o where o.id = q.organization_id;
  if q.valid_until is not null and q.valid_until < today then
    raise exception 'this quote has expired' using errcode = '55000';
  end if;

  update public.quote_line_items
  set is_selected = (id = any (coalesce(p_selected_optional_line_ids, '{}')))
  where quote_id = q.id and is_optional;

  update public.quotes set status = 'approved' where id = q.id;
end;
$$;

create function public.decline_quote(p_quote_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into q from public.quotes
  where id = p_quote_id and client_id in (select private.portal_client_ids())
  for update;
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status <> 'sent' then
    raise exception 'only a sent quote can be declined' using errcode = '55000';
  end if;

  update public.quotes set status = 'declined', declined_reason = p_reason where id = q.id;
end;
$$;

revoke execute on function public.portal_my_quotes() from public, anon;
revoke execute on function public.portal_quote_lines(uuid) from public, anon;
revoke execute on function public.approve_quote(uuid, uuid[]) from public, anon;
revoke execute on function public.decline_quote(uuid, text) from public, anon;
grant execute on function public.portal_my_quotes() to authenticated;
grant execute on function public.portal_quote_lines(uuid) to authenticated;
grant execute on function public.approve_quote(uuid, uuid[]) to authenticated;
grant execute on function public.decline_quote(uuid, text) to authenticated;

------------------------------------------------------------------------------
-- Scheduled: expire sent quotes past valid_until (org-local date)
------------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'expire-quotes',
  '15 7 * * *',  -- 07:15 UTC, after midnight across North American timezones
  $cron$
    update public.quotes q
    set status = 'expired'
    from public.organizations o
    where o.id = q.organization_id
      and q.status = 'sent'
      and q.valid_until < (now() at time zone o.timezone)::date
  $cron$
);
