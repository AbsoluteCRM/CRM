-- Secure per-quote conversations. Public callers hold a quote share token;
-- only trusted server code can invoke the token RPCs.

create table public.quote_messages (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000 and body ~ '[^[:space:]]'),
  sender_kind text not null check (sender_kind in ('staff', 'customer')),
  staff_user_id uuid references auth.users (id) on delete set null,
  client_message_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_messages_quote_fkey foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id) on delete restrict,
  constraint quote_messages_customer_attribution check (sender_kind <> 'customer' or staff_user_id is null),
  constraint quote_messages_retry_key unique (organization_id, quote_id, sender_kind, client_message_id)
);

create index quote_messages_history_idx
  on public.quote_messages (organization_id, quote_id, created_at desc, id desc);
create index quote_messages_staff_user_idx on public.quote_messages (staff_user_id);

create trigger set_updated_at before update on public.quote_messages
  for each row execute function extensions.moddatetime(updated_at);

alter table public.quote_messages enable row level security;
revoke all on public.quote_messages from public, anon, authenticated;
grant select on public.quote_messages to authenticated;
create policy "Office staff can read quote messages"
  on public.quote_messages for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

create function public.post_quote_message(
  p_organization_id uuid,
  p_quote_id uuid,
  p_body text,
  p_client_message_id uuid
)
returns table (id uuid, body text, sender_kind text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes;
  previous public.quote_messages;
  caller uuid := (select auth.uid());
  clean_body text := btrim(p_body);
begin
  if caller is null or not private.has_org_role(p_organization_id, '{owner,admin,dispatcher}') then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  select * into q from public.quotes
  where organization_id = p_organization_id and public.quotes.id = p_quote_id for update;
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if q.status not in ('sent', 'approved', 'declined') or not exists (
    select 1 from public.quote_share_tokens t
    where t.organization_id = q.organization_id and t.quote_id = q.id
      and t.revoked_at is null and t.expires_at > now()
  ) then
    raise exception 'this conversation is read-only' using errcode = '55000';
  end if;
  if p_client_message_id is null or clean_body is null
     or char_length(clean_body) not between 1 and 4000 or clean_body !~ '[^[:space:]]' then
    raise exception 'enter a message between 1 and 4000 characters' using errcode = '22023';
  end if;
  select m.* into previous from public.quote_messages m
  where m.organization_id = q.organization_id and m.quote_id = q.id
    and m.sender_kind = 'staff' and m.client_message_id = p_client_message_id;
  if found then
    if previous.staff_user_id is distinct from caller or previous.body <> clean_body then
      raise exception 'message retry conflicts with the original' using errcode = '23505';
    end if;
    return query select previous.id, previous.body, previous.sender_kind, previous.created_at;
    return;
  end if;
  return query
  insert into public.quote_messages as m
    (organization_id, quote_id, body, sender_kind, staff_user_id, client_message_id)
  values (q.organization_id, q.id, clean_body, 'staff', caller, p_client_message_id)
  returning m.id, m.body, m.sender_kind, m.created_at;
end;
$$;

revoke execute on function public.post_quote_message(uuid, uuid, text, uuid)
  from public, anon, service_role;
grant execute on function public.post_quote_message(uuid, uuid, text, uuid) to authenticated;

create function public.portal_token_list_messages(
  p_token_hash text,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (id uuid, body text, sender_kind text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  select * into t from private.resolve_quote_token(p_token_hash, '{sent,approved,declined}');
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'supply both cursor fields' using errcode = '22023';
  end if;
  return query select m.id, m.body, m.sender_kind, m.created_at
  from public.quote_messages m
  where m.organization_id = t.organization_id and m.quote_id = t.quote_id
    and (p_before_created_at is null or (m.created_at, m.id) < (p_before_created_at, p_before_id))
  order by m.created_at desc, m.id desc limit 50;
end;
$$;

create function public.portal_token_post_message(
  p_token_hash text,
  p_body text,
  p_client_message_id uuid
)
returns table (id uuid, body text, sender_kind text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  previous public.quote_messages;
  clean_body text := btrim(p_body);
  recent_count bigint;
  daily_count bigint;
begin
  select * into t from private.resolve_quote_token(p_token_hash, '{sent,approved,declined}');
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if p_client_message_id is null or clean_body is null
     or char_length(clean_body) not between 1 and 4000 or clean_body !~ '[^[:space:]]' then
    raise exception 'enter a message between 1 and 4000 characters' using errcode = '22023';
  end if;
  select m.* into previous from public.quote_messages m
  where m.organization_id = t.organization_id and m.quote_id = t.quote_id
    and m.sender_kind = 'customer' and m.client_message_id = p_client_message_id;
  if found then
    if previous.body <> clean_body then
      raise exception 'message retry conflicts with the original' using errcode = '23505';
    end if;
    return query select previous.id, previous.body, previous.sender_kind, previous.created_at;
    return;
  end if;

  -- Token resolution holds the quote lock: concurrent writes share this
  -- quota, including after link rotation. No plaintext token or IP is kept.
  select count(*) filter (where m.created_at > now() - interval '60 seconds'), count(*)
  into recent_count, daily_count from public.quote_messages m
  where m.organization_id = t.organization_id and m.quote_id = t.quote_id
    and m.sender_kind = 'customer' and m.created_at > now() - interval '24 hours';
  if recent_count >= 10 or daily_count >= 100 then
    raise exception 'quote_message_rate_limited' using errcode = 'P0001';
  end if;

  return query
  insert into public.quote_messages as m
    (organization_id, quote_id, body, sender_kind, client_message_id)
  values (t.organization_id, t.quote_id, clean_body, 'customer', p_client_message_id)
  returning m.id, m.body, m.sender_kind, m.created_at;
end;
$$;

revoke execute on function
  public.portal_token_list_messages(text, timestamptz, uuid),
  public.portal_token_post_message(text, text, uuid)
from public, anon, authenticated;
grant execute on function
  public.portal_token_list_messages(text, timestamptz, uuid),
  public.portal_token_post_message(text, text, uuid)
to service_role;

-- Optional selection is deferred in the public UI. Normalize under the send
-- lock so the delivered counted total is the total accepted by an empty
-- optional selection. Only guarded approval RPCs can subsequently select.
revoke update (is_selected) on public.quote_line_items from authenticated;

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

  update public.quote_line_items set is_selected = false
  where organization_id = q.organization_id and quote_id = q.id and is_optional and is_selected;

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
  values (q.organization_id, q.id, p_token_hash, ((q.valid_until + 1)::timestamp at time zone tz))
  returning id into token_id;
  perform private.sync_request_status(q.organization_id, q.request_id);
  return token_id;
end;
$$;
