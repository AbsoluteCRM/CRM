-- Service areas: the polygons each crew covers, the cities an org works in
-- (map frames), optional weekday crew rotations, and the derived
-- properties.service_area_id. See docs/database/tables/service-areas.md and
-- ADR 0012.
--
-- RLS: all staff read; owner/admin write. Geometry columns have no column
-- grants: polygons are written only by upsert_service_area /
-- upsert_service_region, which validate and normalize GeoJSON first.

------------------------------------------------------------------------------
-- Geometry normalization (pure; shared by the upsert and preview RPCs)
------------------------------------------------------------------------------

-- Parses a GeoJSON Polygon or MultiPolygon (lon/lat, EPSG:4326) into a valid
-- MultiPolygon: ST_MakeValid, keep polygon parts only, snap to a 1e-7 degree
-- grid (about 1 cm), make valid again (snapping can create self-touches), and
-- ST_Multi. Rejects other geometry types, coordinates outside lon/lat range,
-- an empty result, more than p_max_vertices vertices, and an area over
-- p_max_area_m2. Every rejection is errcode 22023 (invalid_parameter_value).
create function private.normalize_multipolygon(
  p_geojson jsonb,
  p_max_vertices integer,
  p_max_area_m2 double precision
)
returns extensions.geometry
language plpgsql
immutable
set search_path = ''
as $$
declare
  g extensions.geometry;
begin
  if p_geojson is null or jsonb_typeof(p_geojson) <> 'object' then
    raise exception 'boundary must be a GeoJSON object' using errcode = '22023';
  end if;
  if p_geojson ->> 'type' not in ('Polygon', 'MultiPolygon') then
    raise exception 'boundary must be a GeoJSON Polygon or MultiPolygon' using errcode = '22023';
  end if;

  begin
    g := extensions.st_geomfromgeojson(p_geojson::text);
  exception when others then
    raise exception 'boundary is not valid GeoJSON: %', sqlerrm using errcode = '22023';
  end;

  if extensions.st_npoints(g) > p_max_vertices then
    raise exception 'boundary has more than % vertices', p_max_vertices using errcode = '22023';
  end if;

  g := extensions.st_setsrid(g, 4326);
  if extensions.st_xmin(g::extensions.box3d) < -180 or extensions.st_xmax(g::extensions.box3d) > 180
     or extensions.st_ymin(g::extensions.box3d) < -90 or extensions.st_ymax(g::extensions.box3d) > 90 then
    raise exception 'boundary coordinates must be longitude/latitude' using errcode = '22023';
  end if;

  g := extensions.st_force2d(g);
  g := extensions.st_collectionextract(extensions.st_makevalid(g), 3);
  g := extensions.st_snaptogrid(g, 0.0000001);
  g := extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(g), 3));

  if g is null or extensions.st_isempty(g) then
    raise exception 'boundary has no area' using errcode = '22023';
  end if;
  if extensions.st_npoints(g) > p_max_vertices then
    raise exception 'boundary has more than % vertices', p_max_vertices using errcode = '22023';
  end if;
  if extensions.st_area(g::extensions.geography) > p_max_area_m2 then
    raise exception 'boundary is larger than % km²', p_max_area_m2 / 1e6 using errcode = '22023';
  end if;

  return g;
end;
$$;

grant execute on function private.normalize_multipolygon(jsonb, integer, double precision) to authenticated;

------------------------------------------------------------------------------
-- service_regions: an org's cities, used to frame and switch the map
------------------------------------------------------------------------------

