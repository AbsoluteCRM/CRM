# Plan: Database follow-ups after the rebaseline

- **Slug / branch**: `db-followups` / `db/followups`
- **Tier**: light (hardening migration with tests, doc corrections, generated types)
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
  and visits. `supabase/tests/followup_hardening_test.sql` (8 assertions).
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
