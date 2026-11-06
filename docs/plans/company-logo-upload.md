# Plan: Company logo uploads through R2

- **Slug / branch**: `company-logo-upload` / `feat/company-logo-upload`
- **Tier**: full; database authorization, backend persistence and UI.
- **Status**: approved
- **Confidence**: 95%; behavior is grounded in the existing settings flow and user answers. Hosted migration history and access are execution checks, not assumed verified.
- **Plan-mode file**: this uncommitted file; no native plan-mode tool is available in this session. User approves this written plan in chat before implementation.

## Original request

> I've merged it to main and switched to main. Let's test it by building out functionality for uploading a company logo in the settings tab.

## Goal

Use the deployed `upload-image` function from Settings → Company profile. Persist the returned public URL, including its cache version, and show it wherever the company logo already appears. Preserve legacy Supabase Storage logos. Deliver one PR including a database authorization migration, meaningful tests and the design record.

## Decisions

| #   | Question                              | Answer                                                                                    |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Q1  | Restrict logo uploads at the backend? | User: restrict logos to owners/admins.                                                    |
| Q2  | Maximum logo size?                    | User: allow 10 MiB.                                                                       |
| Q3  | Existing backend deployment?          | User reports the R2 migration and upload function deployed; verify during implementation. |

Agent defaults (minor; user may veto):

- Reuse the existing Logo & brand card, Upload logo, preview and Remove controls. Save immediately as today; retain all other company-profile fields.
- Remove clears the company's logo reference. It does not delete public R2 objects or revoke previously shared URLs. No new R2 deletion endpoint.
- Keep `organizations.logo_path` as the persisted reference: legacy relative storage path or complete HTTPS logo URL. No new column or bulk data migration.
- No mock required for this small extension to the existing layout; a user sketch remains welcome before implementation.

## Open questions

None affecting product behavior. User approved the original plan and the expanded database reconciliation scope below.

## Assumptions

| Assumption                                                | User-confirmed?                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| R2 bucket and five Vault entries configured               | Yes, earlier in this conversation.                                     |
| Existing logo card and immediate save are the intended UI | Existing implementation; agent default, not separately user-confirmed. |
| Old logos must keep displaying until replaced/removed     | Compatibility default, verified existing consumers.                    |

## Design refs

- Mock: none; extend existing screen.
- `docs/settings/ui.md`: Company profile, implemented desktop and phone screenshots.
- Existing logo consumers: `src/components/layout/OrgAvatar.tsx` and public request page via `src/server/trusted/portal.ts`.

## Layers touched

- Migration: replace `authorize_image_upload` with owner/admin checks for logo targets only.
- pgTAP: update the upload permission matrix; preserve job-photo employee permissions.
- Database docs: tenancy logo reference, RLS and ADR 0015.
- Types: regenerate from hosted database after authorized migration reconciliation/application; never edit generated types manually.
- tRPC: settings logo validation, persistence and read resolution.
- Routes/UI: settings logo card and upload hook.
- Stories/tests: logo component interactions, upload orchestration, settings/portal consumers and role/tenant coverage.
- Sentry: retain existing settings spans; no new server-function boundary.
- Design record and deployment documentation.

Security-gated paths: `supabase/migrations/**`, `src/integrations/trpc/settings.ts`, `src/server/trusted/portal.ts`, `src/routes/_authed/settings.tsx`, `docs/database/rls.md`. Reviewer and security passes required.

## Changes

### Schema

- Create a fresh migration using installed Supabase CLI `migration new` (discover flags with help).
- `create or replace function public.authorize_image_upload(uuid, text)`: retain anonymous/active membership/explicit organization/job checks, empty search path and existing least-privilege grants. Inside matching logo branch require `private.has_org_role(p_organization_id, '{owner,admin}')`; dispatcher/worker logos receive SQLSTATE 42501. Job branch unchanged.
- Update function comment and ADR to match the user-confirmed role restriction.
- Update `supabase/tests/r2_image_upload_test.sql`: owner/admin logo success, dispatcher/worker logo denial, all active employee job uploads still succeed; preserve inactive/portal/anonymous/nonmember, cross-tenant and multi-org cases.
- Before remote changes compare hosted migration names with main plus this branch and other open PRs. If the manually applied R2 migration lacks a history entry, verify deployed definitions/grants before reconciling history. Stop on unexplained drift; do not push unrelated pending migrations or use production pgTAP fixtures.
- Main agent applies only this authorized migration, records its assigned version, runs hosted advisors and regenerates types following the repository workflow. If MCP remains unavailable, use authenticated CLI equivalents discovered from help, preserving migration history. If access cannot be established, report the exact remaining deployment step without claiming live verification.

### Middleware

