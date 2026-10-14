-- move_crew_member deletes a member's previous crew rows. Grant DELETE
-- explicitly rather than relying on default privileges; the "Office staff can
-- remove crew members" RLS policy still limits who can use it.
grant delete on public.crew_members to authenticated;
