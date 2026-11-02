-- Clients are created when the customer approves a quote, not when staff
-- start one. A request from the public page has only contact details, so its
-- quotes start without a client. When the customer approves through the
-- emailed link, portal_token_approve links the request's email to an existing
-- client of that organization, or creates one from the request's details.
-- See docs/database/tables/quotes.md ("Clients and approval").

------------------------------------------------------------------------------
-- quotes.client_id is optional until approval
------------------------------------------------------------------------------

alter table public.quotes alter column client_id drop not null;

-- A quote without a client must come from a request (that is where the
-- recipient's email lives) and can't be approved or converted yet. A
-- property always belongs to a client.
alter table public.quotes
  add constraint quotes_client_required check (
    client_id is not null
    or (request_id is not null and status in ('draft', 'sent', 'declined', 'expired'))
  ),
  add constraint quotes_property_needs_client check (property_id is null or client_id is not null);

-- Same guard as before, with one extra path: the approval that attaches the
-- client to a sent quote with none. Only portal_token_approve does that, in
-- the same statement that moves the quote to approved.
create or replace function private.quote_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  attaching_client boolean :=
    old.client_id is null and new.client_id is not null
    and old.status = 'sent' and new.status = 'approved'
    and new.property_id is not distinct from old.property_id;
begin
  if (new.request_id, new.revision) is distinct from (old.request_id, old.revision) then
    raise exception 'a quote''s request and revision can''t change'
      using errcode = '55000';
  end if;

  if old.status <> 'draft'
     and not attaching_client
     and (new.client_id, new.property_id, new.title, new.message, new.conditions, new.valid_until)
         is distinct from
         (old.client_id, old.property_id, old.title, old.message, old.conditions, old.valid_until) then
    raise exception 'a sent quote can''t be edited; move it back to draft first'
      using errcode = '55000';
  end if;

  if attaching_client
     and (new.title, new.message, new.conditions, new.valid_until)
         is distinct from (old.title, old.message, old.conditions, old.valid_until) then
    raise exception 'a sent quote can''t be edited; move it back to draft first'
      using errcode = '55000';
  end if;

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
      new.sent_at := now();
    elsif new.status = 'approved' then
      new.approved_at := now();
      new.approved_by_user_id := (select auth.uid());
    end if;
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- create_quote_draft no longer creates a client
------------------------------------------------------------------------------

-- Same as 20261018220000 except the client block: the draft takes the
-- request's client when staff already linked one, and stays without a
-- client otherwise.
create or replace function public.create_quote_draft(p_request_id uuid, p_copy_from_quote_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests;
  src public.quotes;
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

  select coalesce(max(revision), 0) + 1 into next_revision
  from public.quotes where organization_id = r.organization_id and request_id = r.id;

  select coalesce(src.title, s.name) into new_title
  from public.services s where s.organization_id = r.organization_id and s.id = r.service_id;

  insert into public.quotes
    (organization_id, client_id, property_id, title, message, internal_notes, conditions,
     request_id, revision)
  values
    (r.organization_id, r.client_id,
     case when r.client_id is not null then src.property_id end,
     coalesce(new_title, 'Quote'), src.message, src.internal_notes, src.conditions,
     r.id, next_revision)
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
-- send_quote: a quote without a client goes to the request's email
------------------------------------------------------------------------------

create or replace function public.send_quote(p_quote_id uuid, p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes;
  today date;
  tz text;
  recipient text;
  token_id uuid;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found or not private.has_org_role(q.organization_id, '{owner,admin,dispatcher}') then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  -- Serializes sends within a request, so two revisions can't both end up sent.
  if q.request_id is not null then
    perform 1 from public.requests r where r.organization_id = q.organization_id and r.id = q.request_id for update;
  end if;
  if q.status <> 'draft' then
    raise exception 'only a draft quote can be sent' using errcode = '55000';
  end if;

  select o.timezone, (now() at time zone o.timezone)::date into tz, today
  from public.organizations o where o.id = q.organization_id;
  if q.valid_until is null or q.valid_until < today then
    raise exception 'set a valid until date that is not in the past' using errcode = '55000';
  end if;

  recipient := private.quote_recipient_email(q.organization_id, q.id);
  if recipient is null then
    raise exception 'the client has no email address' using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.quote_line_items l
    where l.organization_id = q.organization_id and l.quote_id = q.id
  ) then
    raise exception 'add at least one line before sending' using errcode = '55000';
  end if;

  if q.request_id is not null then
    update public.quote_share_tokens t set revoked_at = now()
    where t.organization_id = q.organization_id and t.revoked_at is null
      and t.quote_id in (
        select id from public.quotes
        where organization_id = q.organization_id and request_id = q.request_id
          and status = 'sent' and id <> q.id
      );
    update public.quotes set status = 'expired'
    where organization_id = q.organization_id and request_id = q.request_id
      and status = 'sent' and id <> q.id;
  end if;

  update public.quotes set status = 'sent' where organization_id = q.organization_id and id = q.id;

  insert into public.quote_share_tokens (organization_id, quote_id, token_hash, expires_at)
  values (q.organization_id, q.id, p_token_hash,
          ((q.valid_until + 1)::timestamp at time zone tz))
  returning id into token_id;

  perform private.sync_request_status(q.organization_id, q.request_id);
  return token_id;
end;
$$;

-- Where a quote's email goes: the client's email, or the request's when the
-- quote has no client yet.
create function private.quote_recipient_email(p_org uuid, p_quote_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(c.email), ''), nullif(lower(trim(r.contact_email)), ''))
  from public.quotes q
  left join public.clients c on c.organization_id = q.organization_id and c.id = q.client_id
  left join public.requests r on r.organization_id = q.organization_id and r.id = q.request_id
  where q.organization_id = p_org and q.id = p_quote_id
$$;

revoke execute on function private.quote_recipient_email(uuid, uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- The quote page names the request's contact when there is no client yet
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
    'client_name', coalesce(c.display_name, r.contact_name),
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
  left join public.clients c on c.organization_id = q.organization_id and c.id = q.client_id
  left join public.requests r on r.organization_id = q.organization_id and r.id = q.request_id
  where q.organization_id = t.organization_id and q.id = t.quote_id;

  return result;
end;
$$;

------------------------------------------------------------------------------
-- Approval links or creates the client
------------------------------------------------------------------------------

-- Returns the client for a request's contact: the client staff already
-- linked to the request, else the oldest non-archived client of the org with
-- the same email, else a new one built from the request. Links the request
-- to it. Serialized per (org, email), so two approvals for one email can't
-- create two clients.
create function private.client_for_request(p_org uuid, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.requests;
  v_email text;
  found_client uuid;
begin
  select * into r from public.requests
  where organization_id = p_org and id = p_request_id
  for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  if r.client_id is not null then
    return r.client_id;
  end if;

  v_email := nullif(lower(trim(r.contact_email)), '');
  if v_email is null then
    raise exception 'the request has no email address' using errcode = '55000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || v_email, 2));

  select c.id into found_client
  from public.clients c
  where c.organization_id = p_org and c.email = v_email and c.archived_at is null
  order by c.created_at, c.id
  limit 1;

  if found_client is null then
    insert into public.clients
      (organization_id, status, display_name, email, phone, lead_source, notes)
    values
      (p_org, 'active', trim(r.contact_name), v_email, nullif(trim(r.contact_phone), ''),
       'Online request',
       'Service address from request: ' || trim(r.address))
    returning id into found_client;
  end if;

  update public.requests set client_id = found_client
  where organization_id = p_org and id = r.id;
  return found_client;
end;
$$;

revoke execute on function private.client_for_request(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_token_approve(
  p_token_hash text,
  p_selected_optional_line_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  q public.quotes;
  client uuid;
begin
  select * into t from private.resolve_quote_token(p_token_hash, '{sent}');
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;

  select * into q from public.quotes where organization_id = t.organization_id and id = t.quote_id;
  client := coalesce(q.client_id, private.client_for_request(t.organization_id, t.request_id));

  update public.quote_line_items
  set is_selected = (id = any (coalesce(p_selected_optional_line_ids, '{}')))
  where organization_id = t.organization_id and quote_id = t.quote_id and is_optional;

  update public.quotes set status = 'approved', client_id = client
  where organization_id = t.organization_id and id = t.quote_id;

  perform private.sync_request_status(t.organization_id, t.request_id);
end;
$$;

-- create or replace keeps the existing grants (service_role only).
