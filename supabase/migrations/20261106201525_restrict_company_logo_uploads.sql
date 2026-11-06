-- Company branding is managed by owners/admins; employee job uploads stay unchanged.
create or replace function public.authorize_image_upload(p_organization_id uuid, p_folder text)
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
    if not private.has_org_role(p_organization_id, '{owner,admin}') then
      raise exception 'Upload target is not permitted' using errcode = '42501';
    end if;
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
  'Authorizes owner/admin logo uploads and active employee job image uploads in the explicitly selected organization.';
