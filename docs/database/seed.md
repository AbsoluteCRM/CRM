# Demo data

`supabase/seed.sql` loads two demo organizations into a Supabase project,
and `supabase/seed/teardown.sql` removes them. Both are plain SQL. Run them
with the Supabase MCP `execute_sql` tool (pass the whole file) or with psql.

| Slug             | Name                         | Purpose                                                     |
| ---------------- | ---------------------------- | ----------------------------------------------------------- |
| `absolute-demo`  | Absolute Landscaping (Demo)  | The full demo. Every live screen has data in it             |
| `northside-demo` | Northside Snow & Yard (Demo) | A small second tenant, for checking that tenants stay apart |

## Prerequisites

- The migrations in `supabase/migrations/` are applied.
- At least one user has signed up. The seed makes the **first user in
  `auth.users`** (oldest `created_at`) the owner of both orgs. To choose a
  different user, set `seed.owner_email` in the same session or
  `execute_sql` call, before the seed:

  ```sql
  select set_config('seed.owner_email', 'you@example.com', false);
  ```

  If no user exists, the seed creates nothing and raises a notice. If
  `seed.owner_email` names no user, it raises an error and creates nothing.

## Apply

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

Or pass the file's contents to `execute_sql`. The seed is idempotent: each
org is skipped, with a notice, if its slug already exists. Re-running it
changes nothing. To get fresh data (for example, the dates have gone stale),
run the teardown and then the seed again.

The seed checks only the slug. If you have `absolute-demo` from the older,
smaller seed, the new seed skips it. Run the teardown first to replace it.

## Remove

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/teardown.sql
```

The teardown deletes the two demo orgs and everything in them, including
anything people added to them while using the demo. It never touches other
orgs or auth users. Deleting an org cascades, but several foreign keys are
`on delete restrict` (payments, invoice visits, jobs, quotes, requests,
routes, shifts, taxes), and a single cascade can reach them in any order.
So the script deletes those children first and the organization last. A
missing slug is skipped with a notice, so it is safe to re-run.

## What `absolute-demo` contains

An Edmonton landscaping and snow-removal company (America/Edmonton, CAD,
GST only). All dates are relative to the day you run the seed. The recurring
work follows the season: **lawn mowing** (08:00 window) if you seed between
April and October, otherwise **snow clearing** (05:00 window). The one-off
cleanups are spring cleanups from February to June and fall cleanups
otherwise.

| Table                                 | Rows    | Notes                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organization_members`                | 14      | The owner (your login) plus 13 members without a login: an admin, a dispatcher, 9 active workers, 1 `invited` worker, 1 `disabled` worker                                                                                                                                    |
| `organization_invitations`            | 3       | One linked to the invited worker, one pending without a member row, one expired. Token hashes are random, so the links can't be used                                                                                                                                         |
| `member_pay_rates`                    | 10      | One per worker, plus a raise for one crew lead                                                                                                                                                                                                                               |
| `crews` / `crew_members`              | 3 / 8   | Truck 1 - West, Truck 2 - East, Truck 3 - Commercial, each with a lead. One active worker has no crew. Built with `move_crew_member` and `set_crew_lead`                                                                                                                     |
| `tax_rates` / `service_default_taxes` | 1 / 13  | GST 5%                                                                                                                                                                                                                                                                       |
| `services`                            | 13      | 12 active and 1 archived. Every unit (`monthly`, `hour`, `visit`, `sqft`, `linear_ft`, `yard`, `bag`), every frequency, seasons that wrap over new year (Nov to Mar), one year-round, and every precipitation setting (`rain`/`snow`/`any`, `schedule`/`reschedule`, `none`) |
| `clients`                             | 33      | 25 individuals and 7 companies, plus one created from a request by `create_quote_draft`. 24 active, 5 leads, 4 inactive (1 archived), 1 tax exempt                                                                                                                           |
| `client_contacts`                     | 8       | On the companies, with primary and billing contacts                                                                                                                                                                                                                          |
| `properties`                          | 33      | Geocoded points around Edmonton. The HOA has two                                                                                                                                                                                                                             |
| `requests`                            | 14      | Every status: submitted 5, reviewing 2 (one with an `info_needed` note, one with a draft quote), estimated 2, approved 1, converted 1, rejected 2, scheduled 1. Every source: `web_form`, `phone`, `email`, `client_portal`. Some have no client yet                         |
| `quotes` / `quote_line_items`         | 8 / 13  | Q-1001 to Q-1008: draft, sent, expired (superseded by revision 2), sent (revision 2, 10% off), approved (optional line selected), converted, declined, and a draft made without a request. Lines carry frequencies and season months, with GST                               |
| `quote_share_tokens`                  | 6       | One per send. Hashes of random tokens, so the quote links can't be opened                                                                                                                                                                                                    |
| `jobs`                                | 23      | 15 recurring (weekly, biweekly, and Mon/Wed/Fri; per visit and monthly billing; one converted from the approved quote), 1 on hold, and 7 one-off (2 done, 3 today, 2 upcoming, one of them for the `scheduled` request)                                                      |
| `visits`                              | ~185    | From three weeks ago to eight weeks ahead. Past visits are completed by the crew lead, except one skipped and one no-show. One callback is unscheduled                                                                                                                       |
| `routes` / `route_stops`              | ~6 / ~9 | One route per crew with work today (published) and tomorrow (draft), stops ordered west to east. Rosters come from the crews. Counts depend on the weekday                                                                                                                   |
| `invoices` / `payments`               | 9 / 4   | Paid (e-transfer, cheque), partly paid (cash), open, overdue, tax exempt, void and re-billed, and a monthly draft for the HOA with a billing period                                                                                                                          |