create table public.service_regions (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  boundary extensions.geometry(multipolygon, 4326),
  center extensions.geometry(point, 4326) not null,
  bbox extensions.geometry(polygon, 4326),
  source text check (length(source) <= 40),
  source_ref text check (length(source_ref) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (boundary is null or (extensions.st_isvalid(boundary) and not extensions.st_isempty(boundary)
                              and extensions.st_npoints(boundary) <= 20000)),
  check (boundary is null or extensions.st_srid(boundary) = 4326),
  check (extensions.st_srid(center) = 4326)
);

create unique index service_regions_org_name_idx
  on public.service_regions (organization_id, lower(name));

create trigger set_updated_at
  before update on public.service_regions
  for each row execute function extensions.moddatetime(updated_at);

-- Rows are created by upsert_service_region (geometry has no column grant).
grant update (name, source, source_ref) on public.service_regions to authenticated;

------------------------------------------------------------------------------
-- service_areas: a polygon, optionally owned by a crew
------------------------------------------------------------------------------

create table public.service_areas (
  id uuid primary key default private.uuid_generate_v7(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  crew_id uuid,
  region_id uuid,
  name text not null check (length(trim(name)) between 1 and 120),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  priority integer not null default 0 check (priority between -1000 and 1000),
  boundary extensions.geometry(multipolygon, 4326) not null,
  area_m2 double precision
    generated always as (extensions.st_area(boundary::extensions.geography)) stored,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, crew_id)
    references public.crews (organization_id, id) on delete set null (crew_id),
  foreign key (organization_id, region_id)
    references public.service_regions (organization_id, id) on delete set null (region_id),
  check (extensions.st_isvalid(boundary)),
  check (extensions.st_srid(boundary) = 4326),
  check (not extensions.st_isempty(boundary)),
  check (extensions.st_npoints(boundary) <= 5000)
);

comment on column public.service_areas.priority is
  'Overlaps are allowed. A property belongs to the live area with the highest priority, then the smallest area, then the oldest.';

-- Point-in-polygon lookups within one org (btree_gist puts the org in the key).
create index service_areas_org_boundary_idx on public.service_areas using gist (organization_id, boundary);
create index service_areas_org_crew_idx on public.service_areas (organization_id, crew_id);
create index service_areas_org_region_idx on public.service_areas (organization_id, region_id);
create unique index service_areas_org_name_idx
  on public.service_areas (organization_id, lower(name)) where archived_at is null;

create trigger set_updated_at
  before update on public.service_areas
  for each row execute function extensions.moddatetime(updated_at);

-- Rows are created by upsert_service_area. boundary has no grant: it changes
-- only through upsert_service_area. Archiving is a plain update.
grant update (name, crew_id, region_id, color, priority, archived_at)
  on public.service_areas to authenticated;

------------------------------------------------------------------------------
-- service_area_rotations: optional crew per ISO weekday (1 = Monday)
------------------------------------------------------------------------------

create table public.service_area_rotations (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  service_area_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  crew_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, service_area_id, weekday),
  foreign key (organization_id, service_area_id)
    references public.service_areas (organization_id, id) on delete cascade,
  foreign key (organization_id, crew_id)
    references public.crews (organization_id, id) on delete cascade
);

create index service_area_rotations_org_crew_idx on public.service_area_rotations (organization_id, crew_id);

create trigger set_updated_at
  before update on public.service_area_rotations
  for each row execute function extensions.moddatetime(updated_at);

grant insert (organization_id, service_area_id, weekday, crew_id) on public.service_area_rotations to authenticated;
grant update (crew_id) on public.service_area_rotations to authenticated;

------------------------------------------------------------------------------
-- properties.service_area_id (derived; no column grant)
------------------------------------------------------------------------------

alter table public.properties add column service_area_id uuid;
alter table public.properties
  add constraint properties_organization_id_service_area_id_fkey
  foreign key (organization_id, service_area_id)
  references public.service_areas (organization_id, id) on delete set null (service_area_id);

comment on column public.properties.service_area_id is
  'Derived by triggers from location and the org''s live service areas. Not writable through the API.';

create index properties_org_service_area_idx on public.properties (organization_id, service_area_id);
-- Planar ST_Covers against service area polygons uses the geometry form of
-- the point; properties_org_location_idx is on the geography.
create index properties_org_location_geom_idx
  on public.properties using gist (organization_id, (location::extensions.geometry));

-- The winning live area for a point: highest priority, then smallest area,
-- then oldest, then id. ST_Covers counts a point on the boundary as inside.
-- Called only from security definer trigger functions (no grant).
create function private.service_area_at(p_org uuid, p_point extensions.geometry)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id
  from public.service_areas a
  where a.organization_id = p_org
    and a.archived_at is null
    and extensions.st_covers(a.boundary, p_point)
  order by a.priority desc, a.area_m2 asc, a.created_at asc, a.id asc
  limit 1
$$;

-- before insert, and before update of location or service_area_id: always
-- derives service_area_id, so a direct write of the column (trusted code, or
-- the on-delete-set-null action) is replaced by the computed value.
create function private.set_property_service_area()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.service_area_id := case
    when new.location is null then null
    else private.service_area_at(new.organization_id, new.location::extensions.geometry)
  end;
  return new;
