-- Quote lines carry a billing frequency and the months the service is active.
-- Mirrors services.frequencies and season_start/end_month: a start after the
-- end wraps over new year, both null means year-round.
-- See docs/plans/quote-builder-send.md and docs/database/tables/quotes.md.
--
-- The existing line guard compares whole rows, so the new columns are frozen
-- once the quote leaves draft with no change to it.

alter table public.quote_line_items
  add column frequency public.service_frequency not null default 'one_time',
  add column season_start_month smallint check (season_start_month between 1 and 12),
  add column season_end_month smallint check (season_end_month between 1 and 12),
  add constraint quote_line_items_season_both_or_neither
    check ((season_start_month is null) = (season_end_month is null));

comment on column public.quote_line_items.frequency is
  'How often the client is billed for this line. one_time is a single charge.';
comment on column public.quote_line_items.season_start_month is
  'First month (1-12) the service is active. Null with season_end_month = year-round.';
comment on column public.quote_line_items.season_end_month is
  'Last month (1-12) the service is active. A start after the end wraps over new year.';

grant insert (frequency, season_start_month, season_end_month)
  on public.quote_line_items to authenticated;
grant update (frequency, season_start_month, season_end_month)
  on public.quote_line_items to authenticated;

------------------------------------------------------------------------------
-- A copied revision keeps each line's frequency and months
------------------------------------------------------------------------------

create or replace function public.create_quote_draft(p_request_id uuid, p_copy_from_quote_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests;
  src public.quotes;
  new_client uuid;
  next_revision integer;
  new_quote uuid;
  new_title text;
  l public.quote_line_items;
  new_line uuid;
begin
  select * into r from public.requests where id = p_request_id for update;
  if not found or not private.has_org_role(r.organization_id, '{owner,admin,dispatcher}') then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if r.status = 'converted' then
    raise exception 'this request was already converted' using errcode = '55000';
  end if;

  if p_copy_from_quote_id is not null then
    select * into src from public.quotes
    where organization_id = r.organization_id and id = p_copy_from_quote_id and request_id = r.id;
    if not found then
      raise exception 'quote not found' using errcode = 'P0002';
    end if;
  end if;

  if r.client_id is null then
    insert into public.clients (organization_id, display_name, email, phone)
    values (r.organization_id, r.contact_name, r.contact_email, r.contact_phone)
    returning id into new_client;
    update public.requests set client_id = new_client where id = r.id;
    r.client_id := new_client;
  end if;

  select coalesce(max(revision), 0) + 1 into next_revision
  from public.quotes where organization_id = r.organization_id and request_id = r.id;

  select coalesce(src.title, s.name) into new_title
  from public.services s where s.organization_id = r.organization_id and s.id = r.service_id;

  insert into public.quotes
    (organization_id, client_id, property_id, title, message, internal_notes, conditions,
     request_id, revision)
  values
    (r.organization_id, r.client_id, src.property_id, coalesce(new_title, 'Quote'), src.message,
     src.internal_notes, src.conditions, r.id, next_revision)
  returning id into new_quote;

  if src.id is not null then
    for l in
      select * from public.quote_line_items
      where organization_id = src.organization_id and quote_id = src.id
      order by position
    loop
      insert into public.quote_line_items
        (organization_id, quote_id, service_id, position, description, quantity, unit_price_cents,
         is_optional, frequency, season_start_month, season_end_month)
      values
        (l.organization_id, new_quote, l.service_id, l.position, l.description, l.quantity,
         l.unit_price_cents, l.is_optional, l.frequency, l.season_start_month, l.season_end_month)
      returning id into new_line;

      insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
      select t.organization_id, new_line, t.tax_rate_id
      from public.quote_line_item_taxes t
      where t.organization_id = l.organization_id and t.line_item_id = l.id;
    end loop;
  end if;

  perform private.sync_request_status(r.organization_id, r.id);
  return new_quote;
end;
$$;

------------------------------------------------------------------------------
-- The magic-link quote page shows the frequency and months too
------------------------------------------------------------------------------

create or replace function public.portal_token_get_quote(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  result jsonb;
begin
  select * into t from private.resolve_quote_token(p_token_hash, '{sent,approved,declined}');
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;

  update public.quote_share_tokens set viewed_at = now() where id = t.token_id and viewed_at is null;

  select jsonb_build_object(
    'number', q.number,
    'status', q.status,
    'title', q.title,
    'message', q.message,
    'conditions', q.conditions,
    'valid_until', q.valid_until,
    'subtotal_cents', q.subtotal_cents,
    'tax_cents', q.tax_cents,
    'total_cents', q.total_cents,
    'currency', o.currency,
    'organization_name', o.name,
    'client_name', c.display_name,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'position', l.position,
        'description', l.description,
        'quantity', l.quantity,
        'unit_price_cents', l.unit_price_cents,
        'amount_cents', l.amount_cents,
        'tax_cents', coalesce((
          select sum(x.amount_cents) from public.quote_line_item_taxes x
          where x.organization_id = l.organization_id and x.line_item_id = l.id
        ), 0),
        'is_optional', l.is_optional,
        'is_selected', l.is_selected,
        'frequency', l.frequency,
        'season_start_month', l.season_start_month,
        'season_end_month', l.season_end_month
      ) order by l.position)
      from public.quote_line_items l
      where l.organization_id = q.organization_id and l.quote_id = q.id
    ), '[]'::jsonb)
  ) into result
  from public.quotes q
  join public.organizations o on o.id = q.organization_id
  join public.clients c on c.organization_id = q.organization_id and c.id = q.client_id
  where q.organization_id = t.organization_id and q.id = t.quote_id;

  return result;
end;
$$;
