-- Quote builder and send: link quotes to requests (with revisions), share
-- tokens for the magic-link quote page, and the functions that own every
-- quote status change.
-- See docs/plans/quote-builder-send.md and docs/database/tables/quotes.md.
--
-- Staff can no longer update quotes.status directly. send_quote,
-- pull_back_quote, the approve/decline paths and the expire-quotes job are
-- the only writers, and each one re-syncs the linked request's status.

------------------------------------------------------------------------------
-- requests: internal "needs info" note
------------------------------------------------------------------------------

alter table public.requests
  add column info_needed text check (length(info_needed) <= 2000);

grant update (info_needed) on public.requests to authenticated;

------------------------------------------------------------------------------
-- quotes: request link, revision, client-facing conditions
------------------------------------------------------------------------------

alter table public.quotes
  add column request_id uuid,
  add column revision integer check (revision > 0),
  add column conditions text check (length(conditions) <= 4000),
  add constraint quotes_request_revision_pair check ((request_id is null) = (revision is null)),
  add constraint quotes_request_revision_key unique (organization_id, request_id, revision),
  add constraint quotes_request_fkey foreign key (organization_id, request_id)
    references public.requests (organization_id, id) on delete restrict;

comment on column public.quotes.conditions is
  'Client-facing terms shown on the quote, e.g. "price subject to a site visit".';

-- (organization_id, request_id, revision) is unique, so it also serves the
-- request FK.

-- request_id and revision are written only by create_quote_draft.
grant insert (conditions) on public.quotes to authenticated;
grant update (conditions) on public.quotes to authenticated;
revoke update (status, declined_reason) on public.quotes from authenticated;

-- Replaces the guard from the quotes migration. Once a quote leaves draft,
-- its client-facing terms (conditions, valid_until) are fixed too, and the
-- request link never changes.
create or replace function private.quote_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.request_id, new.revision) is distinct from (old.request_id, old.revision) then
    raise exception 'a quote''s request and revision can''t change'
      using errcode = '55000';
  end if;

  if old.status <> 'draft'
     and (new.client_id, new.property_id, new.title, new.message, new.conditions, new.valid_until)
         is distinct from
         (old.client_id, old.property_id, old.title, old.message, old.conditions, old.valid_until) then
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
-- quote_share_tokens: one row per issued magic link. Only the SHA-256 hash
-- of the token is stored. Staff can read delivery state (never the hash);
-- every write goes through the functions below.
------------------------------------------------------------------------------

create type public.quote_delivery_status as enum ('pending', 'sent', 'failed');

