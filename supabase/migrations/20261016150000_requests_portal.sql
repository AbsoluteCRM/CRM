-- Client request portal: inbound service requests, a rate-limit log, and the
-- two service-role-only functions behind the public /portal/$orgSlug page.
-- See docs/database/tables/requests.md and docs/plans/client-request-portal.md.

create type public.request_status as enum (
  'submitted', 'reviewing', 'estimated', 'approved', 'rejected', 'scheduled', 'converted'
);
create type public.request_source as enum ('web_form', 'phone', 'email', 'client_portal');

create table public.requests (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid,
  service_id uuid not null,
  contact_name text not null check (length(trim(contact_name)) between 1 and 200),
  contact_email text not null
    check (contact_email = lower(contact_email) and length(contact_email) between 3 and 254),
  contact_phone text check (length(contact_phone) <= 40),
  address text not null check (length(trim(address)) between 1 and 500),
  preferred_frequency public.service_frequency not null,
  notes text check (length(notes) <= 4000),
  status public.request_status not null default 'submitted',
  source public.request_source not null default 'web_form',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete set null (client_id),
  foreign key (organization_id, service_id)
    references public.services (organization_id, id) on delete restrict
);

create index requests_org_status_idx
  on public.requests (organization_id, status, submitted_at desc);
create index requests_org_service_idx on public.requests (organization_id, service_id);
create index requests_org_client_idx on public.requests (organization_id, client_id);

create trigger set_updated_at
  before update on public.requests
  for each row execute function extensions.moddatetime(updated_at);

alter table public.requests enable row level security;

-- Workers get no policy (ADR 0011). Inserts only happen through submit_request.
create policy "Office staff can view requests"
  on public.requests for select to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));
create policy "Office staff can update requests"
  on public.requests for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin,dispatcher}'))));

revoke all on public.requests from authenticated;
grant select on public.requests to authenticated;
grant update (status, client_id) on public.requests to authenticated;

------------------------------------------------------------------------------
-- request_submission_log: one row per accepted public submission. The ip_hash
-- is an HMAC computed by the server, so the key never reaches the database.
------------------------------------------------------------------------------

create table public.request_submission_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ip_hash text not null check (length(ip_hash) = 64),
  created_at timestamptz not null default now()
);

create index request_submission_log_ip_idx on public.request_submission_log (ip_hash, created_at);
create index request_submission_log_org_idx
  on public.request_submission_log (organization_id, created_at);

alter table public.request_submission_log enable row level security;
revoke all on public.request_submission_log from anon, authenticated;

------------------------------------------------------------------------------
-- get_portal: public org name and bookable services, whitelisted columns.
------------------------------------------------------------------------------

create function public.get_portal(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'organization_name', o.name,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'unit', s.unit,
        'default_price_cents', s.default_price_cents,
        'color', s.color,
        'frequencies', s.frequencies
      ) order by s.name)
      from public.services s
      where s.organization_id = o.id and s.archived_at is null
    ), '[]'::jsonb)
  )
  from public.organizations o
  where o.slug = p_slug
$$;

------------------------------------------------------------------------------
-- submit_request: validates, rate-limits (5 per IP and 50 per org per hour)
-- and inserts. Errors are portal_* messages the server maps to tRPC codes.
------------------------------------------------------------------------------

create function public.submit_request(
  p_slug text,
  p_service_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_frequency public.service_frequency,
  p_notes text,
  p_ip_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_frequencies public.service_frequency[];
  v_id uuid;
begin
  select id into v_org from public.organizations where slug = p_slug;
  if v_org is null then
    raise exception 'portal_not_found';
  end if;

  select frequencies into v_frequencies
  from public.services
  where id = p_service_id and organization_id = v_org and archived_at is null;
  if not found then
    raise exception 'portal_invalid_service';
  end if;
  if not (p_frequency = any (v_frequencies)) then
    raise exception 'portal_invalid_frequency';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 1));

  delete from public.request_submission_log where created_at < now() - interval '24 hours';

  if (select count(*) from public.request_submission_log
      where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.request_submission_log
         where organization_id = v_org and created_at > now() - interval '1 hour') >= 50 then
    raise exception 'portal_rate_limited';
  end if;

  insert into public.request_submission_log (organization_id, ip_hash)
  values (v_org, p_ip_hash);

  insert into public.requests (
    organization_id, service_id, contact_name, contact_email, contact_phone,
    address, preferred_frequency, notes
  )
  values (
    v_org, p_service_id, trim(p_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
    trim(p_address), p_frequency, nullif(trim(p_notes), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.get_portal(text) from public, anon, authenticated;
revoke execute on function public.submit_request(
  text, uuid, text, text, text, text, public.service_frequency, text, text
) from public, anon, authenticated;
grant execute on function public.get_portal(text) to service_role;
grant execute on function public.submit_request(
  text, uuid, text, text, text, text, public.service_frequency, text, text
) to service_role;