Reuse `organizationProcedure`, `requireOrgPermission('manageSettings')`, active membership resolution and caller-scoped Supabase. No new privileged application client or auth mechanism.

### Procedures and logo references

| Procedure          | Input                                                                    | Output                              | Roles                     |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------- | ------------------------- |
| `settings.get`     | existing organizationId                                                  | existing profile, resolved logo_url | existing active employees |
| `settings.setLogo` | organizationId and path (legacy path, validated HTTPS logo URL, or null) | existing `{ok:true}`                | owner/admin               |

- Shared logo-reference helper, e.g. `src/integrations/settings/logo.ts`, differentiates relative legacy paths from complete public URLs. Validate new URLs with the URL parser: HTTPS, no credentials or fragment, bounded length, pathname ending in `/company_logos/{activeOrg}/logo.jpg|png|webp` on segment boundaries; reject traversal/encoded separators and other-org/job targets. Preserve the entire version query token. Allow a configured base path before the fixed logo key, as the existing endpoint supports one.
- These owner/admin-supplied references are image display URLs, not server-fetched URLs or proof of upload. No claim of verifying remote object existence or hostname ownership. No new domain configuration or secret exposure.
- Existing legacy path validation remains organization-scoped. When replacing/removing, only relative legacy references may reach Supabase Storage removal; never send an R2 URL to that API. Do not delete the previous file before persistence succeeds.
- `settings.get` and `getPortal` return public references directly and keep signed-URL generation for legacy paths. Share resolution logic or classification; no double signing public URLs.
- Update docs describing the dual reference format. No contract change to returned `logo_url` or existing avatars.

### Routes and UI

| Route       | Screen                         | States                                                                                         |
| ----------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `/settings` | Company profile → Logo & brand | initial fallback, existing logo, uploading/saving, removing, validation/service error, success |

- `useSettingsMutations().uploadLogo` builds FormData (`organizationId`, `folder=company_logos/{organizationId}`, `file`) and calls authenticated `supabase.functions.invoke('upload-image', {body})`. Never set multipart Content-Type manually.
- Validate empty/type/size locally, JPEG/PNG/WebP up to exactly 10*1024*1024 bytes; server signature validation remains authoritative.
- Validate response shape, organization, expected logo key and HTTPS URL before `settings.setLogo`; retain returned `?v=`. Surface sanitized HTTP function errors and network errors without credentials/provider details.
- Capture organization at operation start. If workspace changes, no follow-up save to another org and no stale completion toast. Invalidate only the captured org's settings; do not update new workspace state. An already started upload can still complete for the original org.
- One logo operation at a time per mounted control. Busy state includes upload and reference persistence; Upload and Remove disabled throughout. Reset input to permit choosing the same file again. Removal supports legacy and public references.
- Extract a focused logo card component for Storybook interaction tests if needed, preserving existing theme controls and settings layout. Status/errors accessible, image fallback on broken image, visible 10 MiB type/size hint.
- Existing company avatar follows invalidated `settings.get`; portal reflects persisted logo on its next load. No unrelated redesign.

### Acceptance criteria

1. Owner/admin selects a valid logo up to 10 MiB and sees it after reload, in Settings, the app avatar and public request page.
2. The call uses the deployed endpoint and current user JWT; no browser R2 credentials or direct org-files upload for new logos.
3. Dispatcher/worker cannot overwrite a logo even by calling the deployed endpoint directly; their job upload permission remains unchanged.
4. Legacy logo display and removal work; null references use existing initial fallback.
5. The full returned public URL including version survives saving and reading.
6. Invalid files fail clearly; upload/save failures and organization switches do not report false success or write another workspace's reference.
7. Local tests, live dedicated-test-org smoke checks, reviews and design screenshots are recorded honestly.

## Commits

1. `Record company logo upload plan` (main agent): approved plan, draft PR.
2. `Restrict company logo uploads to organization administrators` (main agent): migration, pgTAP, database docs and generated types after remote checks.
3. `Connect company settings logos to R2 uploads` (implementer): shared logo helpers, settings/portal procedures, client orchestration, UI, tests and stories.
4. `Document and verify company logo settings` (implementer/main agent sequentially): screenshots, UI/deployment docs and recorded review/verification.

Implementer works in an isolated worktree per repository workflow; only main agent changes remote database. One writer at a time on the branch.

## Unhappy paths

