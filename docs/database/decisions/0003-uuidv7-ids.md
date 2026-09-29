# 0003. UUIDv7 primary keys

- **Status**: Accepted
- **Date**: 2026-09-29

## Context

IDs appear in URLs, portal links, and the mobile app, and they're created by
several writers (app, webhooks, cron). Sequential `bigint` IDs leak business
volume and can be enumerated. Random UUIDv4 fragments B-tree indexes on
large tables such as visits, stops, and time entries. The project runs
Postgres 17, which has no built-in `uuidv7()` (that arrives in PG 18), and
Supabase doesn't offer `pg_uuidv7`.

## Decision

All primary keys are `uuid default private.uuid_generate_v7()`, a small SQL
function that overlays a 48-bit millisecond timestamp on
`gen_random_uuid()` and sets the version bits to 7. Human-facing numbers
(`INV-1042`) are separate columns (see `document_sequences`).

## Consequences

- IDs are time-ordered, so inserts append to the right of the index.
- IDs reveal their creation time to the millisecond. That's acceptable for
  this domain.
- After upgrading to PG 18, the default can switch to the built-in
  `uuidv7()` with no data change.
