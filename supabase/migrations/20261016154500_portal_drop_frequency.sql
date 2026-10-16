-- Portal follow-up: the visitor no longer picks a frequency (the service
-- already defines its frequencies), and get_portal returns the season months
-- and duration so the public cards match the services page.

drop function public.submit_request(
  text, uuid, text, text, text, text, public.service_frequency, text, text
);

alter table public.requests drop column preferred_frequency;

create or replace function public.get_portal(p_slug text)
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
        'default_duration_minutes', s.default_duration_minutes,
        'color', s.color,
        'frequencies', s.frequencies,
        'season_start_month', s.season_start_month,
        'season_end_month', s.season_end_month
      ) order by s.name)
      from public.services s
      where s.organization_id = o.id and s.archived_at is null
    ), '[]'::jsonb)
  )
  from public.organizations o
  where o.slug = p_slug
$$;

create function public.submit_request(
  p_slug text,
  p_service_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_address text,
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
  v_id uuid;
begin
  select id into v_org from public.organizations where slug = p_slug;
  if v_org is null then
    raise exception 'portal_not_found';
  end if;

  perform 1
  from public.services
  where id = p_service_id and organization_id = v_org and archived_at is null;
  if not found then
    raise exception 'portal_invalid_service';
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
    address, notes
  )
  values (
    v_org, p_service_id, trim(p_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
    trim(p_address), nullif(trim(p_notes), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.get_portal(text) from public, anon, authenticated;
revoke execute on function public.submit_request(
  text, uuid, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.get_portal(text) to service_role;
grant execute on function public.submit_request(
  text, uuid, text, text, text, text, text, text
) to service_role;
