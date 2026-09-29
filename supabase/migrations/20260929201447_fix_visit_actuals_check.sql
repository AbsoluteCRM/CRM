-- Fix: a visit moved straight to 'completed' (e.g. marked done after the
-- fact) gets actual_start = actual_end = now() from the on_update trigger.
-- The strict `actual_end > actual_start` check rejected that. Allow equal
-- times, require a start whenever there's an end, and give the constraint a
-- real name.

alter table public.visits drop constraint visits_check3;
alter table public.visits add constraint visits_actuals_check
  check (actual_end is null or (actual_start is not null and actual_end >= actual_start));
