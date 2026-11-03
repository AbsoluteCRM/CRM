# 0015. Optimizer integration: a trusted runner and one write-back function

- **Status**: Accepted (2026-11-03)
- **Date**: 2026-11-03
- **Plan**: [route-optimizer.md](../../plans/route-optimizer.md) (roadmap
  `maps-service-areas`, phase 5)

## Context

[ADR 0006](0006-external-route-optimizer.md) chose an external solver whose
results are stored in Postgres, behind a provider-agnostic
`optimization_runs.provider`. Eric then chose a self-hosted VROOM with OSRM
(no per-request fees) and said the straight-line ordering from
`generate_draft_routes` stays as the fallback and the default when no
optimizer is configured. This ADR records how the app talks to the solver and
how a result is written back, under [ADR 0009](0009-supabase-js-data-access.md)
(user requests run under RLS; service role only in trusted code).

## Decision

- **The solver call is server code, not SQL.** `src/server/optimizer/` holds
  an `Optimizer` interface, a VROOM adapter (OSRM for road legs and the
  polyline) and a fake. `OPTIMIZER_PROVIDER` is `none` (default) or `vroom`;
  a hosted optimizer later is another adapter with `provider` set to its
  name, with no schema change.
- **Reads run as the user.** `routes.optimize` checks `can.manageJobs`, then
  reads inputs through `optimizer_inputs` on `ctx.supabase`, so RLS and an
  explicit office-role check scope them to the caller's organization.
- **Writes run as the service role, in one place.**
  `src/server/trusted/optimization-runner.ts` re-verifies that the caller is
  an active office member of the organization, inserts the run
  (`requested_by` set explicitly), stores the raw request and response in
  `optimization_run_payloads` (service role only), and calls
  `apply_optimization_results`. That function is `security invoker` and
  executable by `service_role` only, so its access control is the grant plus
  the runner's check; it scopes every statement to the organization and locks
  each route first.
- **One write-back function, one transaction.** It renumbers stops using the
  deferred sequence constraint, writes times, legs, totals and polyline, sets
  `status = 'optimized'`, and finishes the run. It skips (and reports) any
  route that is not `draft` / `optimized`, whose stops no longer match what the
  solver saw, or whose locked stop would move. Published, in-progress and
  completed routes are never changed.
- **Within-route only.** The optimizer reorders stops on each route. It does
  not move a visit to another crew: the service-area assignment is the
  dispatcher's intent. Locked stops keep their position; the unlocked stops
  fill the rest in solver order, and the runner re-times the whole route with
  OSRM.
- **Asynchronous with one active run.** A run is `queued`, then `running`, then
  `succeeded` or `failed`. A partial unique index allows one active run per
  organization and date; the runner fails runs stuck for 15 minutes before it
  creates a new one.
- **Fail soft.** No provider, a missing URL, an unreachable or slow solver, or
  a malformed response ends in a `failed` run with a plain message and routes
  untouched.
- **Staleness is computed, not stored per edit.** `routes.optimized_stop_count`
  and the run's `finished_at` let the app tell that an optimized route changed
  afterward, without touching the Route Builder functions.

## Consequences

- No client library, queue or webhook. The background work lives in the server
  process: fine for the self-hosted Nitro server, but a serverless host would
  cut it off. Move the runner behind a queue if hosting changes.
- The service role touches `routes` and `route_stops` in exactly one
  function. Its correctness rests on the runner's check and the function's own
  org scoping, both covered by tests.
- Solver coordinates live in the request sent to the solver and in
  `optimization_run_payloads`. They are not logged and are not in Sentry spans.
- Locked stops need OSRM to be re-timed. Without `OSRM_URL`, a route with a
  locked stop is skipped and reported.
- Vehicle capacity, cross-crew rebalancing and multi-day plans are left for
  later and need no schema change beyond what ADR 0006 already allows.
