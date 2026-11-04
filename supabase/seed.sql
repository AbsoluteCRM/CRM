-- Demo data: two landscaping and snow-removal businesses in Edmonton.
--
--   absolute-demo   Absolute Landscaping (Demo): the full demo. Staff and
--                   crews, a seasonal service catalog, 33 clients, requests in
--                   every status, quotes in every status (with revisions),
--                   recurring and one-off jobs with visits from three weeks
--                   ago to eight weeks ahead, today's and tomorrow's routes,
--                   and invoices with payments.
--   northside-demo  Northside Snow & Yard (Demo): a small second tenant, so
--                   switching organizations shows that data stays separate.
--
-- See docs/database/seed.md for what it creates, how to run it, and how to
-- remove it (supabase/seed/teardown.sql).
--
-- Owner: the first user in auth.users (sign up first) owns both orgs. To pick
-- another user, run this first in the same session or execute_sql call:
--   select set_config('seed.owner_email', 'you@example.com', false);
--
-- Idempotent: each org is skipped (with a notice) if its slug already exists.
-- Dates are relative to today in America/Edmonton, and the recurring work
-- follows the season: lawn mowing from April to October, snow clearing
-- otherwise.
--
-- How it writes: as the database owner (postgres), so RLS doesn't apply, but
-- with request.jwt.claims set to the owner for the duration of each block.
-- That lets the app's own SQL functions run as they do for a signed-in
-- owner: create_quote_draft, send_quote, generate_visits,
-- create_invoice_for_visits, move_crew_member and set_crew_lead. Quote
-- approval and decline go through the token functions the public quote page
-- uses (portal_token_approve / portal_token_decline) with the claims cleared,
-- as the service role calls them. Totals, taxes, document numbers, visit
-- windows and request statuses all come from the schema's triggers and
-- functions; no derived column is written directly. Requests are inserted
-- directly (as staff-entered requests), because submit_request rate-limits
-- to 5 submissions per IP per hour.
--
-- Run with the Supabase MCP execute_sql tool (pass the whole file) or
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql

------------------------------------------------------------------------------
-- absolute-demo
------------------------------------------------------------------------------

do $$
declare
  v_slug constant text := 'absolute-demo';
  v_owner_email text := lower(nullif(trim(current_setting('seed.owner_email', true)), ''));
  v_owner uuid;
  v_claims text;
  v_org uuid;
  v_tz constant text := 'America/Edmonton';
  v_today date := (now() at time zone 'America/Edmonton')::date;
  v_month int := extract(month from (now() at time zone 'America/Edmonton'))::int;
  v_green boolean;
  -- The season's recurring service and its arrival window.
  v_rec_name text;
  v_rec_window time;
  v_rec_window_minutes int;
  v_cleanup_name text;
  v_gst uuid;
  v_c jsonb;   -- client display_name -> id
  v_s jsonb;   -- active service name -> id
  v_m jsonb;   -- member display_name -> id
  v_crews jsonb; -- crew name -> id
  v_member uuid;
  v_crew uuid;
  v_client uuid;
  v_prop uuid;
  v_exempt boolean;
  v_job uuid;
  v_line uuid;
  v_title text;
  v_rrule text;
  v_start date;
  v_dates date[];
  v_req uuid;
  v_q uuid;
  v_q2 uuid;
  v_hash text;
  v_tok uuid;
  v_flow text;
  v_svc text;
  v_inv uuid;
  v_vis uuid[];
  v_d date;
  v_route uuid;
  cr record;
  jr record;
  x jsonb;
  v_requests jsonb;
