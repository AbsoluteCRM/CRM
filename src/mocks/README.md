# Demo store (`src/mocks/`)

`crm-store.ts` is an in-memory store (`useSyncExternalStore`) seeded by
`crm-seed.ts` with two made-up companies. It backs the screens that do not
have live procedures yet. Nothing in it is saved: a reload resets it, and it
never reads or writes Supabase. `crm-types.ts` holds its shapes.

Rules while it exists:

- Only screens import from `#/mocks/*`. Data hooks in `src/integrations/**`
  must not.
- Permissions never come from here. UI gating uses `useRole()` from
  `#/integrations/organization/use-role` (the real `organization_members.role`).
  `useTenant()` only uses that role to pick which demo rows to show.
- Where a screen shows demo values beside live data, mark them with
  `<SampleDataBadge />` or `<SampleDataNote />` from `./SampleDataBadge`.
  Remove the badge when the value is wired to a real procedure.

## Screens that still read it

| Screen                                | Live today                                | Still demo                                                                                      |
| ------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Clients (`/clients`)                  | client list, contact edits, status, notes | properties (edits stay in memory), lifetime value, outstanding, invoices, job history, timeline |
| Team (`/teams`)                       | members, invites, crews and crew builder  | out today, ratings, availability, time off, performance, member profile                         |
| Services (`/services`)                | catalog, edits, seasons, precipitation    | "N jobs · 30d" usage and revenue                                                                |
| Dashboard (`/dashboard`)              | weather, org name                         | every KPI, chart, crew list and activity                                                        |
| Jobs, Calendar (`/jobs`, `/calendar`) | none                                      | everything, including `JobDrawer` and `JobFormModal`                                            |
| Settings (`/settings`)                | none                                      | company profile, hours, plan, roles and security tabs                                           |
| Onboarding (`/onboarding`)            | none                                      | `actions.createOrganization` creates the company in memory only                                 |
| Header and side panel                 | org switcher, role label                  | global search, notifications, the requests count on the nav                                     |

Onboarding never creates a real organization. The `create_organization(p_name,
p_slug, p_timezone, p_currency, p_country)` RPC
(`supabase/migrations/20261002014238_tenancy_identity.sql`) exists and is
unused; wire onboarding to it, then call `reloadAndSelectOrganization(id)`.

## Replacement checklist

Each mock collection, and what replaces it. Tables are in
`supabase/migrations/` and `src/types/database.ts`; procedures in
`src/integrations/trpc/`.

- [ ] **organizations** (`Organization`): `organizations` table (name,
      address, timezone, currency, `settings` jsonb for hours and service
      areas). Create with the `create_organization` RPC. Plan and billing have
      no table yet (`stripe_account_id` only).
- [ ] **members** (`Member`): `organization_members` (live through
      `useTeamMembers()` and `teams.invite`). Title, certifications, work days,
      rating and joined date have no columns. Pay rates are in
      `member_pay_rates`. Time off (`TimeOff`) has no table.
- [ ] **crews** (`Crew`): `crews` + `crew_members` (live through
      `crews.list` and the crew mutations). Screens still on the mock crews:
      jobs, calendar, dashboard, team availability.
- [ ] **clients** (`Client`): `clients` (live through `clients.list`,
      `create`, `update`). The mock list is still used for lookups on jobs,
      dashboard and search.
- [ ] **properties** (`Property`): `properties` (`address_*`,
      `lot_size_sqft`, `access_notes`, `location`). Gate code, pets and
      instructions have no columns. No procedure yet.
- [ ] **services** (`Service`): `services` (live through `services.list` and
      mutations; `toService` maps rows). Mock services remain only for jobs.
- [ ] **requests** (`ServiceRequest`): `requests` (live through
      `requests.list` and the portal). The mock list still drives the
      dashboard, header notifications and the nav count.
- [ ] **quotes** (`Quote` on a request): `quotes` + `quote_line_items`
      (live through `quotes.*`).
- [ ] **jobs** (`Job`): `jobs` (recurring schedule) + `visits` (each
      occurrence; status, completion notes), crew assignment through
      `routes` / `route_stops`. Photos are `attachments`. No procedure yet.
- [ ] **invoices** (`Invoice`, `Payment`): `invoices`, `invoice_line_items`,
      `invoice_visits`, `payments`; `create_invoice_for_visits` RPC. No
      procedure yet.
- [ ] **activity** (`Activity`): no table. Derive from the rows above or add
      an audit table.
- [ ] **weather** (`forecastFor`): replaced by `weather.forecast`; the mock
      forecast is unused by the dashboard.

When the last screen stops importing `#/mocks/crm-store`, delete this folder.
