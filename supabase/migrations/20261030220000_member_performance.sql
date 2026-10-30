-- Worker performance and certifications, on the worker's own member row so
-- they stay with the person through crew moves, archives and deletes.
-- See docs/database/tables/tenancy.md ("organization_members").

alter table public.organization_members
  add column certifications text[] not null default '{}',
  add column jobs_completed integer not null default 0 check (jobs_completed >= 0),
  add column hours_worked numeric(8, 1) not null default 0 check (hours_worked >= 0),
  -- Average customer rating out of 5; null until a worker has one.
  add column rating numeric(2, 1) check (rating between 1 and 5);

-- Owners and admins already update member rows (RLS). Certifications are
-- edited in the app; the performance numbers are written by the database
-- (or the demo insert), never by the app.
grant update (certifications) on public.organization_members to authenticated;