## What `northside-demo` contains

The same owner, so the org switcher shows both demo orgs: 2 workers without
a login in one crew, GST, 3 services, 4 clients with properties, a recurring
job with 16 visits, a new request, and a request with a draft quote (Q-1001,
its own numbering). Its names don't overlap with `absolute-demo`'s, so
anything leaking across tenants is easy to spot. Because one user owns both,
this checks the app's org filter. To check RLS between users, sign up a
second user, who sees neither demo org.

## How it writes

The seed runs as the database owner, so RLS doesn't apply. Inside each block
it sets `request.jwt.claims` to the owner (transaction-local), so the app's
own functions run as they do for a signed-in owner: `create_quote_draft`,
`send_quote`, `record_quote_delivery`, `generate_visits`,
`create_invoice_for_visits`, `move_crew_member` and `set_crew_lead`. Quote
approval and decline go through `portal_token_approve` and
`portal_token_decline` with the claims cleared, as the service role calls
them from the public quote page. So `approved_by_user_id` is null, as it is
for a real client approval.

No derived column is written directly. Document numbers, line amounts, tax
snapshots, totals, amount paid, invoice status, visit windows, route rosters
and planned starts, and request statuses all come from the schema's triggers
and functions. `created_by`-style columns are stamped with the owner.

Some rows are written directly, because there is no function for them or
the function doesn't fit:

- **Requests** are inserted directly (as staff-entered requests), not through
  `submit_request`, which allows 5 submissions per IP per hour.
  `submitted_at` is backdated. The `rejected` and `scheduled` statuses are
  set directly, as staff do.
- **Quote lines and line taxes** are inserted directly, as the quote builder
  does.
- **Jobs, job lines, visit completion, routes, route stops, invoice issue
  and payments** are plain inserts and updates, as the app's future screens
  will do. Issue dates, `sent_at` and `paid_at` are backdated.

## Caveats

- The data is a snapshot of the day you seed. Visits are generated for
  eight weeks, and only today's and tomorrow's routes exist. Re-seed
  (teardown, then seed) to bring it back to today.
- Quote links, invitation links and Stripe are not usable: tokens are
  random and never stored, and no Stripe ids exist.
- All emails are `@example.com` and phone numbers are `555-01xx`. Street
  addresses follow Edmonton's grid but the people and businesses are made
  up.
- Shifts, visit time entries, attachments, portal users and optimization
  runs are not seeded.
- The seed was validated on a local PostgreSQL 16 with PostGIS, pgTAP and
  pg_cron, and with stand-ins for Supabase's `auth` and `storage` schemas.
  The project runs PostgreSQL 17.

## Check what was loaded

```sql
select o.slug,
  (select count(*) from public.clients c where c.organization_id = o.id) as clients,
  (select count(*) from public.requests r where r.organization_id = o.id) as requests,
  (select count(*) from public.quotes q where q.organization_id = o.id) as quotes,
  (select count(*) from public.jobs j where j.organization_id = o.id) as jobs,
  (select count(*) from public.visits v where v.organization_id = o.id) as visits,
  (select count(*) from public.invoices i where i.organization_id = o.id) as invoices
from public.organizations o
where o.slug in ('absolute-demo', 'northside-demo');
```
