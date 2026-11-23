-- Reconcile main's client-on-approval send with quote conversation delivery.
-- Both earlier migrations are already recorded; keep their history intact.
-- Preserve request-contact fallback and normalize optional selections atomically.

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

  -- A sent total must match acceptance with the currently supported empty
  -- optional-selection list. Run while the quote is still a locked draft so
  -- line triggers recalculate the stored totals within this transaction.
  update public.quote_line_items set is_selected = false
  where organization_id = q.organization_id and quote_id = q.id
    and is_optional and is_selected;

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

-- CREATE OR REPLACE preserves ACLs. Restate the existing office-RPC boundary:
-- the function verifies the authenticated user's active office membership.
revoke execute on function public.send_quote(uuid, text) from public, anon, service_role;
grant execute on function public.send_quote(uuid, text) to authenticated;
