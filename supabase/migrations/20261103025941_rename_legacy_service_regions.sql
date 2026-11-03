-- The remote carried an unrecorded prototype `service_regions` table (crew
-- polygons: id, organization_id, name, crew_id, boundary). Move it aside so
-- the service_areas migration can create the real schema; the next-but-one
-- migration converts its rows to service_areas.
--
-- Guarded so it is a no-op wherever the prototype never existed (every fresh
-- database), while keeping this repo's history aligned with the remote's.

do $$
begin
  if to_regclass('public.service_regions') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'service_regions' and column_name = 'crew_id'
     ) then
    alter table public.service_regions rename to legacy_service_regions;
    alter table public.legacy_service_regions
      rename constraint service_regions_pkey to legacy_service_regions_pkey;
    alter table public.legacy_service_regions
      rename constraint service_regions_organization_id_id_key to legacy_service_regions_organization_id_id_key;
    alter index public.service_regions_org_name_idx rename to legacy_service_regions_org_name_idx;
    alter index public.service_regions_boundary_idx rename to legacy_service_regions_boundary_idx;
  end if;
end;
$$;
