-- Convert the prototype crew-polygon regions into service_areas (keeping ids,
-- names, crews, boundaries and timestamps), then remove the prototype table
-- and its create_service_region function. See the previous-but-one migration.
--
-- Guarded: a no-op wherever legacy_service_regions does not exist.

do $$
begin
  if to_regclass('public.legacy_service_regions') is not null then
    insert into public.service_areas (id, organization_id, crew_id, name, boundary, created_at)
    select l.id, l.organization_id, l.crew_id, trim(l.name),
           extensions.st_multi(extensions.st_setsrid(extensions.st_force2d(l.boundary), 4326)),
           l.created_at
    from public.legacy_service_regions l;

    drop table public.legacy_service_regions;
  end if;
end;
$$;

drop function if exists public.create_service_region(uuid, text, uuid, jsonb);