end;
$$;

create trigger set_service_area
  before insert or update of location, service_area_id on public.properties
  for each row execute function private.set_property_service_area();

-- after insert, update of boundary/priority/archived_at, or delete on
-- service_areas: recompute only properties inside the old ∪ new boundary (or
-- currently pointing at this area). security definer, because
-- properties.service_area_id has no column grant. Edits to one org's areas
-- run one at a time (advisory lock), so two concurrent overlapping edits
-- can't each miss the other's polygon.
create function private.recompute_property_service_areas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_area uuid := coalesce(new.id, old.id);
  v_region extensions.geometry;
begin
  if tg_op = 'UPDATE'
     and extensions.st_orderingequals(new.boundary, old.boundary)
     and new.priority = old.priority
     and (new.archived_at is null) = (old.archived_at is null) then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('service_areas:' || v_org::text, 0));

  v_region := case tg_op
    when 'INSERT' then new.boundary
    when 'DELETE' then old.boundary
    else extensions.st_union(old.boundary, new.boundary)
  end;

  with target as (
    select p.id, private.service_area_at(p.organization_id, p.location::extensions.geometry) as area_id
    from public.properties p
    where p.organization_id = v_org
      and p.location is not null
      and (extensions.st_covers(v_region, p.location::extensions.geometry) or p.service_area_id = v_area)
  )
  update public.properties p
  set service_area_id = t.area_id
  from target t
  where p.organization_id = v_org
    and p.id = t.id
    and p.service_area_id is distinct from t.area_id;

  return null;
end;
$$;

create trigger recompute_property_service_areas
  after insert or update of boundary, priority, archived_at or delete on public.service_areas
  for each row execute function private.recompute_property_service_areas();

------------------------------------------------------------------------------
-- Row level security
------------------------------------------------------------------------------

alter table public.service_regions enable row level security;
alter table public.service_areas enable row level security;
alter table public.service_area_rotations enable row level security;

create policy "Staff can view service regions"
  on public.service_regions for select to authenticated
  using (organization_id = any (array(select private.my_org_ids())));
create policy "Admins can add service regions"
  on public.service_regions for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Admins can update service regions"
  on public.service_regions for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Admins can delete service regions"
  on public.service_regions for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

create policy "Staff can view service areas"
  on public.service_areas for select to authenticated
  using (organization_id = any (array(select private.my_org_ids())));
create policy "Admins can add service areas"
  on public.service_areas for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Admins can update service areas"
  on public.service_areas for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Admins can delete service areas"
  on public.service_areas for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

create policy "Staff can view service area rotations"
  on public.service_area_rotations for select to authenticated
  using (organization_id = any (array(select private.my_org_ids())));
create policy "Admins can add service area rotations"
  on public.service_area_rotations for insert to authenticated
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Admins can update service area rotations"
  on public.service_area_rotations for update to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))))
  with check (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));
create policy "Admins can delete service area rotations"
  on public.service_area_rotations for delete to authenticated
  using (organization_id = any (array(select private.my_org_ids('{owner,admin}'))));

------------------------------------------------------------------------------
-- Writers for the geometry columns (security definer, private)
--
-- The public upsert RPCs are security invoker. They normalize the GeoJSON,
-- then call these. These are the only code that writes service_areas.boundary
-- and the service_regions geometry, so each re-checks that the caller is an
-- owner or admin of the org (the same rule as the write policies) before
-- writing, and scopes every statement to that org.
------------------------------------------------------------------------------

