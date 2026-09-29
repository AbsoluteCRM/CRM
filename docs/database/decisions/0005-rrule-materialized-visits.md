# 0005. RRULE recurrence with materialized visits

- **Status**: Accepted
- **Date**: 2026-09-29

## Context

Recurring work (weekly mowing, bi-weekly cleanup, monthly fertilizing) is
the core of the business. The dispatcher, the optimizer, workers, and
invoicing all need **concrete rows** for "the visit on June 3". Individual
occurrences are routinely moved, skipped, or edited without changing the
rule.

## Decision

- `jobs.rrule` stores an RFC 5545 RRULE (without DTSTART). `jobs.start_date`
  and `end_date` bound it, interpreted in the org timezone.
- Visits are **materialized** a rolling `visit_horizon_weeks` ahead (default
  8). `jobs.generated_through` is the watermark.
- `unique (job_id, occurrence_date)` makes generation idempotent.
- An edited or moved visit gets `is_exception = true`, and regeneration never
  touches it.
- The rule is expanded in app code (the `rrule` npm package), which is better
  tested than any plpgsql RRULE parser. It runs from pg_cron (nightly, via
  `pg_net` to an endpoint) and whenever a job is created or edited.

## Alternatives considered

- **Structured columns** (frequency/interval/weekday, like the old
  `service_bookings`): can't express "every other Tue and Thu" or "monthly on
  the last Friday".
- **Virtual occurrences** (expand on read): every consumer would need
  expansion logic, exceptions would need a separate override table, and the
  optimizer and invoices couldn't reference a stable visit id.

## Consequences

- Changing a rule has to delete and regenerate future, non-exception,
  unrouted visits.
- Visits past the horizon don't exist yet, so long-range reports must expand
  the rule.
