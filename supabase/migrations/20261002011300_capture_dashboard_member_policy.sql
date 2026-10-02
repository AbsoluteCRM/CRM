-- Capture drift: this policy was created in the Supabase dashboard, outside
-- any migration. It is recorded here exactly as found on the live database
-- (2026-10-01), so the migrations once again describe the schema. Behaviour
-- is unchanged: a user can see their own organization_members rows in every
-- status (invited, disabled), not only active ones.
--
-- It is the second permissive SELECT policy on organization_members, which is
-- what the performance advisor's multiple_permissive_policies warning
-- reports. The schema-hardening work decides whether to keep it.

drop policy if exists "Enable users to view their own data only" on public.organization_members;
create policy "Enable users to view their own data only"
  on public.organization_members for select to authenticated
  using ((select auth.uid()) = user_id);
