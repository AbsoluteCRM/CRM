-- Public R2 uploads: narrow employee authorization and service-only Vault read.
-- This migration is prepared for deployment; no real secret values belong here.
create extension if not exists supabase_vault with schema vault;

create function public.authorize_image_upload(p_organization_id uuid, p_folder text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_match text[];
begin
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not private.is_org_member(p_organization_id) then
    raise exception 'Upload target is not permitted' using errcode = '42501';
  end if;

  if p_folder = 'company_logos/' || p_organization_id::text then
    return p_organization_id;
  end if;

  v_match := pg_catalog.regexp_match(p_folder,
    '^jobs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
  if v_match is not null and exists (
    select 1 from public.jobs j
    where j.organization_id = p_organization_id and j.id = v_match[1]::uuid
  ) then
    return p_organization_id;
  end if;

  raise exception 'Upload target is not permitted' using errcode = '42501';
end;
$$;

revoke all on function public.authorize_image_upload(uuid, text) from public, anon, service_role;
grant execute on function public.authorize_image_upload(uuid, text) to authenticated;
comment on function public.authorize_image_upload(uuid, text) is
  'Checks active employee membership and explicit organization scope for R2 logo/job upload targets. Does not grant job table access.';

create function public.get_r2_upload_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_config jsonb;
begin
  -- Only the service role has EXECUTE. The caller cannot choose secret names.
  select pg_catalog.jsonb_object_agg(s.name, s.decrypted_secret)
    into v_config
  from vault.decrypted_secrets s
  where s.name = any (array[
    'r2_account_id', 'r2_access_key_id', 'r2_secret_access_key',
    'r2_bucket_name', 'r2_public_base_url'
  ]);

  if v_config is null or exists (
    select 1 from pg_catalog.unnest(array[
      'r2_account_id', 'r2_access_key_id', 'r2_secret_access_key',
      'r2_bucket_name', 'r2_public_base_url'
    ]) as required(name)
    where coalesce(pg_catalog.btrim(v_config ->> required.name), '') = ''
  ) then
    raise exception 'R2 upload configuration is incomplete' using errcode = '55000';
  end if;
  return v_config;
end;
$$;

revoke all on function public.get_r2_upload_config() from public, anon, authenticated;
grant execute on function public.get_r2_upload_config() to service_role;
comment on function public.get_r2_upload_config() is
  'Trusted Edge Function only: returns five fixed R2 Vault configuration entries. Never expose or log the result.';