create function private.save_service_area(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_crew_id uuid,
  p_region_id uuid,
  p_color text,
  p_priority integer,
  p_boundary extensions.geometry
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_org_role(p_organization_id, '{owner,admin}') then
    raise exception 'only owners and admins can edit service areas' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.service_areas (organization_id, crew_id, region_id, name, color, priority, boundary)
    values (p_organization_id, p_crew_id, p_region_id, trim(p_name), p_color, coalesce(p_priority, 0), p_boundary)
    returning id into v_id;
  else
    update public.service_areas
    set crew_id = p_crew_id,
        region_id = p_region_id,
        name = trim(p_name),
        color = p_color,
        priority = coalesce(p_priority, 0),
        boundary = p_boundary
    where organization_id = p_organization_id and id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'service area not found' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

create function private.save_service_region(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_boundary extensions.geometry,
  p_center extensions.geometry,
  p_bbox extensions.geometry,
  p_source text,
  p_source_ref text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_org_role(p_organization_id, '{owner,admin}') then
    raise exception 'only owners and admins can edit service regions' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.service_regions (organization_id, name, boundary, center, bbox, source, source_ref)
    values (p_organization_id, trim(p_name), p_boundary, p_center, p_bbox, p_source, p_source_ref)
    returning id into v_id;
  else
    update public.service_regions
    set name = trim(p_name),
        boundary = p_boundary,
        center = p_center,
        bbox = p_bbox,
        source = p_source,
        source_ref = p_source_ref
    where organization_id = p_organization_id and id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'service region not found' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

-- The invoker wrappers below call these as the API user.
grant execute on function
  private.save_service_area(uuid, uuid, text, uuid, uuid, text, integer, extensions.geometry),
  private.save_service_region(uuid, uuid, text, extensions.geometry, extensions.geometry,
                              extensions.geometry, text, text)
to authenticated;

------------------------------------------------------------------------------
-- RPCs (public, security invoker)
------------------------------------------------------------------------------

-- Creates (p_id null) or replaces a service area from GeoJSON. Returns its id.
create function public.upsert_service_area(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_crew_id uuid,
  p_region_id uuid,
  p_color text,
  p_priority integer,
  p_geojson jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.save_service_area(
    p_organization_id, p_id, p_name, p_crew_id, p_region_id, p_color, p_priority,
    private.normalize_multipolygon(p_geojson, 5000, 5e9)
  );
end;
$$;

-- Dry run of upsert_service_area: the non-archived properties whose winning
-- area would change, and the live areas the new polygon overlaps. Reads under
-- RLS, so it reports only what the caller can see.
create function public.preview_service_area(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_crew_id uuid,
  p_region_id uuid,
  p_color text,
  p_priority integer,
  p_geojson jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  g extensions.geometry := private.normalize_multipolygon(p_geojson, 5000, 5e9);
  v_old public.service_areas;
  v_region extensions.geometry;
  v_changes jsonb;
  v_overlaps jsonb;
begin
  if p_id is not null then
    select * into v_old from public.service_areas
    where organization_id = p_organization_id and id = p_id;
    if not found then
      raise exception 'service area not found' using errcode = 'P0002';
    end if;
  end if;

  v_region := case when v_old.id is null then g else extensions.st_union(g, v_old.boundary) end;

  with candidates as (
    select a.id, a.priority, a.area_m2, a.created_at, a.boundary, false as is_preview
    from public.service_areas a
    where a.organization_id = p_organization_id
      and a.archived_at is null
      and a.id is distinct from p_id
    union all
    select p_id, coalesce(p_priority, 0), extensions.st_area(g::extensions.geography),
           coalesce(v_old.created_at, now()), g, true
  ),
  moved as (
    select p.id as property_id, p.address_line1, p.service_area_id as from_area_id,
           w.id as to_area_id, coalesce(w.is_preview, false) as to_preview
    from public.properties p
    left join lateral (
      select c.id, c.is_preview
      from candidates c
      where extensions.st_covers(c.boundary, p.location::extensions.geometry)
      order by c.priority desc, c.area_m2 asc, c.created_at asc, c.id asc nulls last
      limit 1
    ) w on true
    where p.organization_id = p_organization_id
      and p.archived_at is null
      and p.location is not null
      and (extensions.st_covers(v_region, p.location::extensions.geometry)
           or (p_id is not null and p.service_area_id = p_id))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'property_id', m.property_id,
           'address_line1', m.address_line1,
           'from_area_id', m.from_area_id,
           'to_area_id', m.to_area_id,
           'to_preview', m.to_preview
         ) order by m.address_line1, m.property_id), '[]'::jsonb)
  into v_changes
  from moved m
  where (m.to_preview and (p_id is null or m.from_area_id is distinct from p_id))
     or (not m.to_preview and m.from_area_id is distinct from m.to_area_id);

  select coalesce(jsonb_agg(a.id order by a.id), '[]'::jsonb)
  into v_overlaps
  from public.service_areas a
  where a.organization_id = p_organization_id
    and a.archived_at is null
    and a.id is distinct from p_id
    and extensions.st_intersects(a.boundary, g)
    and extensions.st_relate(a.boundary, g, 'T********');

  return jsonb_build_object(
    'changes', v_changes,
    'overlapping_area_ids', v_overlaps,
    'area_m2', extensions.st_area(g::extensions.geography),
    'vertex_count', extensions.st_npoints(g),
    'geometry', extensions.st_asgeojson(g, 7)::jsonb
  );
end;
$$;

-- The org's service areas as a GeoJSON FeatureCollection. property_count
-- counts non-archived properties; it reads properties under RLS, so it is 0
-- for workers (who have no properties policy).
create function public.service_areas_geojson(
  p_organization_id uuid,
  p_include_archived boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'id', a.id,
      'geometry', extensions.st_asgeojson(a.boundary, 7)::jsonb,
      'properties', jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'crew_id', a.crew_id,
        'region_id', a.region_id,
        'color', a.color,
        'priority', a.priority,
        'area_m2', a.area_m2,
        'archived_at', a.archived_at,
        'updated_at', a.updated_at,
        'property_count', (
          select count(*) from public.properties p
          where p.organization_id = a.organization_id
            and p.service_area_id = a.id
            and p.archived_at is null
        ),
        'overlapping_area_ids', coalesce((
          select jsonb_agg(b.id order by b.id) from public.service_areas b
          where b.organization_id = a.organization_id
            and b.id <> a.id
            and b.archived_at is null
            and a.archived_at is null
            and extensions.st_intersects(a.boundary, b.boundary)
            and extensions.st_relate(a.boundary, b.boundary, 'T********')
        ), '[]'::jsonb),
        'rotations', coalesce((
          select jsonb_agg(jsonb_build_object('weekday', r.weekday, 'crew_id', r.crew_id) order by r.weekday)
          from public.service_area_rotations r
          where r.organization_id = a.organization_id and r.service_area_id = a.id
        ), '[]'::jsonb)
      )
    ) order by a.priority desc, a.name), '[]'::jsonb)
  )
  from public.service_areas a
  where a.organization_id = p_organization_id
    and (p_include_archived or a.archived_at is null)