begin
  if exists (select 1 from public.organizations where slug = v_slug) then
    raise notice '% already exists; skipping (run supabase/seed/teardown.sql first to re-seed)', v_slug;
    return;
  end if;

  if v_owner_email is not null then
    select id into v_owner from auth.users where lower(email) = v_owner_email;
    if v_owner is null then
      raise exception 'seed.owner_email %: no auth user has that email', v_owner_email;
    end if;
  else
    select id into v_owner from auth.users order by created_at, id limit 1;
  end if;
  if v_owner is null then
    raise notice 'no auth users yet; sign up first, then re-run the seed';
    return;
  end if;

  -- Act as the owner for auth.uid(), so the app's functions run as they do
  -- for a signed-in owner (transaction-local).
  v_claims := jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_claims, true);

  v_green := v_month between 4 and 10;
  v_rec_name := case when v_green then 'Lawn mowing' else 'Snow clearing' end;
  v_rec_window := case when v_green then time '08:00' else time '05:00' end;
  v_rec_window_minutes := case when v_green then 240 else 180 end;
  v_cleanup_name := case when v_month between 2 and 6 then 'Spring cleanup' else 'Fall cleanup' end;

  ----------------------------------------------------------------------------
  -- Organization and staff
  ----------------------------------------------------------------------------

  insert into public.organizations (name, slug, timezone, email, phone, address_line1, city, region,
                                    postal_code, settings)
  values ('Absolute Landscaping (Demo)', v_slug, v_tz, 'office@absolute-demo.example.com', '780-555-0100',
          '10020 101A Ave NW', 'Edmonton', 'AB', 'T5J 3G2',
          '{"visit_horizon_weeks": 8, "default_payment_terms_days": 15}')
  returning id into v_org;

  -- The owner has a login. Everyone else is a member without one (crew
  -- members often never sign in); invite them from the Team page to link a
  -- login.
  insert into public.organization_members (organization_id, user_id, role, display_name, email, color)
  select v_org, u.id, 'owner', coalesce(nullif(trim(p.full_name), ''), u.email, 'Owner'), lower(u.email), '#7c3aed'
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = v_owner;

  insert into public.organization_members (organization_id, role, status, display_name, email, phone, color, home_location)
  select v_org, m.role::public.org_role, m.status::public.member_status, m.name, m.email, m.phone, m.color,
         case when m.lon is null then null
              else extensions.st_setsrid(extensions.st_makepoint(m.lon, m.lat), 4326)::extensions.geography end
  from (values
    ('admin',      'active',   'Alex Martin',     'alex.martin@example.com',     '780-555-0101', '#0f766e', null::float8, null::float8),
    ('dispatcher', 'active',   'Dana Ruiz',       'dana.ruiz@example.com',       '780-555-0102', '#2563eb', null, null),
    ('worker',     'active',   'Wes Kowalski',    'wes.kowalski@example.com',    '780-555-0103', '#16a34a', -113.5950, 53.5150),
    ('worker',     'active',   'Riley Tran',      'riley.tran@example.com',      '780-555-0104', '#ca8a04', -113.5400, 53.4800),
    ('worker',     'active',   'Sam Okafor',      'sam.okafor@example.com',      '780-555-0105', '#dc2626', -113.6100, 53.5400),
    ('worker',     'active',   'Priya Nair',      'priya.nair@example.com',      '780-555-0106', '#9333ea', -113.4500, 53.5400),
    ('worker',     'active',   'Jordan Lee',      'jordan.lee@example.com',      '780-555-0107', '#0891b2', -113.4300, 53.4700),
    ('worker',     'active',   'Mateo Silva',     'mateo.silva@example.com',     '780-555-0108', '#ea580c', -113.4700, 53.5600),
    ('worker',     'active',   'Hannah Berg',     'hannah.berg@example.com',     '780-555-0109', '#4f46e5', -113.5000, 53.4600),
    ('worker',     'active',   'Owen Fraser',     'owen.fraser@example.com',     '780-555-0110', '#65a30d', -113.5200, 53.6000),
    ('worker',     'active',   'Casey Dubois',    'casey.dubois@example.com',    '780-555-0111', '#db2777', null, null),
    ('worker',     'invited',  'Taylor Brooks',   'taylor.brooks@example.com',   '780-555-0112', '#78716c', null, null),
    ('worker',     'disabled', 'Morgan Pike',     'morgan.pike@example.com',     '780-555-0113', '#a8a29e', null, null)
  ) as m(role, status, name, email, phone, color, lon, lat);

  select jsonb_object_agg(display_name, id) into v_m
  from public.organization_members where organization_id = v_org;

  insert into public.member_pay_rates (organization_id, member_id, hourly_rate_cents, effective_from, notes)
  select v_org, (v_m ->> p.name)::uuid, p.cents, v_today - p.days, p.notes
  from (values
    ('Wes Kowalski', 3000, 400, 'Crew lead'),
    ('Riley Tran',   2400, 400, null),
    ('Sam Okafor',   2300, 200, null),
    ('Priya Nair',   2900, 400, 'Crew lead'),
    ('Jordan Lee',   2400, 300, null),
    ('Mateo Silva',  2300, 120, null),
    ('Hannah Berg',  3100, 500, 'Crew lead, plow certified'),
    ('Owen Fraser',  2500, 300, null),
    ('Casey Dubois', 2200,  30, 'Seasonal'),
    ('Wes Kowalski', 3200,  60, 'Raise after season review')
  ) as p(name, cents, days, notes);

  -- Taylor accepted nothing yet: an invitation linked to their member row.
  -- Two more invitations: one pending (no member row yet), one expired.
  -- The tokens are random and never stored, so these links can't be used.
  insert into public.organization_invitations (organization_id, email, role, member_id, token_hash, expires_at, created_at)
  values
    (v_org, 'taylor.brooks@example.com', 'worker', (v_m ->> 'Taylor Brooks')::uuid,
     encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), now() + interval '5 days', now() - interval '2 days'),
    (v_org, 'jamie.ortiz@example.com', 'dispatcher', null,
     encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), now() + interval '6 days', now() - interval '1 day'),
    (v_org, 'sam.lowe@example.com', 'worker', null,
     encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), now() - interval '2 days', now() - interval '9 days');

  ----------------------------------------------------------------------------
  -- Crews (through the crew builder's functions)
  ----------------------------------------------------------------------------

  insert into public.crews (organization_id, name, color, vehicle, default_start_location, default_start_time, max_work_minutes)
  values
    (v_org, 'Truck 1 - West',       '#16a34a', 'F-150 #1 + 14 ft trailer', 'SRID=4326;POINT(-113.4909 53.5444)', '07:30', 480),
    (v_org, 'Truck 2 - East',       '#2563eb', 'F-250 #2 + 16 ft trailer', 'SRID=4326;POINT(-113.4909 53.5444)', '08:00', 480),
    (v_org, 'Truck 3 - Commercial', '#ea580c', 'F-350 #3 with plow',      'SRID=4326;POINT(-113.4909 53.5444)', '06:00', 540);

  select jsonb_object_agg(name, id) into v_crews from public.crews where organization_id = v_org;

  for cr in
    select * from (values
      ('Truck 1 - West',       'Wes Kowalski', true),
      ('Truck 1 - West',       'Riley Tran',   false),
      ('Truck 1 - West',       'Sam Okafor',   false),
      ('Truck 2 - East',       'Priya Nair',   true),
      ('Truck 2 - East',       'Jordan Lee',   false),
      ('Truck 2 - East',       'Mateo Silva',  false),
      ('Truck 3 - Commercial', 'Hannah Berg',  true),
      ('Truck 3 - Commercial', 'Owen Fraser',  false)
    ) as t(crew, member, lead)
  loop
    perform public.move_crew_member(v_org, (v_m ->> cr.member)::uuid, (v_crews ->> cr.crew)::uuid);
    if cr.lead then
      perform public.set_crew_lead(v_org, (v_crews ->> cr.crew)::uuid, (v_m ->> cr.member)::uuid);
    end if;
  end loop;
  -- Casey Dubois stays unassigned (the crew builder's bench).

  ----------------------------------------------------------------------------
  -- Tax and service catalog
  ----------------------------------------------------------------------------

  -- Alberta: GST only.
  insert into public.tax_rates (organization_id, name, percentage, registration_number)
  values (v_org, 'GST', 5, '123456789RT0001')
  returning id into v_gst;

  insert into public.services (organization_id, name, description, unit, default_price_cents,
                               default_duration_minutes, color, equipment, frequencies,
                               season_start_month, season_end_month, precipitation_type,
                               precipitation_action, archived_at)
  select v_org, s.name, s.descr, s.unit::public.service_unit, s.price, s.minutes, s.color, s.equipment,
         s.freqs::public.service_frequency[], s.m1, s.m2,
         s.ptype::public.service_precipitation_type, s.pact::public.service_precipitation_action,
         case when s.archived then now() - interval '200 days' end
  from (values
    ('Lawn mowing', 'Mow, trim edges and blow off hard surfaces. Clippings mulched.',
     'visit', 5500, 45, '#16a34a', '{Mower,String trimmer,Blower}'::text[], '{weekly,biweekly}'::text[],
     5::smallint, 10::smallint, 'rain', 'reschedule', false),
    ('Spring cleanup', 'Rake out winter debris, pick up sand along the curb, first cut.',
     'monthly', 32500, 180, '#84cc16', '{Rake,Blower,Trailer}', '{one_time}', 4, 5, 'none', 'none', false),
    ('Fall cleanup', 'Leaf removal from lawn and beds, final cut, haul away.',
     'monthly', 29500, 180, '#d97706', '{Blower,Mulching mower,Trailer}', '{one_time}', 9, 11, 'none', 'none', false),
    ('Core aeration', 'Core aeration of the whole lawn. Mark sprinkler heads beforehand.',
     'visit', 8900, 60, '#22c55e', '{Aerator}', '{one_time}', 4, 10, 'rain', 'reschedule', false),
    ('Hedge trimming', 'Shape and trim hedges and shrubs, clippings hauled away.',
     'hour', 6500, 60, '#15803d', '{Hedge trimmer,Ladder,Tarps}', '{one_time,monthly}', 5, 9, 'rain', 'reschedule', false),
    ('Fertilizer program', 'Four seasonal granular applications with weed control.',
     'visit', 6900, 30, '#a3e635', '{Broadcast spreader}', '{monthly}', 5, 9, 'rain', 'reschedule', false),
    ('Snow clearing', 'Driveway and walks cleared after 5 cm of snowfall.',
     'visit', 6500, 30, '#0ea5e9', '{Plow truck,Snow blower,Shovels}', '{weekly,one_time}', 11, 3, 'snow', 'schedule', false),
    ('Sidewalk sanding', 'Sand and ice melt on walks and steps.',
     'bag', 2500, 15, '#38bdf8', '{Spreader,Ice melt}', '{one_time,weekly}', 11, 3, 'snow', 'schedule', false),
    ('Mulch installation', 'Shredded cedar mulch, 3 inch depth, beds edged.',
     'yard', 9500, 60, '#92400e', '{Wheelbarrow,Trailer}', '{one_time}', 5, 9, 'rain', 'reschedule', false),
    ('Sod installation', 'Grade, prep and lay Kentucky bluegrass sod.',
     'sqft', 250, 240, '#4d7c0f', '{Sod cutter,Roller,Trailer}', '{one_time}', 5, 9, 'rain', 'reschedule', false),
    ('Gutter cleaning', 'Hand-clean gutters and flush downspouts.',
     'linear_ft', 150, 90, '#64748b', '{Ladder,Gutter scoop}', '{one_time}', null, null, 'any', 'reschedule', false),
    ('Holiday lighting', 'Install, maintain and take down roofline lights.',
     'monthly', 45000, 240, '#e11d48', '{Ladder,Light clips}', '{one_time}', 11, 1, 'none', 'none', false),
    ('Tree planting', 'Discontinued: now referred to a partner arborist.',
     'hour', 8500, 120, '#166534', '{Auger}', '{one_time}', 5, 9, 'none', 'none', true)
  ) as s(name, descr, unit, price, minutes, color, equipment, freqs, m1, m2, ptype, pact, archived);

  insert into public.service_default_taxes (organization_id, service_id, tax_rate_id)
  select v_org, id, v_gst from public.services where organization_id = v_org;

  select jsonb_object_agg(name, id) into v_s
  from public.services where organization_id = v_org and archived_at is null;

  ----------------------------------------------------------------------------
  -- Clients, contacts and properties
  ----------------------------------------------------------------------------

  insert into public.clients (organization_id, kind, status, display_name, first_name, last_name, company_name,
                              email, phone, billing_address_line1, billing_city, billing_region,
                              billing_postal_code, billing_country, lead_source, tags, notes, tax_exempt,
                              archived_at)
  select v_org, c.kind::public.client_kind, c.status::public.client_status, c.name,
         case when c.kind = 'individual' then split_part(c.name, ' ', 1) end,
         case when c.kind = 'individual' then substr(c.name, length(split_part(c.name, ' ', 1)) + 2) end,
         case when c.kind = 'company' then c.company end,
         c.email, c.phone,
         case when c.kind = 'company' then c.address end,
         case when c.kind = 'company' then 'Edmonton' end,
         case when c.kind = 'company' then 'AB' end,
         case when c.kind = 'company' then c.postal end,
         case when c.kind = 'company' then 'CA' end,
         c.source, c.tags, c.notes, c.exempt,
         case when c.archived then now() - interval '60 days' end
  from (values
    ('individual', 'active',   'Jane Smith',        null, 'jane.smith@example.com',      '780-555-0121', 'Referral',       '{residential,weekly}'::text[], 'Prefers a text the evening before.', false, false, '11220 83 Ave NW', 'T6G 0T8'),
    ('individual', 'active',   'Bob Lee',           null, 'bob.lee@example.com',         '780-555-0122', 'Website',        '{residential}',          null, false, false, '9315 142 St NW', 'T5R 0M8'),
    ('individual', 'active',   'Priya Sharma',      null, 'priya.sharma@example.com',    '780-555-0123', 'Google',         '{residential,weekly}',   null, false, false, '6315 106 St NW', 'T6H 2V3'),
    ('individual', 'active',   'Marcus Chen',       null, 'marcus.chen@example.com',     '780-555-0124', 'Door hanger',    '{residential,weekly}',   'Gate code changes monthly; check notes on the property.', false, false, '5824 Terwillegar Blvd NW', 'T6R 0E2'),
    ('individual', 'active',   'Elena Petrova',     null, 'elena.petrova@example.com',   '780-555-0125', 'Referral',       '{residential,biweekly}', null, false, false, '1352 Windermere Way SW', 'T6W 2J8'),
    ('individual', 'active',   'Grace Whitford',    null, 'grace.whitford@example.com',  '780-555-0126', 'Home show',      '{residential}',          null, false, false, '10215 133 St NW', 'T5N 2A4'),
    ('individual', 'active',   'Noah Campbell',     null, 'noah.campbell@example.com',   '780-555-0127', 'Google',         '{residential,weekly}',   null, false, false, '11615 64 St NW', 'T5W 4J3'),
    ('individual', 'active',   'Sofia Rossi',       null, 'sofia.rossi@example.com',     '780-555-0128', 'Referral',       '{residential,weekly}',   null, false, false, '9620 83 St NW', 'T6C 2Y9'),
    ('individual', 'active',   'Ava Thompson',      null, 'ava.thompson@example.com',    '780-555-0129', 'Facebook',       '{residential,biweekly}', null, false, false, '9311 78 Ave NW', 'T6C 0N4'),
    ('individual', 'active',   'Hiroshi Tanaka',    null, 'hiroshi.tanaka@example.com',  '780-555-0130', 'Website',        '{residential,weekly}',   null, false, false, '11008 125 St NW', 'T5M 0M3'),
    ('individual', 'active',   'Fatima Haddad',     null, 'fatima.haddad@example.com',   '780-555-0131', 'Google',         '{residential,weekly}',   'Pays by e-transfer.', false, false, '9620 145 St NW', 'T5N 2W8'),
    ('individual', 'active',   'Daniel Okoye',      null, 'daniel.okoye@example.com',    '780-555-0132', 'Repeat client',  '{residential}',          null, false, false, '2240 Rutherford Rd SW', 'T6W 0J2'),
    ('individual', 'active',   'Mei Wong',          null, 'mei.wong@example.com',        '780-555-0133', 'Referral',       '{residential}',          null, false, false, '1520 Summerside Dr SW', 'T6X 0K9'),
    ('individual', 'active',   'Carlos Mendes',     null, 'carlos.mendes@example.com',   '780-555-0134', 'Google',         '{residential}',          null, false, false, '2311 Lakewood Rd W NW', 'T6K 2G2'),
    ('individual', 'active',   'Olivia Brooks',     null, 'olivia.brooks@example.com',   '780-555-0135', 'Website',        '{residential}',          null, false, false, '7312 115 St NW', 'T6G 1N4'),
    ('individual', 'active',   'Ethan Wright',      null, 'ethan.wright@example.com',    '780-555-0136', 'Referral',       '{residential}',          null, false, false, '7110 112 St NW', 'T6G 1J5'),
    ('individual', 'active',   'Isla MacLeod',      null, 'isla.macleod@example.com',    '780-555-0137', 'Facebook',       '{residential}',          null, false, false, '5520 Riverbend Rd NW', 'T6H 5K4'),
    ('individual', 'active',   'Victor Hughes',     null, 'victor.hughes@example.com',   '780-555-0138', 'Referral',       '{residential,weekly}',   null, false, false, '12404 107 Ave NW', 'T5M 1Z6'),
    ('individual', 'active',   'Leah Nguyen',       null, 'leah.nguyen@example.com',     '780-555-0139', 'Google',         '{residential,weekly}',   null, false, false, '8721 95 Ave NW', 'T6C 1Z3'),
    ('individual', 'lead',     'Aaron Fischer',     null, 'aaron.fischer@example.com',   '780-555-0140', 'Door hanger',    '{residential}',          'Called about hedges; wants a price before booking.', false, false, '9120 62 St NW', 'T6B 1N6'),
    ('individual', 'lead',     'Zoe Laurent',       null, 'zoe.laurent@example.com',     '780-555-0141', 'Google',         '{residential}',          null, false, false, '5905 Pegasus Blvd NW', 'T5E 6Y8'),
    ('individual', 'lead',     'Ben Albrecht',      null, 'ben.albrecht@example.com',    '780-555-0142', 'Website',        '{residential}',          null, false, false, '15520 102 St NW', 'T5X 6C9'),
    ('individual', 'lead',     'Nadia Rahman',      null, 'nadia.rahman@example.com',    '780-555-0143', 'Facebook',       '{residential}',          null, false, false, '4310 119 St NW', 'T6J 1X5'),
    ('individual', 'inactive', 'Tyler Dunn',        null, 'tyler.dunn@example.com',      '780-555-0144', 'Referral',       '{residential}',          'Moved to Calgary.', false, false, '1704 Ellerslie Rd SW', 'T6X 1A2'),
    ('individual', 'inactive', 'Rachel Kim',        null, 'rachel.kim@example.com',      '780-555-0145', 'Google',         '{residential}',          'Paused service this year; may return next season.', false, false, '7704 92 Ave NW', 'T6C 1R8'),
    ('company',    'active',   'Oakridge HOA',      'Oakridge Homeowners Association', 'board.oakridge@example.com', '780-555-0150', 'Referral', '{commercial,hoa}', 'Invoices to the property manager. Net 15.', false, false, 'PO Box 4410 Stn South', 'T6E 4T5'),
    ('company',    'active',   'Riverbend Dental Clinic', 'Riverbend Dental Clinic Ltd.', 'office.riverbend@example.com', '780-555-0151', 'Website', '{commercial}', null, false, false, '640 Riverbend Sq NW', 'T6R 2E3'),
    ('company',    'active',   'Whitemud Business Park', 'Whitemud Business Park Inc.', 'facilities.whitemud@example.com', '780-555-0152', 'Cold call', '{commercial}', 'Three buildings; the site lead meets the crew at Building A.', false, false, '4103 97 St NW', 'T6E 5Y7'),
    ('company',    'active',   'Glenora Community League', 'Glenora Community League', 'info.glenora@example.com', '780-555-0153', 'Referral', '{commercial,non-profit}', 'Registered non-profit: tax exempt.', true, false, '13535 109A Ave NW', 'T5M 2J8'),
    ('company',    'lead',     'Summerside Condo Board', 'Summerside Condominium Corp. 0412', 'board.summerside@example.com', '780-555-0154', 'Website', '{commercial,condo}', null, false, false, '1251 Summerside Dr SW', 'T6X 0M1'),
    ('company',    'inactive', 'Capilano Auto Body', 'Capilano Auto Body Ltd.', 'shop.capilano@example.com', '780-555-0155', 'Cold call', '{commercial}', 'Went with another contractor.', false, false, '5004 98 Ave NW', 'T6A 0A1'),
    ('company',    'inactive', 'Old Strathcona Bistro', 'Old Strathcona Bistro Inc.', 'manager.bistro@example.com', '780-555-0156', 'Walk-in', '{commercial}', 'Closed; archived.', false, true, '10345 82 Ave NW', 'T6E 1Z9')
  ) as c(kind, status, name, company, email, phone, source, tags, notes, exempt, archived, address, postal);

  select jsonb_object_agg(display_name, id) into v_c from public.clients where organization_id = v_org;

  insert into public.client_contacts (organization_id, client_id, name, role, email, phone, is_primary, receives_invoices)
  select v_org, (v_c ->> t.client)::uuid, t.name, t.role, t.email, t.phone, t.is_primary, t.invoices
  from (values
    ('Oakridge HOA',             'Pat Chen',      'Property manager',     'pat.chen@example.com',      '780-555-0160', true,  true),
    ('Oakridge HOA',             'Lee Morgan',    'Board treasurer',      'lee.morgan@example.com',    '780-555-0161', false, true),
    ('Riverbend Dental Clinic',  'Dr. Amy Ross',  'Owner',                'amy.ross@example.com',      '780-555-0162', false, false),
    ('Riverbend Dental Clinic',  'Kim Park',      'Office manager',       'kim.park@example.com',      '780-555-0163', true,  true),
    ('Whitemud Business Park',   'Raj Malhotra',  'Facilities manager',   'raj.malhotra@example.com',  '780-555-0164', true,  true),
    ('Glenora Community League', 'Sue Anders',    'Volunteer coordinator','sue.anders@example.com',    '780-555-0165', true,  false),
    ('Glenora Community League', 'Tom Bell',      'Treasurer',            'tom.bell@example.com',      '780-555-0166', false, true),
    ('Summerside Condo Board',   'Ian Holt',      'Board president',      'ian.holt@example.com',      '780-555-0167', true,  true)
  ) as t(client, name, role, email, phone, is_primary, invoices);

  insert into public.properties (organization_id, client_id, name, address_line1, city, region, postal_code,
                                 location, geocoded_at, geocode_source, lot_size_sqft, access_notes, archived_at)
  select v_org, (v_c ->> p.client)::uuid, p.name, p.address, 'Edmonton', 'AB', p.postal,
         extensions.st_setsrid(extensions.st_makepoint(p.lon, p.lat), 4326)::extensions.geography,
         now(), 'manual', p.lot, p.access,
         case when p.client = 'Old Strathcona Bistro' then now() - interval '60 days' end
  from (values
    ('Jane Smith',        null::text,       '11220 83 Ave NW',          'T6G 0T8', -113.5219, 53.5186, 5200,  'Side gate, no dog'),
    ('Bob Lee',           null,             '9315 142 St NW',           'T5R 0M8', -113.5695, 53.5324, 6100,  null),
    ('Priya Sharma',      null,             '6315 106 St NW',           'T6H 2V3', -113.5034, 53.5006, 5800,  'Back lane access'),
    ('Marcus Chen',       null,             '5824 Terwillegar Blvd NW', 'T6R 0E2', -113.5880, 53.4570, 4800,  'Side gate code 4410'),
    ('Elena Petrova',     null,             '1352 Windermere Way SW',   'T6W 2J8', -113.6050, 53.4300, 7400,  null),
    ('Grace Whitford',    null,             '10215 133 St NW',          'T5N 2A4', -113.5590, 53.5430, 6900,  'Large dog in the back yard; call first'),
    ('Noah Campbell',     null,             '11615 64 St NW',           'T5W 4J3', -113.4390, 53.5680, 5000,  null),
    ('Sofia Rossi',       null,             '9620 83 St NW',            'T6C 2Y9', -113.4630, 53.5240, 4300,  null),
    ('Ava Thompson',      null,             '9311 78 Ave NW',           'T6C 0N4', -113.4860, 53.5100, 3900,  null),
    ('Hiroshi Tanaka',    null,             '11008 125 St NW',          'T5M 0M3', -113.5480, 53.5530, 5600,  null),
    ('Fatima Haddad',     null,             '9620 145 St NW',           'T5N 2W8', -113.5800, 53.5300, 8200,  'Corner lot; park on 96 Ave'),
    ('Daniel Okoye',      null,             '2240 Rutherford Rd SW',    'T6W 0J2', -113.5150, 53.4240, 4500,  null),
    ('Mei Wong',          null,             '1520 Summerside Dr SW',    'T6X 0K9', -113.4600, 53.4170, 4100,  null),
    ('Carlos Mendes',     null,             '2311 Lakewood Rd W NW',    'T6K 2G2', -113.4300, 53.4580, 4700,  null),
    ('Olivia Brooks',     null,             '7312 115 St NW',           'T6G 1N4', -113.5340, 53.5050, 5300,  null),
    ('Ethan Wright',      null,             '7110 112 St NW',           'T6G 1J5', -113.5150, 53.5000, 5000,  null),
    ('Isla MacLeod',      null,             '5520 Riverbend Rd NW',     'T6H 5K4', -113.5620, 53.4880, 6000,  null),
    ('Victor Hughes',     null,             '12404 107 Ave NW',         'T5M 1Z6', -113.5460, 53.5590, 4600,  null),
    ('Leah Nguyen',       null,             '8721 95 Ave NW',           'T6C 1Z3', -113.4560, 53.5310, 4900,  null),
    ('Aaron Fischer',     null,             '9120 62 St NW',            'T6B 1N6', -113.4400, 53.5230, 4400,  null),
    ('Zoe Laurent',       null,             '5905 Pegasus Blvd NW',     'T5E 6Y8', -113.5100, 53.6100, 3600,  null),
    ('Ben Albrecht',      null,             '15520 102 St NW',          'T5X 6C9', -113.5150, 53.6150, 4000,  null),
    ('Nadia Rahman',      null,             '4310 119 St NW',           'T6J 1X5', -113.5800, 53.4880, 5100,  null),
    ('Tyler Dunn',        null,             '1704 Ellerslie Rd SW',     'T6X 1A2', -113.4900, 53.4180, 3800,  null),
    ('Rachel Kim',        null,             '7704 92 Ave NW',           'T6C 1R8', -113.4790, 53.5040, 4200,  null),
    ('Oakridge HOA',      'Common green',   '5400 Riverbend Rd NW',     'T6H 5J6', -113.5675, 53.4861, 40000, 'Irrigation boxes along the north path'),
    ('Oakridge HOA',      'North entrance', '5600 Riverbend Rd NW',     'T6H 5J7', -113.5650, 53.4905, 12000, null),
    ('Riverbend Dental Clinic', null,       '640 Riverbend Sq NW',      'T6R 2E3', -113.5600, 53.4740, 15000, 'Clear the front walk before 7:30'),
    ('Whitemud Business Park', 'Buildings A-C', '4103 97 St NW',        'T6E 5Y7', -113.4880, 53.4790, 60000, 'Check in with security at Building A'),
    ('Glenora Community League', 'Hall and rink', '13535 109A Ave NW',  'T5M 2J8', -113.5620, 53.5560, 22000, null),
    ('Summerside Condo Board', 'Phase 1',   '1251 Summerside Dr SW',    'T6X 0M1', -113.4630, 53.4190, 30000, null),
    ('Capilano Auto Body', null,            '5004 98 Ave NW',           'T6A 0A1', -113.4300, 53.5340, 9000,  null),
    ('Old Strathcona Bistro', null,         '10345 82 Ave NW',          'T6E 1Z9', -113.4950, 53.5180, 2000,  null)
  ) as p(client, name, address, postal, lon, lat, lot, access);

  ----------------------------------------------------------------------------
  -- Requests and quotes (through the quote builder's functions)
  --
  -- flow:
  --   none      stays submitted
  --   status    staff set the status directly (reviewing with an info
  --             note, rejected, scheduled)
  --   draft     create_quote_draft + lines (request: reviewing)
  --   sent      ... + send_quote (request: estimated)
  --   revised   revision 1 sent, revision 2 copied, discounted and sent;
  --             revision 1 becomes expired (request: estimated)
  --   approved  ... + portal_token_approve (request: approved; a job below
  --             converts it when convert is true)
  --   declined  ... + portal_token_decline, then staff reject the request
  -- Services named @recurring / @cleanup follow the season.
  ----------------------------------------------------------------------------

  v_requests := jsonb_build_array(
    jsonb_build_object('name', 'Harjit Gill', 'email', 'harjit.gill@example.com', 'phone', '780-555-0170',
      'address', '3815 Allan Dr SW, Edmonton, AB', 'service', '@recurring', 'source', 'web_form', 'hours', 20,
      'notes', 'Corner lot. Looking for someone weekly for the season.', 'flow', 'none'),
    jsonb_build_object('client', 'Jane Smith', 'service', 'Core aeration', 'source', 'client_portal', 'hours', 3,
      'notes', 'Can you add aeration before the next visit?', 'flow', 'none'),
    jsonb_build_object('name', 'Rina Patel (Northgate Pharmacy)', 'email', 'rina.patel@example.com', 'phone', '780-555-0171',
      'address', '9499 137 Ave NW, Edmonton, AB', 'service', 'Sidewalk sanding', 'source', 'email', 'hours', 46,
      'notes', 'Front entrance and accessible ramp. Need it done before we open at 9.', 'flow', 'none'),
    jsonb_build_object('client', 'Aaron Fischer', 'service', 'Hedge trimming', 'source', 'phone', 'hours', 5,
      'notes', 'About 40 ft of caragana along the back fence.', 'flow', 'none'),
    jsonb_build_object('client', 'Summerside Condo Board', 'service', 'Sod installation', 'source', 'phone', 'hours', 96,
      'notes', 'Replace the dead strip along the parkade entrance.',
      'info_needed', 'Need square footage and photos of the strip. Site visit booked with Ian Holt.',
      'flow', 'status', 'status', 'reviewing'),
    jsonb_build_object('name', 'Tessa Moreau', 'email', 'tessa.moreau@example.com', 'phone', '780-555-0172',
      'address', '10712 University Ave NW, Edmonton, AB', 'service', 'Mulch installation', 'source', 'web_form', 'hours', 140,
      'notes', 'Front beds, roughly 300 sq ft.', 'flow', 'draft',
      'lines', jsonb_build_array(
        jsonb_build_object('service', 'Mulch installation', 'qty', 6, 'desc', 'Cedar mulch, front beds (6 yd)'),
        jsonb_build_object('service', 'Hedge trimming', 'qty', 2, 'optional', true, 'desc', 'Trim front shrubs (est. 2 hours)'))),
    jsonb_build_object('client', 'Riverbend Dental Clinic', 'service', '@recurring', 'source', 'email', 'hours', 190,
      'notes', 'Weekly service for the parking lot islands and front walk.', 'flow', 'sent', 'valid_days', 21,
      'message', 'Thanks for the walkthrough. Pricing below covers the front walk and parking islands.',
      'conditions', 'Price held for 21 days.',
      'lines', jsonb_build_array(
        jsonb_build_object('service', '@recurring', 'qty', 2, 'freq', 'weekly'))),
    jsonb_build_object('client', 'Oakridge HOA', 'service', '@cleanup', 'source', 'email', 'hours', 290,
      'notes', 'Both the common green and the north entrance.', 'flow', 'revised', 'valid_days', 30,
      'message', 'Seasonal cleanup for both Oakridge properties.',
      'message2', 'Revised with the multi-property discount we discussed.',
      'conditions', 'Debris hauled away. Price held for 30 days.',
      'lines', jsonb_build_array(
        jsonb_build_object('service', '@cleanup', 'qty', 2, 'desc', 'Seasonal cleanup (2 properties)'),
        jsonb_build_object('service', 'Core aeration', 'qty', 2, 'optional', true, 'desc', 'Core aeration (2 properties)'))),
    jsonb_build_object('client', 'Priya Sharma', 'service', 'Fertilizer program', 'source', 'web_form', 'hours', 240,
      'notes', 'Dandelions everywhere. Would like the full program.', 'flow', 'approved', 'valid_days', 30,
      'select_optional', true,
      'message', 'Four applications through the season.',
      'lines', jsonb_build_array(
        jsonb_build_object('service', 'Fertilizer program', 'qty', 1, 'freq', 'monthly'),
        jsonb_build_object('service', 'Core aeration', 'qty', 1, 'optional', true))),
    jsonb_build_object('client', 'Grace Whitford', 'service', '@recurring', 'source', 'web_form', 'hours', 430,
      'notes', 'Front and back, weekly.', 'flow', 'approved', 'convert', true, 'valid_days', 30,
      'message', 'Weekly service, front and back.',
      'lines', jsonb_build_array(
        jsonb_build_object('service', '@recurring', 'qty', 1, 'freq', 'weekly', 'desc', '@recurring (front and back)'))),
    jsonb_build_object('name', 'Kyle Brandt', 'email', 'kyle.brandt@example.com', 'phone', '780-555-0173',
      'address', '18 Erin Ridge Rd, St. Albert, AB', 'service', '@recurring', 'source', 'web_form', 'hours', 210,
      'notes', 'Weekly please.', 'info_needed', 'Outside our service area (St. Albert).',
      'flow', 'status', 'status', 'rejected'),
    jsonb_build_object('client', 'Capilano Auto Body', 'service', '@recurring', 'source', 'phone', 'hours', 480,
      'notes', 'Lot and front walk.', 'flow', 'declined', 'valid_days', 14,
      'decline_reason', 'Went with another contractor.',
      'lines', jsonb_build_array(
        jsonb_build_object('service', '@recurring', 'qty', 3, 'freq', 'weekly', 'desc', '@recurring (lot and walk)'))),
    jsonb_build_object('client', 'Daniel Okoye', 'service', 'Gutter cleaning', 'source', 'email', 'hours', 170,
      'notes', 'Two-storey house, about 160 ft of gutter.', 'flow', 'status', 'status', 'scheduled'),
    jsonb_build_object('client', 'Glenora Community League', 'service', 'Holiday lighting', 'source', 'client_portal',
      'hours', 0.5, 'notes', 'Lights on the hall roofline for the winter festival.', 'flow', 'none')
  );

  for x in select value from jsonb_array_elements(v_requests)
  loop
    v_svc := case x ->> 'service' when '@recurring' then v_rec_name when '@cleanup' then v_cleanup_name
                                  else x ->> 'service' end;
    v_client := (v_c ->> (x ->> 'client'))::uuid;

    insert into public.requests (organization_id, client_id, service_id, contact_name, contact_email, contact_phone,
                                 address, notes, info_needed, source, submitted_at)
    select v_org, v_client, (v_s ->> v_svc)::uuid,
           coalesce(c.display_name, x ->> 'name'), coalesce(c.email, x ->> 'email'), coalesce(c.phone, x ->> 'phone'),
           coalesce(p.address_line1 || ', ' || p.city || ', ' || p.region, x ->> 'address'),
           x ->> 'notes', x ->> 'info_needed', (x ->> 'source')::public.request_source,
           now() - (x ->> 'hours')::numeric * interval '1 hour'
    from (select 1) one
    left join public.clients c on c.organization_id = v_org and c.id = v_client
    left join lateral (
      select * from public.properties pp
      where pp.organization_id = v_org and pp.client_id = v_client
      order by pp.created_at, pp.id limit 1
    ) p on true
    returning id into v_req;

    v_flow := x ->> 'flow';
    if v_flow = 'status' then
      update public.requests set status = (x ->> 'status')::public.request_status where id = v_req;
    elsif v_flow <> 'none' then
      -- A request without a client gets one from its contact details.
      v_q := public.create_quote_draft(v_req);
      select client_id into v_client from public.requests where id = v_req;
      select tax_exempt into v_exempt from public.clients where id = v_client;

      update public.quotes
      set property_id = (select id from public.properties
                         where organization_id = v_org and client_id = v_client
                         order by created_at, id limit 1),
          message = x ->> 'message',
          conditions = x ->> 'conditions',
          valid_until = v_today + coalesce((x ->> 'valid_days')::int, 30)
      where organization_id = v_org and id = v_q;

      insert into public.quote_line_items (organization_id, quote_id, service_id, position, description, quantity,
                                           unit_price_cents, is_optional, frequency, season_start_month,
                                           season_end_month)
      select v_org, v_q, s.id, l.ord,
             replace(coalesce(l.v ->> 'desc', s.name), '@recurring', v_rec_name),
             coalesce((l.v ->> 'qty')::numeric, 1), s.default_price_cents,
             coalesce((l.v ->> 'optional')::boolean, false),
             coalesce((l.v ->> 'freq')::public.service_frequency, s.frequencies[1]),
             s.season_start_month, s.season_end_month
      from jsonb_array_elements(x -> 'lines') with ordinality as l(v, ord)
      join public.services s
        on s.organization_id = v_org
       and s.id = (v_s ->> case l.v ->> 'service' when '@recurring' then v_rec_name
                                                 when '@cleanup' then v_cleanup_name
                                                 else l.v ->> 'service' end)::uuid;

      if not v_exempt then
        insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
        select v_org, id, v_gst from public.quote_line_items where organization_id = v_org and quote_id = v_q;
      end if;

      if v_flow <> 'draft' then
        v_hash := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
        v_tok := public.send_quote(v_q, v_hash);
        perform public.record_quote_delivery(v_tok, 'sent', 'seed-' || v_tok, null);
      end if;

      if v_flow = 'revised' then
        v_q2 := public.create_quote_draft(v_req, v_q);
        update public.quotes
        set valid_until = v_today + coalesce((x ->> 'valid_days')::int, 30), message = x ->> 'message2'
        where organization_id = v_org and id = v_q2;
        update public.quote_line_items
        set unit_price_cents = round(unit_price_cents * 0.9)
        where organization_id = v_org and quote_id = v_q2;
        v_hash := encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex');
        v_tok := public.send_quote(v_q2, v_hash);
        perform public.record_quote_delivery(v_tok, 'sent', 'seed-' || v_tok, null);
      elsif v_flow in ('approved', 'declined') then
        -- The client acts through the emailed link: the service role calls
        -- these with no signed-in user.
        perform set_config('request.jwt.claims', '', true);
        if v_flow = 'approved' then
          perform public.portal_token_approve(v_hash, array(
            select id from public.quote_line_items
            where organization_id = v_org and quote_id = v_q and is_optional
              and coalesce((x ->> 'select_optional')::boolean, false)));
        else
          perform public.portal_token_decline(v_hash, x ->> 'decline_reason');
        end if;
        perform set_config('request.jwt.claims', v_claims, true);
        if v_flow = 'declined' then
          update public.requests set status = 'rejected' where id = v_req;
        end if;
      end if;
    end if;
  end loop;

  -- A quote made directly for a client (no request), as before.
  v_client := (v_c ->> 'Bob Lee')::uuid;
  insert into public.quotes (organization_id, client_id, property_id, title, message, valid_until)
  select v_org, v_client, p.id, 'Hedge trimming', 'Front and back hedges, debris hauled away.', v_today + 30
  from public.properties p where p.organization_id = v_org and p.client_id = v_client
  returning id into v_q;
  insert into public.quote_line_items (organization_id, quote_id, service_id, position, description, quantity,
                                       unit_price_cents, is_optional, frequency, season_start_month, season_end_month)
  values
    (v_org, v_q, (v_s ->> 'Hedge trimming')::uuid, 1, 'Hedge trimming (est. 3 hours)', 3, 6500, false, 'one_time', 5, 9),
    (v_org, v_q, null, 2, 'Shape ornamental shrubs', 1, 8000, true, 'one_time', null, null);
  insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
  select v_org, id, v_gst from public.quote_line_items where organization_id = v_org and quote_id = v_q;

  ----------------------------------------------------------------------------
  -- Recurring jobs: started three weeks ago, visits generated eight weeks
  -- ahead (a stand-in for the app-side RRULE expander, ADR 0005).
  ----------------------------------------------------------------------------

  for jr in
    select * from (values
      -- client,                    property,        weekdays, every, crew,                  billing,     qty, minutes, from quote
      ('Jane Smith',               null::text,       '{2}'::int[],  1, 'Truck 1 - West',       'per_visit', 1, null::int, false),
      ('Priya Sharma',             null,             '{3}',         1, 'Truck 1 - West',       'per_visit', 1, null,      false),
      ('Marcus Chen',              null,             '{1}',         1, 'Truck 1 - West',       'per_visit', 1, null,      false),
      ('Elena Petrova',            null,             '{4}',         2, 'Truck 1 - West',       'per_visit', 1, null,      false),
      ('Fatima Haddad',            null,             '{5}',         1, 'Truck 1 - West',       'per_visit', 1, null,      false),
      ('Oakridge HOA',             'Common green',   '{4}',         1, 'Truck 1 - West',       'periodic',  3, 120,       false),
      ('Noah Campbell',            null,             '{2}',         1, 'Truck 2 - East',       'per_visit', 1, null,      false),
      ('Sofia Rossi',              null,             '{5}',         1, 'Truck 2 - East',       'per_visit', 1, null,      false),
      ('Ava Thompson',             null,             '{1}',         2, 'Truck 2 - East',       'per_visit', 1, null,      false),
      ('Leah Nguyen',              null,             '{3}',         1, 'Truck 2 - East',       'per_visit', 1, null,      false),
      ('Grace Whitford',           null,             '{3}',         1, 'Truck 2 - East',       'per_visit', 1, null,      true),
      ('Whitemud Business Park',   'Buildings A-C',  '{1,3,5}',     1, 'Truck 3 - Commercial', 'periodic',  4, 150,       false),
      ('Glenora Community League', 'Hall and rink',  '{1}',         1, 'Truck 3 - Commercial', 'per_visit', 2, 90,        false),
      ('Hiroshi Tanaka',           null,             '{4}',         1, 'Truck 3 - Commercial', 'per_visit', 1, null,      false),
      ('Victor Hughes',            null,             '{2}',         1, 'Truck 3 - Commercial', 'per_visit', 1, null,      false)
    ) as t(client, prop, dows, every, crew, billing, qty, minutes, from_quote)
  loop
    v_client := (v_c ->> jr.client)::uuid;
    select id into v_prop from public.properties
    where organization_id = v_org and client_id = v_client and (jr.prop is null or name = jr.prop)
    order by created_at, id limit 1;
    select tax_exempt into v_exempt from public.clients where id = v_client;
    v_start := v_today - 21;
    v_rrule := 'FREQ=WEEKLY;' || case when jr.every > 1 then 'INTERVAL=' || jr.every || ';' else '' end
               || 'BYDAY=' || array_to_string(array(
                    select (array['MO','TU','WE','TH','FR','SA','SU'])[d] from unnest(jr.dows) d), ',');
    v_q := null;
    v_title := v_rec_name || coalesce(' - ' || jr.prop, '');
    if jr.from_quote then
      select id, title into v_q, v_title from public.quotes
      where organization_id = v_org and client_id = v_client and status = 'approved'
      order by created_at desc limit 1;
    end if;

    -- A job with quote_id converts the quote and copies its lines (trigger).
    insert into public.jobs (organization_id, client_id, property_id, quote_id, kind, title, rrule, start_date,
                             window_start, window_minutes, visit_duration_minutes, preferred_crew_id,
                             billing_mode, billing_period, instructions)
    values (v_org, v_client, v_prop, v_q, 'recurring', v_title, v_rrule, v_start,
            v_rec_window, v_rec_window_minutes,
            coalesce(jr.minutes, (select default_duration_minutes from public.services where id = (v_s ->> v_rec_name)::uuid)),
            (v_crews ->> jr.crew)::uuid, jr.billing::public.job_billing_mode,
            case when jr.billing = 'periodic' then 'monthly'::public.billing_period end,
            case when v_green then 'Bag clippings on the first cut only.' else 'Clear walks and steps; salt the front steps.' end)
    returning id into v_job;

    if not jr.from_quote then
      insert into public.job_line_items (organization_id, job_id, service_id, position, description, quantity, unit_price_cents)
      select v_org, v_job, s.id, 1, s.name || coalesce(' - ' || jr.prop, ''), jr.qty, s.default_price_cents
      from public.services s where s.id = (v_s ->> v_rec_name)::uuid
      returning id into v_line;
      if not v_exempt then
        insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id) values (v_org, v_line, v_gst);
      end if;
    end if;

    v_dates := array(
      select d::date from generate_series(v_start, v_today + 55, interval '1 day') d
      where extract(isodow from d)::int = any (jr.dows)
        and ((d::date - v_start) / 7) % jr.every = 0);
    perform public.generate_visits(v_job, v_dates, v_today + 55);
  end loop;

  -- On hold: an inactive client's paused service (no visits are generated).
  v_client := (v_c ->> 'Rachel Kim')::uuid;
  insert into public.jobs (organization_id, client_id, property_id, kind, status, title, rrule, start_date,
                           visit_duration_minutes, preferred_crew_id, internal_notes)
  select v_org, v_client, p.id, 'recurring', 'on_hold', v_rec_name, 'FREQ=WEEKLY;BYDAY=WE', v_today - 120,
         45, (v_crews ->> 'Truck 2 - East')::uuid, 'Paused at the client''s request.'
  from public.properties p where p.organization_id = v_org and p.client_id = v_client
  returning id into v_job;
  insert into public.job_line_items (organization_id, job_id, service_id, position, description, unit_price_cents)
  values (v_org, v_job, (v_s ->> v_rec_name)::uuid, 1, v_rec_name, 5500)
  returning id into v_line;
  insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id) values (v_org, v_line, v_gst);

  ----------------------------------------------------------------------------
  -- One-off jobs (each gets its visit from the job trigger)
  ----------------------------------------------------------------------------

  for jr in
    select * from (values
      -- client,           service,          qty,  day offset, window start,  crew,                   note
      ('Mei Wong',         '@cleanup',       1,    -10, time '09:00', 'Truck 2 - East',       null::text),
      ('Carlos Mendes',    'Gutter cleaning', 140, -6,  time '13:00', 'Truck 3 - Commercial', null),
      ('Olivia Brooks',    'Gutter cleaning', 120, 0,   time '10:00', 'Truck 1 - West',       'Downspout at the back corner is loose.'),
      ('Ethan Wright',     '@cleanup',       1,    0,   time '12:00', 'Truck 2 - East',       null),
      ('Isla MacLeod',     'Gutter cleaning', 150, 0,   time '14:00', 'Truck 3 - Commercial', null),
      ('Bob Lee',          '@cleanup',       1,    7,   time '13:00', 'Truck 2 - East',       null),
      ('Daniel Okoye',     'Gutter cleaning', 160, 9,   time '09:00', 'Truck 3 - Commercial', 'Booked from the request; two-storey ladder.')
    ) as t(client, service, qty, offset_days, win, crew, note)
  loop
    v_client := (v_c ->> jr.client)::uuid;
    v_svc := case jr.service when '@cleanup' then v_cleanup_name else jr.service end;
    insert into public.jobs (organization_id, client_id, property_id, title, start_date, window_start, window_minutes,
                             visit_duration_minutes, preferred_crew_id, instructions)
    select v_org, v_client, p.id, v_svc, v_today + jr.offset_days, jr.win, 240, s.default_duration_minutes,
           (v_crews ->> jr.crew)::uuid, jr.note
    from public.properties p, public.services s
    where p.organization_id = v_org and p.client_id = v_client and s.id = (v_s ->> v_svc)::uuid
    returning id into v_job;
    insert into public.job_line_items (organization_id, job_id, service_id, position, description, quantity, unit_price_cents)
    select v_org, v_job, s.id, 1, s.name, jr.qty, s.default_price_cents
    from public.services s where s.id = (v_s ->> v_svc)::uuid
    returning id into v_line;
    insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id) values (v_org, v_line, v_gst);
  end loop;

  -- A callback with no date yet (the route builder's unscheduled list).
  insert into public.visits (organization_id, job_id, status, duration_minutes, instructions)
  select v_org, j.id, 'unscheduled', 30, 'Callback: missed strip along the driveway.'
  from public.jobs j
  where j.organization_id = v_org and j.client_id = (v_c ->> 'Jane Smith')::uuid and j.kind = 'recurring';

  ----------------------------------------------------------------------------
  -- Past visits: one skipped, one no-show, the rest completed by the crew
  -- lead at the start of their window.
  ----------------------------------------------------------------------------

  update public.visits set status = 'skipped', completion_notes = 'Skipped for weather; client notified.'
  where id = (
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = (v_c ->> 'Elena Petrova')::uuid and v.scheduled_date < v_today
    order by v.scheduled_date limit 1);

  update public.visits set status = 'no_show', completion_notes = 'Gate locked and nobody home.'
  where id = (
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = (v_c ->> 'Marcus Chen')::uuid and v.scheduled_date < v_today
    order by v.scheduled_date offset 1 limit 1);

  update public.visits v
  set status = 'completed',
      actual_start = coalesce(v.window_start, (v.scheduled_date + time '09:00') at time zone v_tz),
      actual_end = coalesce(v.window_start, (v.scheduled_date + time '09:00') at time zone v_tz)
                   + make_interval(mins => v.duration_minutes),
      completed_by_member_id = (
        select cm.member_id from public.crew_members cm
        where cm.organization_id = j.organization_id and cm.crew_id = j.preferred_crew_id and cm.is_lead),
      completion_notes = case when extract(day from v.scheduled_date)::int % 4 = 0
                              then 'All done. Gate closed behind us.' end
  from public.jobs j
  where v.organization_id = v_org and j.organization_id = v.organization_id and j.id = v.job_id
    and v.status = 'scheduled' and v.scheduled_date < v_today;

  update public.jobs set status = 'completed'
  where organization_id = v_org and kind = 'one_off' and start_date < v_today;

  ----------------------------------------------------------------------------
  -- Routes for today (published) and tomorrow (draft). Stops are ordered
  -- west to east, with 20 minutes of travel between them.
  ----------------------------------------------------------------------------

  for v_d in select generate_series(v_today, v_today + 1, interval '1 day')::date
  loop
    for v_crew in select id from public.crews where organization_id = v_org order by name
    loop
      if exists (
        select 1 from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
        where v.organization_id = v_org and v.scheduled_date = v_d and v.status = 'scheduled'
          and j.preferred_crew_id = v_crew
      ) then
        insert into public.routes (organization_id, crew_id, route_date)
        values (v_org, v_crew, v_d)
        returning id into v_route;

        insert into public.route_stops (organization_id, route_id, visit_id, sequence, planned_arrival, planned_departure)
        select v_org, v_route, s.id, s.seq,
               s.route_start + make_interval(mins => s.before::int),
               s.route_start + make_interval(mins => (s.before + s.duration_minutes)::int)
        from (
          select v.id, v.duration_minutes, r.planned_start as route_start,
                 row_number() over w as seq,
                 coalesce(sum(v.duration_minutes + 20) over (w rows between unbounded preceding and 1 preceding), 0) as before
          from public.visits v
          join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
          join public.properties p on p.organization_id = v.organization_id and p.id = v.property_id
          join public.routes r on r.organization_id = v_org and r.id = v_route
          where v.organization_id = v_org and v.scheduled_date = v_d and v.status = 'scheduled'
            and j.preferred_crew_id = v_crew
          window w as (order by p.longitude, v.id)
        ) s;

        if v_d = v_today then
          update public.routes set status = 'published' where id = v_route;
        end if;
      end if;
    end loop;
  end loop;

  ----------------------------------------------------------------------------
  -- Invoices (create_invoice_for_visits) and payments
  ----------------------------------------------------------------------------

  -- Jane: the first visit paid by e-transfer, the second issued and open,
  -- the third not billed yet.
  v_client := (v_c ->> 'Jane Smith')::uuid;
  v_vis := array(
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = v_client and v.status = 'completed'
    order by v.scheduled_date);
  select scheduled_date into v_d from public.visits where id = v_vis[1];
  v_inv := public.create_invoice_for_visits(v_client, array[v_vis[1]]);
  update public.invoices set status = 'sent', issue_date = v_d + 1, due_date = v_d + 16,
                             sent_at = (v_d + 1 + time '18:00') at time zone v_tz
  where id = v_inv;
  insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents, received_at, reference)
  select v_org, id, client_id, 'etransfer', total_cents, (v_d + 3 + time '10:15') at time zone v_tz, 'INTERAC ref CA8YK2Q'
  from public.invoices where id = v_inv;
  update public.invoices set paid_at = (v_d + 3 + time '10:15') at time zone v_tz where id = v_inv;

  select scheduled_date into v_d from public.visits where id = v_vis[2];
  v_inv := public.create_invoice_for_visits(v_client, array[v_vis[2]]);
  update public.invoices set status = 'sent', issue_date = v_d + 1, due_date = v_d + 16,
                             sent_at = (v_d + 1 + time '18:00') at time zone v_tz
  where id = v_inv;

  -- Priya: two visits on one invoice, partly paid in cash.
  v_client := (v_c ->> 'Priya Sharma')::uuid;
  v_vis := array(
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = v_client and v.status = 'completed'
    order by v.scheduled_date limit 2);
  v_inv := public.create_invoice_for_visits(v_client, v_vis);
  update public.invoices set status = 'sent', issue_date = v_today - 6, due_date = v_today + 9,
                             message = 'Thanks for your business!'
  where id = v_inv;
  insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents, received_at, notes)
  values (v_org, v_inv, v_client, 'cash', 5000, (v_today - 4 + time '16:40') at time zone v_tz, 'Paid the crew at the door.');

  -- Mei: a one-off cleanup, issued with 7-day terms and now overdue.
  v_client := (v_c ->> 'Mei Wong')::uuid;
  v_vis := array(
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = v_client and v.status = 'completed');
  v_inv := public.create_invoice_for_visits(v_client, v_vis);
  update public.invoices set status = 'sent', issue_date = v_today - 9, due_date = v_today - 2, terms = 'Net 7'
  where id = v_inv;

  -- Carlos: a one-off gutter cleaning, paid in full by cheque.
  v_client := (v_c ->> 'Carlos Mendes')::uuid;
  v_vis := array(
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = v_client and v.status = 'completed');
  v_inv := public.create_invoice_for_visits(v_client, v_vis);
  update public.invoices set status = 'sent', issue_date = v_today - 5, due_date = v_today + 10 where id = v_inv;
  insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents, received_at, reference)
  select v_org, id, client_id, 'cheque', total_cents, (v_today - 2 + time '11:00') at time zone v_tz, 'Cheque #1043'
  from public.invoices where id = v_inv;

  -- Glenora (tax exempt): two visits, no GST, paid by cheque.
  v_client := (v_c ->> 'Glenora Community League')::uuid;
  v_vis := array(
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = v_client and v.status = 'completed'
    order by v.scheduled_date limit 2);
  v_inv := public.create_invoice_for_visits(v_client, v_vis);
  update public.invoices set status = 'sent', issue_date = v_today - 7, due_date = v_today + 8 where id = v_inv;
  insert into public.payments (organization_id, invoice_id, client_id, method, amount_cents, received_at, reference)
  select v_org, id, client_id, 'cheque', total_cents, (v_today - 3 + time '14:00') at time zone v_tz, 'Cheque #208'
  from public.invoices where id = v_inv;

  -- Marcus: issued, voided (wrong rate), and re-billed as a new draft.
  v_client := (v_c ->> 'Marcus Chen')::uuid;
  v_vis := array(
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = v_client and v.status = 'completed'
    order by v.scheduled_date limit 1);
  v_inv := public.create_invoice_for_visits(v_client, v_vis);
  update public.invoices set status = 'sent', issue_date = v_today - 12, due_date = v_today + 3 where id = v_inv;
  update public.invoices set status = 'void', void_reason = 'Billed at last year''s rate.' where id = v_inv;
  perform public.create_invoice_for_visits(v_client, v_vis);

  -- Oakridge HOA (billed monthly): a draft covering the past three weeks.
  v_client := (v_c ->> 'Oakridge HOA')::uuid;
  v_vis := array(
    select v.id from public.visits v join public.jobs j on j.organization_id = v.organization_id and j.id = v.job_id
    where v.organization_id = v_org and j.client_id = v_client and v.status = 'completed');
  perform public.create_invoice_for_visits(v_client, v_vis, v_today - 21, v_today - 1);

  perform set_config('request.jwt.claims', '', true);
  raise notice 'seeded % (%): % clients, % requests, % quotes, % jobs, % visits, % routes, % invoices',
    v_slug, v_org,
    (select count(*) from public.clients where organization_id = v_org),
    (select count(*) from public.requests where organization_id = v_org),
    (select count(*) from public.quotes where organization_id = v_org),
    (select count(*) from public.jobs where organization_id = v_org),
    (select count(*) from public.visits where organization_id = v_org),
    (select count(*) from public.routes where organization_id = v_org),
    (select count(*) from public.invoices where organization_id = v_org);
