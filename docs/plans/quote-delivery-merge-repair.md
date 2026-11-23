# Quote delivery merge repair

- Status: implemented (user approved repair; merge remains pending)
- Branch: existing feat/quote-delivery-conversation; pending main merge.
- Confidence: 95%; both parents and broken callers inspected.

## Request

"I am merging main into this feature branch to clear up conflicts. Look through and make sure that the conflicts are clear and this feature branch is as it should be."

## Approved plan

Repair merge resolutions in place and leave the merge pending for user review.
Preserve feature quote delivery (validation before mutation, provider idempotency,
recoverable delivery recording, token privacy) and staff/customer conversation.
Preserve main's request-contact recipient fallback before client creation, main's
org-scoped APIs, maps, and nullable crew RPC type adapter.
Reconcile duplicate imports, handlers, mocks, hooks, JSX attributes and editor
controls. Keep a single customer quote route with the feature's conversation and
privacy headers; regenerate the route tree. Reconcile tests to the resulting
contracts without weakening security assertions. Do not change database schema,
remote state, generated database types, unrelated staged changes, or dependencies.

## Execution

Use the existing checkout because the merge/index is already in progress. The
implementer edits only the repair paths; no commits, pushes, PR creation or merge.
This is an in-place merge repair, not a new product feature. No new UI design.
Any newly discovered incompatible behavior is escalated before choosing it.

## Verification

Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm check`,
`pnpm exec vitest run`, `pnpm build`, route regeneration and staged/worktree
`git diff --check`; verify zero unmerged paths and conflict markers.
Fresh reviewer then security reviews cover the repair against both parents.
Record exact results and external limitations here. Live customer email sending
and remote database writes are outside this repair's scope.

## Audit

Pending fresh adversarial plan audit before code edits. The initial read-only
merge review identified route conflict markers/duplicate route, duplicate backend
handlers/imports, broken editor/hook/callers, and duplicate tests.

Plan audit: pass, high confidence, no blocking or unresolved findings.
Adopted: separate recipient resolver from email validator; regress send/retry for
request contacts and invalid-email rejection before RPC; run `pnpm generate-routes`.
User approval from chat remains applicable; these clarify the approved scope.

## Approved scope extension: SQL merge repair

User approved "Approve local migration and tests" after discovery that
20261029170000_quote_client_on_approval replaces the feature's earlier send_quote
and removes optional-selection normalization. This overrides the original plan's
no-schema-file-edits constraint only for an additive local migration and tests.
No remote migration application or database writes are authorized.

Add a new migration after both parents using the CLI: retain main's send_quote
recipient fallback, membership guard, quote/request locking, validation,
supersession, token creation and expiry; restore the feature's atomic clearing
of optional is_selected before draft becomes sent. Preserve function signature,
empty search_path and authenticated-only execute grants. Do not edit applied
migrations or generated types (signature unchanged). Extend hermetic pgTAP
coverage for a request-only draft with a preselected optional line, sent total,
customer view and acceptance total stability, and existing tenant/grant checks.
Update quote database reference. Run database tests only if an isolated local
runtime is available; otherwise explicitly report unexecuted SQL verification.

Also preserve /q route no-referrer header against main's new global default.
This is part of the already-approved customer privacy behavior, with regression
coverage for route headers and global fallback.

Scope-extension plan audit: pass, high confidence; no blocking or unresolved
findings. Adopt rollback regression on failed token insertion. The audit noted
legacy quote_request_link_test expects eager client creation, predating main's
client-on-approval behavior; distinguish that if encountered in broad SQL tests.

## Verification results

- `pnpm generate-routes`: passed; one `/q/$token` route, no conflict markers.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm check`, `pnpm build`: passed.
- Full `pnpm exec vitest run`: 70 files, 623 tests passed, including Storybook.
  Browser server required sandbox escalation for localhost binding.
- New request-recipient regressions cover send/retry with no client, invalid email
  rejection before mutation, archived linked clients, and provider contracts.
- New middleware regression preserves route no-referrer and supplies the normal
  default only when absent.
- Supabase CLI created the additive local migration. No hosted database changes.
- Fresh full local migration replay failed at main's
  `20261102180000_service_areas.sql`: `relation "service_regions" already exists`
  after `20261030184337_create_service_regions.sql`. Both are unchanged from
  MERGE_HEAD, so full database bootstrap is a pre-existing main limitation.
- For isolated quote validation, `/tmp/crm-quote-merge-validation` copied the
  repository's migration history through 20261029 plus the repair (excluding
  unrelated region/geocoding history); a separate local Supabase database
  applied that history successfully. Commands:
  `docker exec -i supabase_db_crm-quote-merge-validation psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/quote_send_merge_test.sql`
  and the same command for `quote_conversation_test.sql`: 15/15 and 67/67
  pgTAP assertions pass; all fixture writes roll back. A transaction-local
  negative control replacing send_quote with main's original function fails
  three assertions (sent total, optional selection, customer total), proving
  the regression detects the merge defect. Nothing was applied remotely.
- Fresh reviewer: pass, medium confidence; no blocking/unresolved findings.
  Noted resolutions must be staged before completing the pending merge.

No new screens or product behavior were designed; existing quote UI and shots
remain the design record. Live email transmission and hosted migrations were not
run, within the approved repair scope.

- Fresh security review: pass, medium confidence; no findings or unverifiable
  boundaries. No remote writes or deployments.
- Local production smoke check (`PORT=3017 pnpm start`, then
  `curl http://localhost:3017/q/invalid`): HTTP 200 with `cache-control: no-store`,
  `referrer-policy: no-referrer`, `x-robots-tag: noindex, nofollow`, same-origin
  framing and nosniff. Invalid token cannot reach customer data.
- Repaired paths staged individually; pending merge retained. No commit, push,
  PR creation, deployment, or merge completion performed.
