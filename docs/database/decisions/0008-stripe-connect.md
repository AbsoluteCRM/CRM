# 0008. Stripe Connect for client payments

- **Status**: Accepted
- **Date**: 2026-09-29

## Context

Clients pay the **contractor**, not AbsoluteCRM. Each organization needs its
own payouts, its own Stripe customer records, and its own tax and branding.

## Decision

- Each organization onboards a Stripe **Connect** account
  (`organizations.stripe_account_id`).
- Stripe customers are created on the connected account
  (`clients.stripe_customer_id`).
- Online payments create a `payments` row (`pending`, with
  `stripe_payment_intent_id`). The webhook moves it to `succeeded`,
  `failed`, or `refunded`.
- `stripe_events` gives webhook idempotency: insert the `evt_` id first, and
  skip the event if it's already there.
- Manual payments (cash, cheque, e-transfer) use the same `payments` table
  with no Stripe ids.

## Consequences

- Payments land in the contractor's own account. A platform fee can be added
  later with `application_fee_amount`.
- Billing organizations for their AbsoluteCRM subscription is a separate
  concern and out of scope.
