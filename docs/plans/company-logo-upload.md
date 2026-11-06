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

None affecting product behavior. Plan approval is pending.

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

Job attachment UI, cropping/resizing, SVG, R2 deletion/cleanup, restoring overwritten image bytes, unrelated settings changes or migration-history repairs beyond verified R2 deployment reconciliation. No frontend hosting deployment without existing authorization.

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

2026-11-06: User approved this audited plan in chat ("Approved"). Implementation and the described database authorization change are authorized.
