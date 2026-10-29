-- Demo data: an Edmonton landscaping company with a crew, clients,
-- recurring and one-off work, and a draft quote.
--
-- Idempotent: does nothing if the 'absolute-demo' org exists. The first
-- auth user becomes its owner (sign up first). Dates are relative to today,
-- so the demo always has upcoming visits.
--
-- Run with the Supabase MCP execute_sql tool, or psql. To remove it:
--   delete from public.organizations where slug = 'absolute-demo';
--   (delete jobs, quotes, and clients first; restrict FKs protect them.)

do $$
declare
  v_owner uuid;
  v_org uuid;
  v_gst uuid;
  v_crew uuid;
  v_wes uuid;
  v_riley uuid;
  v_mow uuid;
  v_cleanup uuid;
  v_hedge uuid;
  v_jane uuid;
  v_hoa uuid;
  v_bob uuid;
  v_jane_prop uuid;
  v_hoa_prop uuid;
  v_bob_prop uuid;
  v_job uuid;
  v_quote uuid;
  v_today date := (now() at time zone 'America/Edmonton')::date;
begin
  if exists (select 1 from public.organizations where slug = 'absolute-demo') then
    raise notice 'demo org already exists; skipping';
    return;
  end if;

  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    raise notice 'no auth users yet; sign up first, then re-run the seed';
    return;
  end if;

  insert into public.organizations (name, slug, timezone, email, phone, address_line1, city, region, postal_code, settings)
  values ('Absolute Landscaping (Demo)', 'absolute-demo', 'America/Edmonton', 'office@example.com', '780-555-0100',
          '10020 101A Ave NW', 'Edmonton', 'AB', 'T5J 3G2', '{"visit_horizon_weeks": 8}')
  returning id into v_org;

  -- Staff: the owner has a login. The dispatcher and crew don't yet
  -- (invite them later).
  insert into public.organization_members (organization_id, user_id, role, display_name, email)
  select v_org, v_owner, 'owner', coalesce(p.full_name, u.email), lower(u.email)
  from auth.users u left join public.profiles p on p.id = u.id where u.id = v_owner;
  insert into public.organization_members (organization_id, role, display_name, color)
  values (v_org, 'dispatcher', 'Dana Dispatch', '#2563eb');
  insert into public.organization_members (organization_id, role, display_name, color)
  values (v_org, 'worker', 'Wes Worker', '#16a34a') returning id into v_wes;
  insert into public.organization_members (organization_id, role, display_name, color)
  values (v_org, 'worker', 'Riley Crew', '#ca8a04') returning id into v_riley;
  insert into public.member_pay_rates (organization_id, member_id, hourly_rate_cents, effective_from) values
    (v_org, v_wes, 2800, v_today - 90),
    (v_org, v_riley, 2400, v_today - 90);

  -- Catalog and tax (Alberta: GST only).
  insert into public.tax_rates (organization_id, name, percentage, registration_number)
  values (v_org, 'GST', 5, '123456789RT0001') returning id into v_gst;
  insert into public.services (organization_id, name, unit, default_price_cents, default_duration_minutes)
  values (v_org, 'Weekly mowing', 'visit', 4500, 45) returning id into v_mow;
  insert into public.services (organization_id, name, unit, default_price_cents, default_duration_minutes)
  values (v_org, 'Spring cleanup', 'monthly', 25000, 180) returning id into v_cleanup;
  insert into public.services (organization_id, name, unit, default_price_cents, default_duration_minutes)
  values (v_org, 'Hedge trimming', 'hour', 6000, 60) returning id into v_hedge;
  insert into public.service_default_taxes (organization_id, service_id, tax_rate_id)
  select v_org, s, v_gst from unnest(array[v_mow, v_cleanup, v_hedge]) s;

  -- Crew.
  insert into public.crews (organization_id, name, color, vehicle, default_start_location, max_work_minutes)
  values (v_org, 'Truck 1', '#16a34a', 'F-150 #1', 'SRID=4326;POINT(-113.4909 53.5444)', 480)
  returning id into v_crew;
  insert into public.crew_members (organization_id, crew_id, member_id, is_lead) values
    (v_org, v_crew, v_wes, true), (v_org, v_crew, v_riley, false);

  -- Clients and geocoded properties.
  insert into public.clients (organization_id, kind, display_name, first_name, last_name, email, phone, lead_source)
  values (v_org, 'individual', 'Jane Smith', 'Jane', 'Smith', 'jane@example.com', '780-555-0111', 'Referral')
  returning id into v_jane;
  insert into public.properties (organization_id, client_id, address_line1, city, region, postal_code, location, geocoded_at, geocode_source, access_notes)
  values (v_org, v_jane, '11220 83 Ave NW', 'Edmonton', 'AB', 'T6G 0T8', 'SRID=4326;POINT(-113.5219 53.5186)', now(), 'manual', 'Side gate, no dog')
  returning id into v_jane_prop;

  insert into public.clients (organization_id, kind, display_name, company_name, email, phone)
  values (v_org, 'company', 'Oakridge HOA', 'Oakridge Homeowners Association', 'board@example.com', '780-555-0122')
  returning id into v_hoa;
  insert into public.client_contacts (organization_id, client_id, name, role, email, is_primary, receives_invoices)
  values (v_org, v_hoa, 'Pat Chen', 'Property manager', 'pat@example.com', true, true);
  insert into public.properties (organization_id, client_id, name, address_line1, city, region, postal_code, location, geocoded_at, geocode_source, lot_size_sqft)
  values (v_org, v_hoa, 'Common green', '5400 Riverbend Rd NW', 'Edmonton', 'AB', 'T6H 5J6', 'SRID=4326;POINT(-113.5675 53.4861)', now(), 'manual', 40000)
  returning id into v_hoa_prop;

  insert into public.clients (organization_id, kind, display_name, first_name, last_name, email)
  values (v_org, 'individual', 'Bob Lee', 'Bob', 'Lee', 'bob@example.com')
  returning id into v_bob;
  insert into public.properties (organization_id, client_id, address_line1, city, region, postal_code, location, geocoded_at, geocode_source)
  values (v_org, v_bob, '9315 142 St NW', 'Edmonton', 'AB', 'T5R 0M8', 'SRID=4326;POINT(-113.5695 53.5324)', now(), 'manual')
  returning id into v_bob_prop;

  -- Jane: weekly Tuesday mowing, billed per visit.
  insert into public.jobs (organization_id, client_id, property_id, title, kind, rrule, start_date, window_start, window_minutes,
                           visit_duration_minutes, preferred_crew_id, billing_mode)
  values (v_org, v_jane, v_jane_prop, 'Weekly mowing', 'recurring', 'FREQ=WEEKLY;BYDAY=TU', v_today, '08:00', 240,
          45, v_crew, 'per_visit')
  returning id into v_job;
  with l as (
    insert into public.job_line_items (organization_id, job_id, service_id, position, description, unit_price_cents)
    values (v_org, v_job, v_mow, 1, 'Weekly mowing', 4500)
    returning id
  )
  insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id) select v_org, id, v_gst from l;
  -- Stand-in for the app-side RRULE expander: the next 8 Tuesdays.
  perform public.generate_visits(v_job,
    array(select d::date from generate_series(v_today, v_today + 55, interval '1 day') d where extract(isodow from d) = 2),
    v_today + 55);

  -- Oakridge HOA: weekly Thursday mowing, billed monthly.
  insert into public.jobs (organization_id, client_id, property_id, title, kind, rrule, start_date, visit_duration_minutes,
                           preferred_crew_id, billing_mode, billing_period)
  values (v_org, v_hoa, v_hoa_prop, 'Common green maintenance', 'recurring', 'FREQ=WEEKLY;BYDAY=TH', v_today, 120,
          v_crew, 'periodic', 'monthly')
  returning id into v_job;
  with l as (
    insert into public.job_line_items (organization_id, job_id, service_id, position, description, quantity, unit_price_cents)
    values (v_org, v_job, v_mow, 1, 'Mowing and trimming (common green)', 3, 4500)
    returning id
  )
  insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id) select v_org, id, v_gst from l;
  perform public.generate_visits(v_job,
    array(select d::date from generate_series(v_today, v_today + 55, interval '1 day') d where extract(isodow from d) = 4),
    v_today + 55);

  -- Bob: a one-off spring cleanup next week (its visit is created
  -- automatically).
  insert into public.jobs (organization_id, client_id, property_id, title, start_date, window_start, window_minutes, visit_duration_minutes)
  values (v_org, v_bob, v_bob_prop, 'Spring cleanup', v_today + 7, '13:00', 240, 180)
  returning id into v_job;
  with l as (
    insert into public.job_line_items (organization_id, job_id, service_id, position, description, unit_price_cents)
    values (v_org, v_job, v_cleanup, 1, 'Spring cleanup', 25000)
    returning id
  )
  insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id) select v_org, id, v_gst from l;

  -- Bob: a draft quote for hedge trimming, with an optional add-on.
  insert into public.quotes (organization_id, client_id, property_id, title, message, valid_until)
  values (v_org, v_bob, v_bob_prop, 'Hedge trimming', 'Front and back hedges, debris hauled away.', v_today + 30)
  returning id into v_quote;
  insert into public.quote_line_items (organization_id, quote_id, service_id, position, description, quantity, unit_price_cents, is_optional)
  values
    (v_org, v_quote, v_hedge, 1, 'Hedge trimming (est. 3 hours)', 3, 6000, false),
    (v_org, v_quote, null, 2, 'Shape ornamental shrubs', 1, 8000, true);
  insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
  select v_org, id, v_gst from public.quote_line_items where quote_id = v_quote;

  raise notice 'seeded demo org %', v_org;
end;
$$;