- No session or inactive/foreign membership: existing auth and RPC reject; no config/storage access before authorization.
- Empty, oversized or unsupported images: clear validation error; no save.
- Failed R2 PUT: preserve reference, permit retry. Failed reference save: report failure; no delete of old legacy logo. Because R2 logos overwrite fixed keys, the previous URL may already display new bytes after a successful upload even when persistence fails; this is an existing endpoint limitation, not transactional rollback.
- Concurrent uploads in different clients: existing last successful object write wins; version tokens invalidate caches, not immutable revisions.
- Remove clears reference only; R2 object remains public. A same-format later upload may replace its contents.
- Org switch while uploading: operation bound to original org, stale save/completion suppressed before persistence begins; already issued saves remain scoped to original org.
- Production fixtures: never run Vault-mutating pgTAP against hosted production. Live uploads only use dedicated test org and test assets, never real tenant logos.

## Out of scope

Job attachment UI, cropping/resizing, SVG, R2 deletion/cleanup, restoring overwritten image bytes, unrelated settings changes. The explicitly authorized migration-history reconciliation below is included. No frontend hosting deployment without existing authorization.

## Dependencies not to add

No upload SDK, image editor, storage provider client or new UI library. Reuse Supabase client, Zod, React Query and existing components.

## Verify command

```sh
pnpm exec tsc --noEmit && pnpm lint && pnpm check && pnpm exec vitest run && pnpm dlx deno@2.9.6 check --config supabase/functions/upload-image/deno.json supabase/functions/upload-image/index.ts && pnpm dlx deno@2.9.6 test --config supabase/functions/upload-image/deno.json --allow-env supabase/functions/upload-image/
```

## Verification

- Workflow Definition of done applies: type/lint/format, all unit/story interactions, reviewer/security, current main integrated and implemented plan before merge.
- Meaningful settings tests for permissions, no writes on rejection, full public URL retention, legacy signing/removal, same/cross/multi-org, portal/nonmember denial. Portal resolution test for both formats.
- Upload orchestration tests for multipart fields, response validation, 10 MiB boundary, pending state, save failure and organization switches.
- Story play tests for select/replace/remove, validation, error/retry and disabled busy actions.
- Run updated SQL tests against disposable local Supabase. Diagnose current main's replay state rather than assuming historical blockers remain. If fixture workaround is necessary report it separately; never claim clean replay.
- Run `pnpm dev`; use seeded E2E credentials without printing secrets, create/use a dedicated test org and verify allowed upload, returned public bytes, reload/persistence/removal, role and cross-org denial. Never change absolute-demo or real tenants. Capture desktop/phone settings screenshots at the repo's specified sizes.
- Hosted access/advisors/migration reconciliation/type generation or browser limitations are explicit incomplete gates, not silent passes. Do not merge with unmet workflow conditions.

## Audit log

### Round 1 (`plan-auditor`): pass, confidence high

- No blocking findings or unresolved questions. Fresh read-only auditor checked the workflow/template, request and user decisions, existing settings and portal consumers, R2 handler, database authorization and test fixtures, organization-switch handling, verification and delivery gates.
- Non-blocking notes adopted as implementation detail: create the new `docs/settings/ui.md` with the required screen table/fields; explicitly test encoded traversal/separators, credentials/fragments, foreign-org keys, misleading prefixes and full query preservation; replace the existing positive multi-org worker-logo SQL assertion with denial and retain a positive owner/admin multi-org case.
- Pre-existing fixed-key overwrite/persistence limitation remains explicitly documented; broad employee logo authorization is addressed by this plan.
- Main agent checked working tree after audit: only the uncommitted plan file exists; no implementation edits.

## Scope-change log

2026-11-06: User approved this audited plan in chat ("Approved"). Implementation and the described database authorization change are authorized. Later, after concrete production drift was reported, the user approved "Reconcile history in this feature" and "Yes, deploy main’s pending migrations" after the client-on-approval and optional quote total behavior changes were explained. The expanded scope was independently audited before remote writes.

## Authorized migration reconciliation (supersedes original narrow history scope)

User settled the quote scope: "Yes, deploy main’s pending migrations" after the concrete client-on-approval/optional totals changes were explained. No business-data repair is proposed.

New evidence:

