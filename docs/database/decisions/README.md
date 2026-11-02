# Architecture decision records

Each ADR records one decision, the context behind it, and its consequences.
To change a decision, add a new ADR that supersedes the old one; don't
rewrite history.

| #    | Decision                                                                                       | Status             |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------ |
| 0001 | [Supabase SQL migrations are the schema source of truth](0001-supabase-sql-source-of-truth.md) | Accepted           |
| 0002 | [Multi-tenancy with composite FKs and RLS](0002-multi-tenancy-composite-fks-rls.md)            | Accepted           |
| 0003 | [UUIDv7 primary keys](0003-uuidv7-ids.md)                                                      | Accepted           |
| 0004 | [Money as integer cents](0004-money-integer-cents.md)                                          | Accepted           |
| 0005 | [RRULE recurrence with materialized visits](0005-rrule-materialized-visits.md)                 | Accepted           |
| 0006 | [External route optimizer, results stored in Postgres](0006-external-route-optimizer.md)       | Accepted           |
| 0007 | [Prisma queries run under RLS via `withRls()`](0007-prisma-and-rls.md)                         | Superseded by 0009 |
| 0008 | [Stripe Connect for client payments](0008-stripe-connect.md)                                   | Accepted           |
| 0009 | [App data access goes through supabase-js, under RLS](0009-supabase-js-data-access.md)         | Accepted           |
| 0010 | [Rebaseline the migrations before launch](0010-pre-launch-rebaseline.md)                       | Accepted           |
| 0011 | [Workers use RPCs, not table policies](0011-worker-rpcs.md)                                    | Accepted           |
| 0012 | [Service areas: PostGIS polygons and a derived property area](0012-service-areas.md)           | Accepted           |
