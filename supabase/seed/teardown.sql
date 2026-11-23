-- Removes the demo organizations created by supabase/seed.sql
-- ('absolute-demo' and 'northside-demo') and everything in them, including
-- anything people added to those orgs while using the demo. Other
-- organizations are not touched. Auth users are not touched.
--
-- Safe to re-run: a slug that doesn't exist is skipped with a notice.
--
-- Deleting an organization cascades to most of its rows, but several foreign
-- keys are ON DELETE RESTRICT (payments -> invoices, invoice_visits ->
-- visits, jobs/quotes -> clients and properties, quotes -> requests,
-- requests -> services, routes -> crews, shifts and time entries ->
-- members, taxes -> tax_rates). A single cascade can hit those in any order,
-- so the restricted children are deleted first, parents last.
--
-- Run with the Supabase MCP execute_sql tool (pass the whole file) or
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/teardown.sql

do $$
declare
  v_slug text;
  v_org uuid;
begin
  foreach v_slug in array array['absolute-demo', 'northside-demo']
  loop
    select id into v_org from public.organizations where slug = v_slug;
    if v_org is null then
      raise notice '% not found; nothing to remove', v_slug;
      continue;
    end if;

    -- Money first: payments block invoice deletes, and invoice_visits
    -- (cascaded from invoices) block visit deletes.
    delete from public.payments where organization_id = v_org;
    delete from public.invoices where organization_id = v_org;

    -- Time tracking blocks member deletes.
    delete from public.visit_time_entries where organization_id = v_org;
    delete from public.shifts where organization_id = v_org;

    -- Routes block crew deletes (stops and rosters cascade).
    delete from public.routes where organization_id = v_org;
    delete from public.optimization_runs where organization_id = v_org;

    -- Jobs (lines, taxes, visits, attachments cascade) block clients and
    -- properties; quotes block clients, properties and requests; requests
    -- block services.
    delete from public.jobs where organization_id = v_org;
    delete from public.quotes where organization_id = v_org;
    delete from public.requests where organization_id = v_org;
    delete from public.properties where organization_id = v_org;
    delete from public.clients where organization_id = v_org;

    -- Everything left (members, invitations, pay rates, crews, services,
    -- tax rates, document numbers, the submission log) cascades.
    delete from public.organizations where id = v_org;

    raise notice 'removed % (%)', v_slug, v_org;
  end loop;
end;
$$;
