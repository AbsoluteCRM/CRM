-- Drop the tables that were created in the Supabase dashboard before
-- migrations existed. They're replaced by the design in docs/database/.
-- They held one test organization and one member, which get re-seeded later.
-- The Supabase-managed event trigger function public.rls_auto_enable stays.

drop table if exists
  public.appointments,
  public.service_bookings,
  public.customers,
  public.services,
  public.profiles,
  public.organization_member,
  public.organization;

drop type if exists
  public.appointment_status,
  public.recurrence_frequency,
  public.service_type,
  public.member_role;
