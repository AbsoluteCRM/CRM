# Plan: Schema rebaseline from the 2026-10-01 audit

- **Slug / branch**: `db-rebaseline` / `db/rebaseline`
- **Tier**: full (security-gated: migrations and `rls.md`), built before the
  plan-audit step existed on `main`; the reviewer and security gates apply to
  the PR
- **Status**: implemented (reviewer and security found issues; fixed in `review_fixes`, re-review pending)
- **Confidence**: 95%, because the two material choices were the user's
  answers and every finding was reproduced against the live database
- **Plan-mode file**: `~/.claude/plans/atomic-booping-planet.md`

## Original request

> Perform a comprehensive audit of our database schema. Question everything
> and ensure it aligns with postgresql best practices.
>
> Merge the things and capture the policies. Then enter plan mode and begin
> drafting up fixes to improve the schema. Anything is possible and there is
> no real data in the DB yet so we can alter things to our hearts content.

## Goal

Replace the 14 incremental migrations with 11 clean domain files that fix the
audit's security, concurrency, operations, and performance findings, and
reset and rebuild the remote project from them (ADR 0010). Workers move from
table policies to `worker_*` RPCs (ADR 0011).

## Decisions

| #   | Question                                   | Answer                |
| --- | ------------------------------------------ | --------------------- |
| Q1  | Rebaseline or forward-only fix migrations? | Clean rebaseline      |
| Q2  | How do workers read and change data?       | RPCs, like the portal |

## What shipped

- Migrations `20261002014117` … `20261007215337` (11 files), applied to the
  remote in order after a reset the user approved.
- `supabase/tests/audit_regressions_test.sql`: 36 hermetic assertions, run
  against the live database (36/36 ok). The earlier per-domain suites targeted
  the dropped schema and were removed; per-domain coverage is a follow-up.
- ADRs 0010 and 0011, `rls.md`, README conventions and migration table.

## Not done (follow-ups)

- `docs/database/tables/*.md` still describe the pre-rebaseline columns.
- Per-domain pgTAP suites (concurrency cases for payments and owner changes
  were reasoned about, not reproduced).
- `pnpm db:types` and the least-privilege app role.
