# 0006. External route optimizer, results stored in Postgres

- **Status**: Accepted
- **Date**: 2026-09-29

## Context

Auto-optimizing routes is a vehicle routing problem with time windows
(VRPTW): several crews, customer arrival windows, visit durations, and crew
start/end depots and capacity. pgRouting solves shortest paths on a road
graph we'd have to load and maintain, and it's weak at multi-vehicle VRPTW.

## Decision

- Postgres stores the inputs: `properties.location` (PostGIS
  `geography(Point)`), visit windows and durations, and crew depots and
  capacity.
- An **external solver**, called from server code, computes routes. Options
  include Google Route Optimization API, Mapbox Optimization, or
  self-hosted VROOM with OSRM. The schema is provider-agnostic
  (`optimization_runs.provider`).
- Results are written back as `routes` and `route_stops`. The runs table
  keeps each request and response for debugging.
- `route_stops.visit_id` is unique, and that row **is** the crew assignment.
  There's no separate `visits.crew_id` to drift out of sync.

## Consequences

- The provider can be swapped without schema changes.
- Geocoding must happen before routing. Visits whose property has no
  location are reported as unassigned.
- Solver cost and latency are external. Runs are asynchronous
  (`queued → running → succeeded/failed`).
