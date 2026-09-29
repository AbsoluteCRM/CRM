# 0004. Money as integer cents

- **Status**: Accepted
- **Date**: 2026-09-29

## Context

Money flows through quotes, invoices, tax reports, Stripe, and the
TypeScript app. `numeric` maps to Prisma `Decimal`, which is awkward in JS.
Floats are wrong. Stripe represents amounts as integer minor units.

## Decision

- Amounts are `bigint` columns named `*_cents`, in the organization's
  currency (`organizations.currency`, one per org).
- Quantities are `numeric(10,2)`, and percentages are `numeric(7,4)`.
- Line amounts round `quantity × unit_price_cents` to the nearest cent. Tax
  is computed per line, per rate, rounded, and then summed.
- Document totals are trigger-maintained or generated columns, so they
  always equal the sum of their lines.

## Consequences

- Stripe amounts map 1:1. JS `number` is safe up to about $90 trillion.
- Currencies with no minor unit (JPY) or 3-decimal units would need a
  per-currency exponent. That's out of scope while currencies are CAD/USD.