- Complete disposable replay at /tmp/crm-company-logo-replay succeeded, with all original files retained, canonical service_areas renamed to actual version and recovered rename/convert scripts included. No omission fixture.
- All 12 local pgTAP files / 394 assertions (before the two additional contact/approval assertions) pass after correcting stale quote_request_link_test assertion 4 to assert quote.client_id IS NULL at draft creation, matching the accepted quote_client_on_approval migration. The remaining suite exercises subsequent send/approval. Production pgTAP never run.
- Production and replay catalog JSON available: /tmp/crm-logo-production-catalog.json and /tmp/crm-logo-local-catalog.json (raw local JSON, production CLI wrapper rows[0].catalog). All five time-off function bodies/config/volatility/definer/ACLs match after CRLF and whitespace normalization. Enum labels, indexes, policies and base constraints match. Moddatetime trigger qualification differs only due search_path. Raw table ACLs/RLS and the 3 schedule column ACLs match exactly. information_schema grant filtering was corrected using pg_class.relacl and pg_attribute.attacl.
- Only extra member-schema differences are four columns, their three CHECK constraints, and authenticated UPDATE(certifications). Exact inspected definitions and preserving migration source in /tmp/crm-company-logo-replay/supabase/migrations/20261106203101_reconcile_hosted_member_metrics.sql. It adds IF NOT EXISTS columns (certifications text[] NOT NULL DEFAULT '{}', jobs_completed int NOT NULL DEFAULT 0, hours_worked numeric(8,1) NOT NULL DEFAULT 0, rating numeric(2,1)), adds absent named constraints jobs_completed>=0, hours_worked>=0, rating 1..5, and grants existing UPDATE(certifications). Production definitions already match; this migration preserves data and adds no new prod behavior.
- Historical NULL-source marker /tmp/crm-company-logo-replay/supabase/migrations/20261030120000_time_off_day_off_and_clear.sql states original SQL unavailable, no claim of recovered source; current observed effects are represented by team_availability and explicit member-fields recovery. No day_off enum or clear_time_off function exists.

Repository changes after application implementer completes (one writer):

1. Copy recovered rename/convert scripts using exact remote versions; rename canonical service_areas to actual 20261103030208, keep its original commented source (SQL-equivalent proof already run).
2. Copy the documented historical marker and the new CLI-created member-metrics migration. Keep team_availability original source/version. Fix the stale draft-time-client SQL test to assert intended NULL client_id; add assertion request contact_email remains unchanged, and verify approval eventually links the client with that email (existing tests inspected and extend if not present). Record added fields/schema/history explanation in database README, tenancy and plan.
3. Verify source-controlled chain with full replay and populated prototype transition test (both actual rename and conversion SQL applied with seeded prototype rows; verified id/org/crew/name/boundary/created_at retained). Run full database suite and catalog compare with member-metrics now included. No silent exclusion of historical marker: it is provenance-preserving history only.
4. Re-read hosted migration inventory before writing; expected remote has 32 versions and only these four already-applied local histories missing: 20261029190000 team_availability; 20261030184337 create_service_regions; 20261030192000 create_service_region_function; 20261103162017 r2_image_upload. Verify no concurrent changes and abort if difference.
5. CLI help for migration repair was inspected: use `pnpm exec dotenv -e .env.local -- pnpm dlx supabase@3.0.0 migration repair --remote=skygtamcakhoirlrqlnq --status applied 20261029190000 20261030184337 20261030192000 20261103162017 --yes`. This ONLY adds verified history, no DDL rerun. No revert/removal of real historical event.
6. CLI help for db push inspected. Run `... db push --remote=skygtamcakhoirlrqlnq --include-all --skip-vault --dry-run`. Expected ONLY four actual pending migrations in order: 20261029170000_quote_client_on_approval, 20261106150625_reconcile_quote_send_optional_items, 20261106201525_restrict_company_logo_uploads, 20261106203101_reconcile_hosted_member_metrics. Abort for any other pending entry. Then same command without --dry-run and with --yes. Never --include-seed/--include-roles, never production reset/tests.
7. Re-read inventory: exact local versions and names must match all 40 hosted entries. Verify owner/admin gate and existing grants, quote helper and send body, member schema/ACL match. Run hosted security advisors then regenerate types (source of truth), preserving client override file. No invented assigned versions: CLI applies the exact CLI-created local versions and records them; inspect returned history to verify.
8. Finish original logo app live tests, screenshots and full reviewer/security gates. No merge on missing checks.

Partial failure: migration repair can be safely re-read and only missing versions repaired; never mark actual pending quote migrations applied. db push tracks successful files; after any error re-read history and catalog, inspect the failure, and rerun only unchanged remaining expected migrations once safe. No rollback by dropping production tables or rewriting previously applied source.

Authorization: original feature approved, history reconciliation and actual pending main quote deployments explicitly approved by user; obtain fresh audit pass before these expanded database writes. No additional product decisions are assumed. If any remaining proof fails, name the doubt and stop remote writes.

### Reconciliation audit round 2: pass, confidence high

Fresh read-only auditor verified all nine scoped availability/member catalog categories, inspected recovered SQL and preserving member-field migration, checked the 40-file inventory and exact repair/deployment allowlists, and accepted full replay, populated conversion and 394 passing assertions as verified evidence. No blockers or unresolved questions. Non-blocking notes adopted: correct the function count to five and consolidate this scope into the committed plan. These scoped catalog checks do not claim whole-database schema equality.
