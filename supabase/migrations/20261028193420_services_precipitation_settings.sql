-- Service preferences for future precipitation recommendations.
-- These settings do not schedule work or generate weather flags.

create type public.service_precipitation_type as enum ('none', 'rain', 'snow', 'any');
create type public.service_precipitation_action as enum ('none', 'schedule', 'reschedule');

alter table public.services
  add column precipitation_type public.service_precipitation_type not null default 'none',
  add column precipitation_action public.service_precipitation_action not null default 'none',
  add constraint services_precipitation_pair_check
    check ((precipitation_type = 'none') = (precipitation_action = 'none'));

comment on column public.services.precipitation_type is
  'Precipitation relevant to this service. Any means rain or snow. None disables the preference.';
comment on column public.services.precipitation_action is
  'Suggested admin action for future weather recommendations; does not automatically change schedules.';

grant insert (precipitation_type, precipitation_action) on public.services to authenticated;
grant update (precipitation_type, precipitation_action) on public.services to authenticated;