$$;

-- Property counts per live area, plus geocoded properties no live area covers
-- and properties with no location. Non-archived properties only. Reads under
-- RLS (office staff see properties).
create function public.service_area_coverage(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'crew_id', a.crew_id,
        'property_count', (
          select count(*) from public.properties p
          where p.organization_id = a.organization_id
            and p.service_area_id = a.id
            and p.archived_at is null
        )
      ) order by a.priority desc, a.name)
      from public.service_areas a
      where a.organization_id = p_organization_id and a.archived_at is null
    ), '[]'::jsonb),
    'covered_count', (
      select count(*) from public.properties p
      where p.organization_id = p_organization_id and p.archived_at is null
        and p.service_area_id is not null
    ),
    'uncovered_count', (
      select count(*) from public.properties p
      where p.organization_id = p_organization_id and p.archived_at is null
        and p.location is not null and p.service_area_id is null
    ),
    'no_location_count', (
      select count(*) from public.properties p
      where p.organization_id = p_organization_id and p.archived_at is null
        and p.location is null
    )
  )
$$;

-- Replaces an area's weekday → crew map. p_rotations is a JSON array of
-- {"weekday": 1-7, "crew_id": uuid}; an empty array clears it. Runs under
-- RLS (owner/admin write).
create function public.set_service_area_rotations(
  p_organization_id uuid,
  p_service_area_id uuid,
  p_rotations jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_rotations is null or jsonb_typeof(p_rotations) <> 'array' then
    raise exception 'rotations must be a JSON array' using errcode = '22023';
  end if;

  perform 1 from public.service_areas
  where organization_id = p_organization_id and id = p_service_area_id;
  if not found then
    raise exception 'service area not found' using errcode = 'P0002';
  end if;

  delete from public.service_area_rotations
  where organization_id = p_organization_id and service_area_id = p_service_area_id;

  insert into public.service_area_rotations (organization_id, service_area_id, weekday, crew_id)
  select p_organization_id, p_service_area_id, r.weekday, r.crew_id
  from jsonb_to_recordset(p_rotations) as r (weekday smallint, crew_id uuid);
end;
$$;

-- Creates (p_id null) or replaces a region. p_boundary is an optional GeoJSON
-- Polygon/MultiPolygon, p_center an optional GeoJSON Point, and p_bbox an
-- optional [west, south, east, north]. center defaults to a point on the
-- boundary and bbox to the boundary's envelope; one of p_boundary or
-- p_center is required.
create function public.upsert_service_region(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_boundary jsonb,
  p_center jsonb,
  p_bbox double precision[],
  p_source text,
  p_source_ref text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_boundary extensions.geometry;
  v_center extensions.geometry;
  v_bbox extensions.geometry;
begin
  if p_boundary is not null then
    v_boundary := private.normalize_multipolygon(p_boundary, 20000, 2e10);
  end if;

  if p_center is not null then
    if p_center ->> 'type' is distinct from 'Point' then
      raise exception 'center must be a GeoJSON Point' using errcode = '22023';
    end if;
    begin
      v_center := extensions.st_setsrid(extensions.st_geomfromgeojson(p_center::text), 4326);
    exception when others then
      raise exception 'center is not valid GeoJSON: %', sqlerrm using errcode = '22023';
    end;
    if extensions.st_x(v_center) not between -180 and 180 or extensions.st_y(v_center) not between -90 and 90 then
      raise exception 'center must be longitude/latitude' using errcode = '22023';
    end if;
  elsif v_boundary is not null then
    v_center := extensions.st_pointonsurface(v_boundary);
  else
    raise exception 'a region needs a boundary or a center' using errcode = '22023';
  end if;

  if p_bbox is not null then
    if array_length(p_bbox, 1) is distinct from 4
       or p_bbox[1] not between -180 and 180 or p_bbox[3] not between -180 and 180
       or p_bbox[2] not between -90 and 90 or p_bbox[4] not between -90 and 90
       or p_bbox[1] >= p_bbox[3] or p_bbox[2] >= p_bbox[4] then
      raise exception 'bbox must be [west, south, east, north]' using errcode = '22023';
    end if;
    v_bbox := extensions.st_makeenvelope(p_bbox[1], p_bbox[2], p_bbox[3], p_bbox[4], 4326);
  elsif v_boundary is not null then
    v_bbox := extensions.st_envelope(v_boundary);
  end if;

  return private.save_service_region(
    p_organization_id, p_id, p_name, v_boundary, v_center, v_bbox, p_source, p_source_ref
  );
end;
$$;

-- The org's regions as a FeatureCollection. geometry is the boundary (null
-- when only a center is known); properties carry center [lon, lat] and bbox
-- [west, south, east, north].
create function public.service_regions_geojson(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'id', r.id,
      'geometry', extensions.st_asgeojson(r.boundary, 7)::jsonb,
      'properties', jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'center', jsonb_build_array(round(extensions.st_x(r.center)::numeric, 7),
                                    round(extensions.st_y(r.center)::numeric, 7)),
        'bbox', case when r.bbox is null then null else jsonb_build_array(
          round(extensions.st_xmin(r.bbox::extensions.box3d)::numeric, 7),
          round(extensions.st_ymin(r.bbox::extensions.box3d)::numeric, 7),
          round(extensions.st_xmax(r.bbox::extensions.box3d)::numeric, 7),
          round(extensions.st_ymax(r.bbox::extensions.box3d)::numeric, 7)) end,
        'source', r.source,
        'source_ref', r.source_ref,
        'updated_at', r.updated_at
      )
    ) order by r.name), '[]'::jsonb)
  )
  from public.service_regions r
  where r.organization_id = p_organization_id
$$;

revoke execute on function
  public.upsert_service_area(uuid, uuid, text, uuid, uuid, text, integer, jsonb),
  public.preview_service_area(uuid, uuid, text, uuid, uuid, text, integer, jsonb),
  public.service_areas_geojson(uuid, boolean),
  public.service_area_coverage(uuid),
  public.set_service_area_rotations(uuid, uuid, jsonb),
  public.upsert_service_region(uuid, uuid, text, jsonb, jsonb, double precision[], text, text),
  public.service_regions_geojson(uuid)
from public, anon, service_role;
grant execute on function
  public.upsert_service_area(uuid, uuid, text, uuid, uuid, text, integer, jsonb),
  public.preview_service_area(uuid, uuid, text, uuid, uuid, text, integer, jsonb),
  public.service_areas_geojson(uuid, boolean),
  public.service_area_coverage(uuid),
  public.set_service_area_rotations(uuid, uuid, jsonb),
  public.upsert_service_region(uuid, uuid, text, jsonb, jsonb, double precision[], text, text),
  public.service_regions_geojson(uuid)
to authenticated;