end;
$$;

------------------------------------------------------------------------------
-- northside-demo: a small second tenant with the same owner, so the org
-- switcher has two demo orgs and nothing from one shows in the other.
------------------------------------------------------------------------------

do $$
declare
  v_slug constant text := 'northside-demo';
  v_owner_email text := lower(nullif(trim(current_setting('seed.owner_email', true)), ''));
  v_owner uuid;
  v_claims text;
  v_org uuid;
  v_tz constant text := 'America/Edmonton';
  v_today date := (now() at time zone 'America/Edmonton')::date;
  v_green boolean := extract(month from (now() at time zone 'America/Edmonton'))::int between 4 and 10;
  v_rec_name text;
  v_gst uuid;
  v_crew uuid;
  v_c jsonb;
  v_s jsonb;
  v_m jsonb;
  v_client uuid;
  v_req uuid;
  v_q uuid;
  v_job uuid;
  v_line uuid;
begin
  if exists (select 1 from public.organizations where slug = v_slug) then
    raise notice '% already exists; skipping (run supabase/seed/teardown.sql first to re-seed)', v_slug;
    return;
  end if;

  if v_owner_email is not null then
    select id into v_owner from auth.users where lower(email) = v_owner_email;
    if v_owner is null then
      raise exception 'seed.owner_email %: no auth user has that email', v_owner_email;
    end if;
  else
    select id into v_owner from auth.users order by created_at, id limit 1;
  end if;
  if v_owner is null then
    raise notice 'no auth users yet; sign up first, then re-run the seed';
    return;
  end if;

  v_claims := jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', v_claims, true);
  v_rec_name := case when v_green then 'Lawn mowing' else 'Snow clearing' end;

  insert into public.organizations (name, slug, timezone, email, phone, address_line1, city, region, postal_code)
  values ('Northside Snow & Yard (Demo)', v_slug, v_tz, 'hello@northside-demo.example.com', '587-555-0100',
          '13220 St Albert Trail NW', 'Edmonton', 'AB', 'T5L 4W1')
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role, display_name, email, color)
  select v_org, u.id, 'owner', coalesce(nullif(trim(p.full_name), ''), u.email, 'Owner'), lower(u.email), '#7c3aed'
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = v_owner;
  insert into public.organization_members (organization_id, role, display_name, email, phone, color)
  values
    (v_org, 'worker', 'Kai Northcott', 'kai.northcott@example.com', '587-555-0101', '#0284c7'),
    (v_org, 'worker', 'Lena Halvorsen', 'lena.halvorsen@example.com', '587-555-0102', '#c026d3');
  select jsonb_object_agg(display_name, id) into v_m from public.organization_members where organization_id = v_org;

  insert into public.crews (organization_id, name, color, vehicle, default_start_location, default_start_time)
  values (v_org, 'Plow 1', '#0284c7', 'Ram 2500 with plow', 'SRID=4326;POINT(-113.5420 53.5890)', '06:00')
  returning id into v_crew;
  perform public.move_crew_member(v_org, (v_m ->> 'Kai Northcott')::uuid, v_crew);
  perform public.move_crew_member(v_org, (v_m ->> 'Lena Halvorsen')::uuid, v_crew);
  perform public.set_crew_lead(v_org, v_crew, (v_m ->> 'Kai Northcott')::uuid);

  insert into public.tax_rates (organization_id, name, percentage, registration_number)
  values (v_org, 'GST', 5, '987654321RT0001')
  returning id into v_gst;

  insert into public.services (organization_id, name, description, unit, default_price_cents, default_duration_minutes,
                               color, equipment, frequencies, season_start_month, season_end_month,
                               precipitation_type, precipitation_action)
  values
    (v_org, 'Snow clearing', 'Residential driveway and walk, cleared after 5 cm.', 'visit', 5900, 25, '#0284c7',
     '{Plow truck,Shovels}', '{weekly,one_time}', 11, 3, 'snow', 'schedule'),
    (v_org, 'Lawn mowing', 'Mow and trim, clippings mulched.', 'visit', 4900, 40, '#65a30d',
     '{Mower,String trimmer}', '{weekly,biweekly}', 5, 10, 'rain', 'reschedule'),
    (v_org, 'Fall cleanup', 'Leaves out of lawn and beds, hauled away.', 'monthly', 27500, 150, '#c2410c',
     '{Blower,Trailer}', '{one_time}', 9, 11, 'none', 'none');
  insert into public.service_default_taxes (organization_id, service_id, tax_rate_id)
  select v_org, id, v_gst from public.services where organization_id = v_org;
  select jsonb_object_agg(name, id) into v_s from public.services where organization_id = v_org;

  insert into public.clients (organization_id, kind, status, display_name, first_name, last_name, company_name,
                              email, phone, lead_source, tags)
  values
    (v_org, 'company',    'active', 'Castle Downs Plaza', null, null, 'Castle Downs Plaza Holdings',
     'manager.cdplaza@example.com', '587-555-0110', 'Cold call', '{commercial}'),
    (v_org, 'individual', 'active', 'Gwen Ishikawa', 'Gwen', 'Ishikawa', null,
     'gwen.ishikawa@example.com', '587-555-0111', 'Referral', '{residential}'),
    (v_org, 'individual', 'active', 'Ray Delorme', 'Ray', 'Delorme', null,
     'ray.delorme@example.com', '587-555-0112', 'Google', '{residential}'),
    (v_org, 'individual', 'lead', 'Tomasz Nowak', 'Tomasz', 'Nowak', null,
     'tomasz.nowak@example.com', '587-555-0113', 'Website', '{residential}');
  select jsonb_object_agg(display_name, id) into v_c from public.clients where organization_id = v_org;

  insert into public.properties (organization_id, client_id, name, address_line1, city, region, postal_code,
                                 location, geocoded_at, geocode_source)
  select v_org, (v_c ->> p.client)::uuid, p.name, p.address, 'Edmonton', 'AB', p.postal,
         extensions.st_setsrid(extensions.st_makepoint(p.lon, p.lat), 4326)::extensions.geography, now(), 'manual'
  from (values
    ('Castle Downs Plaza', 'Front lot',  '15277 Castle Downs Rd NW', 'T5X 3Y9', -113.5160, 53.6180),
    ('Gwen Ishikawa',      null,         '16012 85 St NW',           'T5Z 3B9', -113.4720, 53.6230),
    ('Ray Delorme',        null,         '13512 127 St NW',          'T5L 1B1', -113.5420, 53.5960),
    ('Tomasz Nowak',       null,         '17104 95 St NW',           'T5Z 2Y6', -113.4880, 53.6320)
  ) as p(client, name, address, postal, lon, lat);

  -- A recurring job with visits for the next eight weeks.
  v_client := (v_c ->> 'Gwen Ishikawa')::uuid;
  insert into public.jobs (organization_id, client_id, property_id, kind, title, rrule, start_date, window_start,
                           window_minutes, visit_duration_minutes, preferred_crew_id)
  select v_org, v_client, p.id, 'recurring', v_rec_name, 'FREQ=WEEKLY;BYDAY=MO,TH', v_today,
         case when v_green then time '09:00' else time '06:00' end, 180, 30, v_crew
  from public.properties p where p.organization_id = v_org and p.client_id = v_client
  returning id into v_job;
  insert into public.job_line_items (organization_id, job_id, service_id, position, description, unit_price_cents)
  values (v_org, v_job, (v_s ->> v_rec_name)::uuid, 1, v_rec_name, case when v_green then 4900 else 5900 end)
  returning id into v_line;
  insert into public.job_line_item_taxes (organization_id, line_item_id, tax_rate_id) values (v_org, v_line, v_gst);
  perform public.generate_visits(v_job,
    array(select d::date from generate_series(v_today, v_today + 55, interval '1 day') d
          where extract(isodow from d)::int in (1, 4)),
    v_today + 55);

  -- Requests: one new, one with a draft quote.
  insert into public.requests (organization_id, service_id, contact_name, contact_email, contact_phone, address, notes,
                               source, submitted_at)
  values (v_org, (v_s ->> v_rec_name)::uuid, 'Priscilla Dube', 'priscilla.dube@example.com', '587-555-0120',
          '11420 140 Ave NW, Edmonton, AB', 'Corner lot near the school.', 'web_form', now() - interval '7 hours');

  v_client := (v_c ->> 'Ray Delorme')::uuid;
  insert into public.requests (organization_id, client_id, service_id, contact_name, contact_email, contact_phone,
                               address, notes, source, submitted_at)
  values (v_org, v_client, (v_s ->> 'Fall cleanup')::uuid, 'Ray Delorme', 'ray.delorme@example.com', '587-555-0112',
          '13512 127 St NW, Edmonton, AB', 'Big elm out front.', 'phone', now() - interval '3 days')
  returning id into v_req;
  v_q := public.create_quote_draft(v_req);
  update public.quotes
  set property_id = (select id from public.properties where organization_id = v_org and client_id = v_client),
      valid_until = v_today + 30
  where id = v_q;
  insert into public.quote_line_items (organization_id, quote_id, service_id, position, description, quantity,
                                       unit_price_cents, frequency, season_start_month, season_end_month)
  values (v_org, v_q, (v_s ->> 'Fall cleanup')::uuid, 1, 'Fall cleanup', 1, 27500, 'one_time', 9, 11);
  insert into public.quote_line_item_taxes (organization_id, line_item_id, tax_rate_id)
  select v_org, id, v_gst from public.quote_line_items where organization_id = v_org and quote_id = v_q;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'seeded % (%)', v_slug, v_org;
