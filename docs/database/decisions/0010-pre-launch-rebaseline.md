# 0010. Rebaseline the migrations before launch

- **Status**: Accepted (2026-10-07)
- **Date**: 2026-10-07
- **Amends**: [0001](0001-supabase-sql-source-of-truth.md) (the "never edit an
  applied migration" rule, once).

## Context

A schema audit (2026-10-01) found problems that cut across every domain:
columns writable through the API that must be derived (invoice
`amount_paid_cents`, `organizations.stripe_account_id`), an admin path to
owner, policies and triggers that scan whole tables instead of using
`(organization_id, …)` indexes, lost updates in totals and payments, and one
bad row able to stop nightly invoicing for every organization. Fixing them as
forward migrations would mean rewriting most policies, functions, and grants
as drop and recreate on top of 14 files. There is no production data.

## Decision

Replace the 14 incremental migrations with 11 domain files that have every
fix built in, reset the remote project, and apply them in order. This
happens once, before launch. After the PR that lands it merges, ADR 0001's
rule holds again: applied migrations are never edited.

## Consequences

- The migrations read as the schema, with no fix-on-fix layering.
- The remote reset is destructive (demo data and migration history). It is
  done by the main agent with the user's explicit approval.
- Open branches that touch `supabase/migrations/` must be rebased onto the
  new set.
