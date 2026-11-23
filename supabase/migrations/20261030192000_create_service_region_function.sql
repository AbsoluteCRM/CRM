
-- Save a geographic service region from GeoJSON.
-- Runs with the caller's permissions so RLS remains enforced.

create or replace function public.create_service_region(
  p_organization_id uuid,
  p_name text,
  p_crew_id uuid,
  p_boundary jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_region_id uuid;
  v_boundary extensions.geometry;
begin
  -- Validate the region name.
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Region name is required'
      using errcode = '22023';
  end if;

  -- Require a GeoJSON Polygon.
  if p_boundary is null
     or p_boundary->>'type' is distinct from 'Polygon' then
    raise exception 'Boundary must be a GeoJSON Polygon'
      using errcode = '22023';
  end if;

  -- Convert GeoJSON into PostGIS geometry.
  v_boundary := extensions.ST_SetSRID(
    extensions.ST_GeomFromGeoJSON(p_boundary::text),
    4326
  );

  -- Validate the polygon.
  if not extensions.ST_IsValid(v_boundary)
     or extensions.ST_IsEmpty(v_boundary) then
    raise exception 'Invalid polygon boundary'
      using errcode = '22023';
  end if;

  -- RLS checks that the caller can create regions
  -- within the specified organization.
  insert into public.service_regions (
    organization_id,
    name,
    crew_id,
    boundary
  )
  values (
    p_organization_id,
    trim(p_name),
    p_crew_id,
    v_boundary
  )
  returning id into v_region_id;

  return v_region_id;
end;
$$;

revoke all on function public.create_service_region(
  uuid, text, uuid, jsonb
) from public, anon;

grant execute on function public.create_service_region(
  uuid, text, uuid, jsonb
) to authenticated;
