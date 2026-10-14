-- The remote was missing the INSERT and UPDATE column grants that the crews
-- migration declares (only SELECT was present). Re-assert all three so the
-- crew builder's writes work. Grants are idempotent.
grant insert (organization_id, crew_id, member_id, is_lead) on public.crew_members to authenticated;
grant update (is_lead) on public.crew_members to authenticated;
grant delete on public.crew_members to authenticated;
