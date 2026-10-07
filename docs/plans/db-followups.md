# Plan: Database follow-ups after the rebaseline

- **Slug / branch**: `db-followups` / `db/followups`
- **Tier**: full (db/ work). The plan-auditor round was not run; reviewer and security gates were.
- **Status**: implemented
- **Confidence**: 95%, because every item came from the reviewer and security
  reports or from checks against the live database
- **Plan-mode file**: none (scope set by the user: "Merge the PR and finish up your list")

## Original request

> Merge the PR and finish up your list.

## Goal

Close the follow-ups listed when PR #25 merged.

## What shipped

- Migration `20261007222040_followup_hardening`: payments can't change or be
  added on a void invoice; payment, invoice-visit, and route-stop guards lock
  the parent row; optimizer runs can only name their own organization's crews
  and visits.
- Migration `20261007223559_pending_payment_fix` (reviewer finding): a pending
  payment can still settle after its invoice is voided.
- Migration `20261007223741_route_stop_guard_lock_fix` (reviewer deadlock note):
  the stop-date guard locks the visit only on insert or visit change.
- Migration `20261007223941_void_payment_refund_fix` (reviewer finding): on a
  void invoice a settled payment can still move toward refunded.
- Migration `20261007224517_route_stop_race_fix` (security finding): reverts the guard to lock the visit on every stop write (route move vs reschedule race) and makes the reschedule unroute delete use NOT EXISTS.
- `supabase/tests/followup_hardening_test.sql`: 12 assertions, all passing.
- `createServerClient<Database>` / `createBrowserClient<Database>` in `src/lib/supabase/`.
- Full suites re-run on the final schema: `audit_regressions_test.sql` 36/36,
  `review_fixes_test.sql` 12/12.
- Checked and not an issue: deleting an organization with clients, properties,
  quotes, and jobs cascades cleanly.
- `docs/database/tables/*.md` brought in line with the rebaselined schema.
- `src/types/database.ts` generated (`tsc` clean).
- Stale drift and "types pending" statements corrected in `CLAUDE.md` and
  `docs/process/feature-workflow.md`.

## Not done

- Concurrency can't be exercised on one connection; the locks are reviewed,
  not reproduced.
- Per-domain pgTAP suites beyond the regression, review-fix, and hardening
  files.
