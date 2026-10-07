# 0011. Workers use RPCs, not table policies

- **Status**: Accepted (2026-10-07)
- **Date**: 2026-10-07

## Context

Office staff and workers are both the `authenticated` role, and RLS is
row-only. A worker policy on `clients`, `jobs`, `properties`, or `visits`
therefore exposes every column, including `clients.notes`,
`jobs.internal_notes`, and `stripe_customer_id`. It also forced
`office OR worker` policies whose worker branch ran a multi-table helper on
every query.

## Decision

Workers get no policies on domain tables. `worker_*` security definer
functions return crew-safe columns for routes the caller is rostered on
(published or in progress) and perform the few things a worker does:
start, complete, or no-show a visit; attach a photo; clock in and out. All
times come from the server clock. Completed routes and billed visits are
read-only. Storage policies give workers only the
`{org}/visits/{visit_id}/` folders of their visits. Workers keep plain reads
on services, crews, crew members, the staff roster, and their organization.
This is the same pattern the portal already uses.

## Consequences

- Every tenant policy is a single indexable condition.
- The mobile app calls RPCs only. A new field a worker needs means changing
  a function, which is deliberate.
- The `guard_worker_visit_update` trigger and the `worker_*_ids` helpers
  are gone.