end;
$$;

-- Service areas: a Calgary region with four areas (one unowned, and a
-- higher-priority downtown area overlapping NW and NE), a second crew, and
-- Calgary properties inside and outside them. Hand-picked coordinates; no
-- provider calls. Triggers derive properties.service_area_id.
--
-- Idempotent: runs once per demo org (skips if it already has a region).
do $$
declare
  v_org uuid;
  v_truck1 uuid;
  v_truck2 uuid;
  v_region uuid;
  v_downtown uuid;
  v_client uuid;
begin
  select id into v_org from public.organizations where slug = 'absolute-demo';
  if v_org is null then
    raise notice 'demo org not found; run the seed above first';
    return;
  end if;
  if exists (select 1 from public.service_regions where organization_id = v_org) then
    raise notice 'demo service areas already exist; skipping';
    return;
  end if;

  select id into v_truck1
  from public.crews
  where organization_id = v_org and name in ('Truck 1', 'Truck 1 - West')
  order by case name when 'Truck 1' then 0 else 1 end
  limit 1;
  select id into v_truck2
  from public.crews
  where organization_id = v_org and name in ('Truck 2', 'Truck 2 - East')
  order by case name when 'Truck 2' then 0 else 1 end
  limit 1;
  if v_truck2 is null then
    insert into public.crews (organization_id, name, color, vehicle, default_start_location, max_work_minutes)
    values (v_org, 'Truck 2', '#2563eb', 'F-150 #2', 'SRID=4326;POINT(-114.0719 51.0447)', 480)
    returning id into v_truck2;
  end if;

  insert into public.service_regions (organization_id, name, center, bbox, source)
  values (v_org, 'Calgary', 'SRID=4326;POINT(-114.0719 51.0447)',
          extensions.st_makeenvelope(-114.32, 50.84, -113.86, 51.21, 4326), 'manual')
  returning id into v_region;

  insert into public.service_areas (organization_id, crew_id, region_id, name, color, priority, boundary) values
    (v_org, v_truck1, v_region, 'NW Calgary', '#16a34a', 0,
     extensions.st_multi(extensions.st_makeenvelope(-114.25, 51.06, -114.07, 51.18, 4326))),
    (v_org, v_truck2, v_region, 'NE Calgary', '#2563eb', 0,
     extensions.st_multi(extensions.st_makeenvelope(-114.07, 51.05, -113.92, 51.18, 4326))),
    (v_org, null, v_region, 'South Calgary (unassigned)', '#9ca3af', 0,
     extensions.st_multi(extensions.st_makeenvelope(-114.20, 50.88, -113.95, 51.03, 4326)));
  -- Overlaps the south edge of NW and NE Calgary; priority 10 wins there.
  insert into public.service_areas (organization_id, crew_id, region_id, name, color, priority, boundary)
  values (v_org, v_truck2, v_region, 'Downtown core', '#ca8a04', 10,
          extensions.st_multi(extensions.st_makeenvelope(-114.10, 51.03, -114.03, 51.07, 4326)))
  returning id into v_downtown;
  -- Saturdays downtown go to Truck 1.
  insert into public.service_area_rotations (organization_id, service_area_id, weekday, crew_id)
  values (v_org, v_downtown, 6, v_truck1);

  insert into public.clients (organization_id, kind, display_name, company_name, email, phone)
  values (v_org, 'company', 'Bow River Property Group', 'Bow River Property Group Inc.', 'ops@example.com', '403-555-0140')
  returning id into v_client;
  insert into public.properties (organization_id, client_id, name, address_line1, city, region, postal_code, location, geocoded_at, geocode_source)
  values
    -- Downtown core only.
    (v_org, v_client, 'Kensington', '1120 Kensington Rd NW', 'Calgary', 'AB', 'T2N 3P5', 'SRID=4326;POINT(-114.0880 51.0530)', now(), 'manual'),
    -- Downtown core and NE Calgary: downtown wins on priority.
    (v_org, v_client, 'Crescent Heights', '120 16 Ave NE', 'Calgary', 'AB', 'T2E 1J5', 'SRID=4326;POINT(-114.0650 51.0650)', now(), 'manual'),
    (v_org, v_client, 'Tuscany', '400 Tuscany Valley Dr NW', 'Calgary', 'AB', 'T3L 2L7', 'SRID=4326;POINT(-114.2390 51.1240)', now(), 'manual'),
    (v_org, v_client, 'Saddle Ridge', '80 Saddlecrest Blvd NE', 'Calgary', 'AB', 'T3J 5L1', 'SRID=4326;POINT(-113.9480 51.1270)', now(), 'manual'),
    -- Unowned area.
    (v_org, v_client, 'Lake Bonavista', '1000 Lake Bonavista Dr SE', 'Calgary', 'AB', 'T2J 0M8', 'SRID=4326;POINT(-114.0560 50.9440)', now(), 'manual'),
    -- Outside every area.
    (v_org, v_client, 'Cochrane yard', '205 1 St W', 'Cochrane', 'AB', 'T4C 1A5', 'SRID=4326;POINT(-114.4670 51.1890)', now(), 'manual');
  -- Not geocoded yet.
  insert into public.properties (organization_id, client_id, name, address_line1, city, region, postal_code)
  values (v_org, v_client, 'Bridgeland', '920 McDougall Rd NE', 'Calgary', 'AB', 'T2E 7H9');

  raise notice 'seeded demo service areas in org %', v_org;
end;
$$;
