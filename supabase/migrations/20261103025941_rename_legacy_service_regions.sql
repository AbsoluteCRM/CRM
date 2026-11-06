-- The remote carried an unrecorded prototype service_regions table (crew polygons).
-- Move it aside so the service_areas migration can create the real schema;
-- its rows are converted to service_areas afterwards.
alter table public.service_regions rename to legacy_service_regions;
alter table public.legacy_service_regions rename constraint service_regions_pkey to legacy_service_regions_pkey;
alter table public.legacy_service_regions rename constraint service_regions_organization_id_id_key to legacy_service_regions_organization_id_id_key;
alter index public.service_regions_org_name_idx rename to legacy_service_regions_org_name_idx;
alter index public.service_regions_boundary_idx rename to legacy_service_regions_boundary_idx;