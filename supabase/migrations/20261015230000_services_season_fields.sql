-- Services page fields: the months a service is offered, its calendar color,
-- the equipment it needs, and the visit frequencies it supports.
-- See docs/database/tables/catalog-tax.md.

create type public.service_frequency as enum ('one_time', 'weekly', 'biweekly', 'monthly');

alter table public.services
  add column season_start_month smallint
    check (season_start_month between 1 and 12),
  add column season_end_month smallint
    check (season_end_month between 1 and 12),
  add column color text not null default '#7fb547'
    check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column equipment text[] not null default '{}',
  add column frequencies public.service_frequency[] not null default '{one_time}'
    check (cardinality(frequencies) > 0),
  add constraint services_season_both_or_neither
    check ((season_start_month is null) = (season_end_month is null));

comment on column public.services.season_start_month is
  'First month (1-12) the service is offered. Null with season_end_month = year-round.';
comment on column public.services.season_end_month is
  'Last month (1-12) the service is offered. A start after the end wraps over new year (11 to 3 = Nov-Mar).';

grant insert (season_start_month, season_end_month, color, equipment, frequencies)
  on public.services to authenticated;
grant update (season_start_month, season_end_month, color, equipment, frequencies)
  on public.services to authenticated;