create table public.quote_share_tokens (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  viewed_at timestamptz,
  delivery_status public.quote_delivery_status not null default 'pending',
  delivery_attempts integer not null default 1,
  resend_message_id text,
  last_delivery_error text check (length(last_delivery_error) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete cascade
);

-- One live link per quote.
create unique index quote_share_tokens_live_idx
  on public.quote_share_tokens (organization_id, quote_id) where revoked_at is null;
create index quote_share_tokens_quote_idx
  on public.quote_share_tokens (organization_id, quote_id, created_at desc);

alter table public.quote_share_tokens enable row level security;

create policy "Office staff can view quote share tokens"
  on public.quote_share_tokens for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

revoke all on public.quote_share_tokens from anon, authenticated;
grant select (id, organization_id, quote_id, expires_at, revoked_at, viewed_at,
              delivery_status, delivery_attempts, last_delivery_error, created_at)
  on public.quote_share_tokens to authenticated;

------------------------------------------------------------------------------
-- Request status follows its quotes. Staff own rejected and scheduled.
------------------------------------------------------------------------------

create function private.sync_request_status(p_org uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.request_status;
  target public.request_status;
begin
  if p_request_id is null then
    return;
  end if;

  select status into cur from public.requests
  where organization_id = p_org and id = p_request_id
  for update;
  if not found or cur in ('rejected', 'scheduled') then
    return;
  end if;

  select case
    when bool_or(status = 'converted') then 'converted'
    when bool_or(status = 'approved') then 'approved'
    when bool_or(status = 'sent') then 'estimated'
    else 'reviewing'
  end::public.request_status
  into target
  from public.quotes
  where organization_id = p_org and request_id = p_request_id
  having count(*) > 0;

  if target is not null and target is distinct from cur then
    update public.requests set status = target
    where organization_id = p_org and id = p_request_id;
  end if;
end;
$$;

revoke execute on function private.sync_request_status(uuid, uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Staff functions (owner, admin, dispatcher of the quote's org)
------------------------------------------------------------------------------

-- Creates the next draft revision for a request. Locks the request, so
-- concurrent calls get consecutive revisions. A request with no client gets
-- one created from its contact details (no property: the request address is
-- free text). With p_copy_from_quote_id, copies that revision's content and
-- lines.
create function public.create_quote_draft(p_request_id uuid, p_copy_from_quote_id uuid default null)
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
         is_optional)
      values
        (l.organization_id, new_quote, l.service_id, l.position, l.description, l.quantity,
         l.unit_price_cents, l.is_optional)
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

-- Sends a draft: validates it, supersedes the request's previously sent
-- revision, marks it sent, and records the new share token (the caller
-- generates the token and passes its SHA-256 hex hash). Returns the token
-- row id, which the server uses as the email idempotency key.
create function public.send_quote(p_quote_id uuid, p_token_hash text)
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

  select nullif(trim(c.email), '') into recipient
  from public.clients c where c.organization_id = q.organization_id and c.id = q.client_id;
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

-- Moves a sent quote back to draft and kills its link.
create function public.pull_back_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found or not private.has_org_role(q.organization_id, '{owner,admin,dispatcher}') then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status <> 'sent' then
    raise exception 'only a sent quote can be pulled back' using errcode = '55000';
  end if;

  update public.quote_share_tokens set revoked_at = now()
  where organization_id = q.organization_id and quote_id = q.id and revoked_at is null;
  update public.quotes set status = 'draft' where organization_id = q.organization_id and id = q.id;

  perform private.sync_request_status(q.organization_id, q.request_id);
end;
$$;

-- Resend: replaces the live link of a sent quote with a new one. The old
-- link stops working. Locks the quote and live token, so concurrent calls
-- serialize and at most one live token exists.
create function public.rotate_quote_token(p_quote_id uuid, p_new_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes;
  old_t public.quote_share_tokens;
  token_id uuid;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found or not private.has_org_role(q.organization_id, '{owner,admin,dispatcher}') then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status <> 'sent' then
    raise exception 'only a sent quote can be resent' using errcode = '55000';
  end if;

  select * into old_t from public.quote_share_tokens
  where organization_id = q.organization_id and quote_id = q.id and revoked_at is null
  for update;
  if not found or old_t.expires_at <= now() then
    raise exception 'this quote''s link has expired' using errcode = '55000';
  end if;

  update public.quote_share_tokens set revoked_at = now() where id = old_t.id;
  insert into public.quote_share_tokens
    (organization_id, quote_id, token_hash, expires_at, delivery_attempts)
  values (q.organization_id, q.id, p_new_token_hash, old_t.expires_at, old_t.delivery_attempts + 1)
  returning id into token_id;
  return token_id;
end;
$$;

revoke execute on function
  public.create_quote_draft(uuid, uuid),
  public.send_quote(uuid, text),
  public.pull_back_quote(uuid),
  public.rotate_quote_token(uuid, text)
from public, anon;
grant execute on function
  public.create_quote_draft(uuid, uuid),
  public.send_quote(uuid, text),
  public.pull_back_quote(uuid),
  public.rotate_quote_token(uuid, text)
to authenticated;

------------------------------------------------------------------------------
-- Service-role functions (trusted server code only; the caller holds a
-- token, not a session)
------------------------------------------------------------------------------

-- Records the outcome of an email attempt for a live token.
create function public.record_quote_delivery(
  p_token_id uuid,
  p_status public.quote_delivery_status,
  p_message_id text,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status = 'pending' then
    raise exception 'invalid delivery status' using errcode = '22023';
  end if;
  update public.quote_share_tokens
  set delivery_status = p_status,
      resend_message_id = p_message_id,
      last_delivery_error = left(p_error, 1000)
  where id = p_token_id and revoked_at is null;
end;
$$;

-- The one definition of "this token is usable": hash match, not revoked, not
-- expired, quote in one of the allowed statuses. Locks the quote row, then
-- checks again on a fresh snapshot, so a token revoked by a concurrent resend
-- or pull-back while this call waited for the lock is not honoured.
create function private.resolve_quote_token(p_token_hash text, p_statuses public.quote_status[])
returns table (token_id uuid, organization_id uuid, quote_id uuid, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cand record;
begin
  select t.organization_id as org, t.quote_id as qid into cand
  from public.quote_share_tokens t where t.token_hash = p_token_hash;
  if not found then
    return;
  end if;

  perform 1 from public.quotes q where q.organization_id = cand.org and q.id = cand.qid for update;

  return query
  select t.id, t.organization_id, q.id, q.request_id
  from public.quote_share_tokens t
  join public.quotes q on q.organization_id = t.organization_id and q.id = t.quote_id
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
    and q.status = any (p_statuses);
end;
$$;

revoke execute on function private.resolve_quote_token(text, public.quote_status[])
  from public, anon, authenticated;

-- What the quote page shows. Approved and declined quotes stay readable so
-- the link shows the outcome; superseded, pulled-back and expired quotes do
-- not. Stamps the first view. Never returns internal notes.
create function public.portal_token_get_quote(p_token_hash text)
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
        'is_selected', l.is_selected
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

create function public.portal_token_approve(
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
begin
  select * into t from private.resolve_quote_token(p_token_hash, '{sent}');
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;

  update public.quote_line_items
  set is_selected = (id = any (coalesce(p_selected_optional_line_ids, '{}')))
  where organization_id = t.organization_id and quote_id = t.quote_id and is_optional;

  update public.quotes set status = 'approved'
  where organization_id = t.organization_id and id = t.quote_id;

  perform private.sync_request_status(t.organization_id, t.request_id);
end;
$$;

create function public.portal_token_decline(p_token_hash text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  select * into t from private.resolve_quote_token(p_token_hash, '{sent}');
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;

  update public.quotes set status = 'declined', declined_reason = left(nullif(trim(p_reason), ''), 1000)
  where organization_id = t.organization_id and id = t.quote_id;

  perform private.sync_request_status(t.organization_id, t.request_id);
end;
$$;

revoke execute on function
  public.record_quote_delivery(uuid, public.quote_delivery_status, text, text),
  public.portal_token_get_quote(text),
  public.portal_token_approve(text, uuid[]),
  public.portal_token_decline(text, text)
from public, anon, authenticated;
grant execute on function
  public.record_quote_delivery(uuid, public.quote_delivery_status, text, text),
  public.portal_token_get_quote(text),
  public.portal_token_approve(text, uuid[]),
  public.portal_token_decline(text, text)
to service_role;

------------------------------------------------------------------------------
-- Existing quote writers now keep the linked request in step
------------------------------------------------------------------------------

create or replace function public.approve_quote(p_quote_id uuid, p_selected_optional_line_ids uuid[] default '{}')
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

  select q2.* into q
  from private.portal_clients() pc
  join public.quotes q2 on q2.organization_id = pc.organization_id and q2.client_id = pc.client_id
  where q2.id = p_quote_id
  for update of q2;
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
  where organization_id = q.organization_id and quote_id = q.id and is_optional;

  update public.quotes set status = 'approved' where organization_id = q.organization_id and id = q.id;

  perform private.sync_request_status(q.organization_id, q.request_id);
end;
$$;

create or replace function public.decline_quote(p_quote_id uuid, p_reason text default null)
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

  select q2.* into q
  from private.portal_clients() pc
  join public.quotes q2 on q2.organization_id = pc.organization_id and q2.client_id = pc.client_id
  where q2.id = p_quote_id
  for update of q2;
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status <> 'sent' then
    raise exception 'only a sent quote can be declined' using errcode = '55000';
  end if;

  update public.quotes set status = 'declined', declined_reason = p_reason
  where organization_id = q.organization_id and id = q.id;

  perform private.sync_request_status(q.organization_id, q.request_id);
end;
$$;

-- job_from_quote, plus the request moving to converted.
create or replace function private.job_from_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.quote_line_items;
  job_line_id uuid;
  req uuid;
begin
  update public.quotes
  set status = 'converted'
  where organization_id = new.organization_id and id = new.quote_id
    and status = 'approved' and client_id = new.client_id
  returning request_id into req;
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

  perform private.sync_request_status(new.organization_id, req);
  return null;
end;
$$;

-- expire-quotes: same schedule and rule as before, now also re-syncing the
-- requests whose quotes expired.
create function private.expire_quotes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  for e in
    with expired as (
      update public.quotes q
      set status = 'expired'
      from public.organizations o
      where o.id = q.organization_id
        and q.status = 'sent'
        and q.valid_until < (now() at time zone o.timezone)::date
      returning q.organization_id, q.request_id
    )
    select distinct organization_id, request_id from expired where request_id is not null
  loop
    perform private.sync_request_status(e.organization_id, e.request_id);
  end loop;
end;
$$;

revoke execute on function private.expire_quotes() from public, anon, authenticated;

select cron.schedule('expire-quotes', '15 * * * *', $cron$ select private.expire_quotes() $cron$);
