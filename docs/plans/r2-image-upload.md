# Plan: R2 image upload Edge Function

- **Slug / branch**: `r2-image-upload` / `feat/r2-image-upload`
- **Tier**: full; new authenticated backend and database helpers.
- **Status**: approved
- **Confidence**: 95%; material behavior confirmed by user, membership and job RLS verified in migrations. Runtime verification remains implementation work.
- **Plan-mode file**: this file (no native plan-mode tool available).

## Original request

> I have created an R2 bucket for image storage. What I would like to do with it is to be able to upload images to it for company logos, completed job images, etc. For now, let's build out an upload edge function to be pushed to supabase. Let's make it generic so that it can read secrets from the database and takes the bucket folder as an argument.

## Goal

Prepare deployable code for a reusable image-upload Edge Function backed by one public Cloudflare R2 bucket. Include database helpers, tests, and deployment instructions. Do not apply migrations, deploy, or alter remote configuration in this feature: the user explicitly requested deployable code only.

## Decisions

| Question       | Confirmed answer                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Authentication | User JWT.                                                                                           |
| Logo path      | `company_logos/{org_id}/logo.{extension}`; replace with cache busting.                              |
| Job path       | `jobs/{job_id}/{generated-id}.{extension}`; multiple photos without overwriting.                    |
| Upload policy  | All active employees of the target organization, including workers, regardless of visit assignment. |
| Image limits   | One image/request; JPEG, PNG, WebP; at most 10 MiB.                                                 |
| Read access    | Public for now, including job photos.                                                               |
| Credentials    | User will manually add secrets to Supabase Vault; provide exact names.                              |
| Delivery       | Prepare deployable code, no live deployment.                                                        |

Agent defaults (minor; user may veto): endpoint `upload-image`; multipart fields `folder`, `file`, `organizationId`. Require explicit organization context and match it to the path/job. Only the two confirmed folder patterns initially; extend through a resolver registry rather than arbitrary unverified prefixes. Preserve original encoding, derive extension from validated MIME and signature, never from supplied filename. Return key and URL; persist neither attachment nor organization records.

## Open questions

None affecting implementation. Public base URL and credential values are deployment inputs, supplied manually later.

## Assumptions

| Assumption                                                                                                                             | User-confirmed?                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Employees means active organization_members linked to the JWT user; owner/admin/dispatcher/worker included, portal-only users excluded | Yes, faithful interpretation of all employees and repo membership model |
| Existing Supabase-hosted attachments remain separate; no UI or attachment persistence                                                  | Yes, backend-only scope from conversation                               |
| CORS may allow any browser origin because auth uses explicit bearer JWT, no cookies                                                    | No; implementation default                                              |
| Logos may retain an old unused extension key after a format change                                                                     | No; minor default, deletion out of scope                                |

## Design refs

No screens or UI changes; no mock/screenshots required.

## Layers touched

- Migration: new RPCs and Vault extension prerequisite.
- pgTAP tests; database access/accepted-definer documentation.
- Edge Function, Deno configuration/lockfile, unit and handler tests.
- Root TypeScript/ESLint exclusion for Deno-only runtime code if required; root tooling must still check shared application code.
- No app middleware, tRPC, routes, UI, stories, or Sentry SDK integration. Function errors use sanitized structured logs without file data, JWTs, or credentials.
- Security-gated paths: `supabase/migrations/**`, `docs/database/rls.md`; security review required after implementation.
- Generated application types: deferred until an authorized deployment applies migration, since repo requires generation from the remote and user forbids remote changes here. Edge code uses its own explicit RPC result validation; do not hand-edit generated types. Document `pnpm db:types` as deployment follow-up.

## Changes

### Database

Create a migration using `supabase migration new r2_image_upload` after approval. Ensure `supabase_vault` exists in `vault` using Supabase-supported extension setup. Add:

1. `public.authorize_image_upload(p_organization_id uuid, p_folder text) returns uuid`: security definer with empty search_path. Require auth.uid(), reject anonymous Auth users, and check active linked employee membership in exactly p_organization_id. Accept only canonical `company_logos/{uuid}` matching that org, or `jobs/{uuid}` whose job belongs to that org (lookup includes organization_id). Return that org UUID only. No general job data exposed. Revoke execution from PUBLIC, anon, service_role; grant authenticated only. This intentionally permits workers to upload to all organization jobs per user instruction without widening jobs RLS.
2. `public.get_r2_upload_config() returns jsonb`: security definer, empty search_path, service_role execution only; revoke PUBLIC, anon, authenticated. Read ONLY the fixed Vault names listed below, require every value present and nonempty, and return configuration. No caller-controlled secret names or database secret writes. Never log result. This service-only RPC is required because vault is not exposed through PostgREST.

Vault names: `r2_account_id`, `r2_access_key_id`, `r2_secret_access_key`, `r2_bucket_name`, `r2_public_base_url`. The latter is the HTTPS custom domain or development r2.dev base URL without a bucket suffix. Validate account ID, bucket, HTTPS base URL (no userinfo/query/fragment) before network use. S3 destination is derived exclusively from account ID and bucket, not supplied by callers. No secrets in migration/fixtures.

Update `docs/database/rls.md` accepted definer list and add `docs/database/decisions/0015-r2-image-uploads.md` and ADR index. Describe public reads, the worker authorization exception, and the Edge Function as an additional trusted service-role boundary alongside `src/server/trusted/`; update the corresponding service-role boundary wording in ADR 0009. Existing tables/policies unchanged.

### Edge Function

Files under `supabase/functions/upload-image/`: entrypoint, dependency-injected handler, target/image validation, pinned Deno dependency configuration and lockfile, tests. Add `supabase/config.toml` function configuration if absent, retaining user-facing JWT gateway verification, plus explicit JWT verification via Auth getUser and rejection of anonymous users. No service-key-only upload access. Pin exact versions of supabase-js and a small SigV4 client such as aws4fetch after checking current package documentation/version availability.

POST accepts multipart `organizationId`, `folder`, `file`, with exactly one of each and no extra file fields. OPTIONS supports browser preflight with Authorization, apikey, content-type, x-client-info; all responses include CORS headers. Reject other methods. Authenticate before consuming upload bytes; enforce a streamed total body cap of 10 MiB + 64 KiB (including absent/lying Content-Length) before multipart parsing, and file cap of 10 MiB. Reject empty files, unsupported MIME, mismatched JPEG/PNG/WebP signatures, malformed multipart, invalid org UUIDs, traversal/encoded/slashed/unrecognized folder forms. Signature checking is type validation, not full image decoding or sanitization.

Use user-scoped RPC authorization first. Only then retrieve fixed Vault config through a service-role client confined to the Edge Function trusted boundary. Upload a signed S3 PUT with correct Content-Type. Logos: stable `logo.jpg|png|webp`, overwrite, `Cache-Control: no-cache, max-age=0, must-revalidate`, return URL with a fresh random `?v=` value. Job photos: generated UUID filename, long immutable cache header. Public cache setup must respect origin headers and include query string in cache key; no API purge token needed. Concurrent logo uploads are last successful write wins; returned versions are cache busting tokens, not immutable snapshots.

Return success only after successful R2 PUT: `{ key, url, organizationId, contentType, size }`. Network timeout bounded (e.g. 20 seconds). Generic sanitized errors: 400 invalid input, 401 invalid/no user JWT, 403 forbidden target, 405 method, 413 oversized, 415 unsupported type, 502 upstream failure, 503 missing/invalid server configuration. Do not expose provider response bodies or existence details for forbidden jobs. No automatic retries that could duplicate job images.

### Documentation

`docs/uploads/README.md`: API contract, curl and supabase.functions.invoke examples, exact Vault setup list, public bucket/custom-domain setup, cache rules, function secrets required by Supabase runtime (URL, anon/publishable key for caller verification, service role for config RPC), local tests, migration/deployment ordering and CLI commands verified with --help. Explicitly state this PR does not deploy and generated DB types must follow migration application. Explain consumers must retain the returned logo URL including query token. Public job URLs can be shared directly with clients. Changing file format can leave an unused old logo object; no cleanup in this feature.

### Acceptance criteria

1. All four active employee roles can upload a logo or job image within explicitly selected organization; disabled/invited members, portal-only users, anonymous users and nonmembers cannot.
2. Multi-org callers must supply an org matching the requested logo/job; cross-org mismatch rejected before secrets/R2 access.
3. Validated type controls extension and Content-Type. Unique job keys, stable logo key and fresh cache busting URL verified.
4. Exactly one image and 10 MiB enforced, including streamed/chunked bodies and malformed multipart.
5. Authenticated/anon database roles cannot read R2 config; only service_role can retrieve those fixed entries.
6. No frontend integration, remote changes or deployment; delivery includes self-contained code, migration, tests, and deployment instructions.

## Commits

1. `docs: record approved R2 image upload plan` (main agent).
2. `feat: add R2 configuration and upload authorization helpers` (main agent; local migration only).
3. `feat: prepare authenticated R2 image upload function` (implementer in isolated worktree; tests, tooling separation, docs).
4. Any review corrections, then update plan status (single PR if Git metadata/network permissions allow).

## Unhappy paths

- Forbidden target: identical denial for nonexistent/wrong-org jobs, no secret retrieval or PUT.
- Invalid or expired JWT/anonymous sign-in: reject before upload work.
- Missing credentials: sanitized configuration error, no leaked values.
- Partial network failure after R2 stores bytes: report failure; an unreferenced object may remain. Cleanup/idempotency deferred.
- Concurrent logo updates: last write wins; no promise that previous URL shows prior content.
- Body length absent/false: actual streamed byte count enforced before parser allocation.

## Out of scope

Deployment, remote migrations/advisors/tests, credential provisioning, UI, image transforms, private/signed reads, attachment persistence, updating logo_path, deletion/cleanup, arbitrary unvalidated folder prefixes, rate limiting infrastructure.

## Dependencies not to add

No full AWS SDK, app upload library, direct Postgres connection, or UI library. Keep pinned Edge Function dependencies isolated from app dependencies.

## Verify command

```sh
pnpm exec tsc --noEmit && pnpm lint && pnpm check && pnpm exec vitest run && deno check --config supabase/functions/upload-image/deno.json supabase/functions/upload-image/index.ts && deno test --config supabase/functions/upload-image/deno.json --allow-env supabase/functions/upload-image/
```

## Verification

Add meaningful handler tests with injected auth/database/R2 mocks for role/tenant matrix, size enforcement, content signatures, overwrite/cache headers, duplicate fields, upstream timeout/errors, and no secret leakage. pgTAP covers helper grants, all roles, inactive/nonmember/portal denial, cross/multi-org checks, job and logo targets, config name allowlist and missing secrets. Only rollback-isolated dedicated test orgs and fake secrets. Run local Supabase tests if a local CLI/database runtime is available; do not substitute remote tests. If unavailable, report exact unrun checks and keep PR draft; no merge with unmet verification gates. Deno/Supabase binaries are not currently on PATH; check project devenv toolchain first and request installation permissions only if necessary. Running UI verification/stories/new component shots are N/A for backend-only work, though existing vitest suite still runs. Remote advisors and generated types are explicitly deferred by deployable-only scope, not claimed as completed.

## Audit log

### Round 1 (`plan-auditor`): pass, confidence high

Fresh read-only auditor checked the request/decisions, workflow/template, database tenancy and job rules, grants and fixed secret allowlist, unhappy paths, Deno tooling separation, and deployable-only verification limits. No blocking findings, unresolved doubts, or pre-existing defects reported.

- Non-blocking adopted: use next free ADR number 0015 (0014 is occupied); explicitly document the Edge Function trusted service-role boundary in RLS documentation and ADR 0009.
- These clarify already-planned documentation and do not change runtime behavior or scope.
- Git status checked after audit: only this uncommitted plan and the two pre-existing dashboard screenshot modifications.
- Runtime uses an inherited-model fresh agent because the repo's named opus model is unavailable in this tool interface.
- User approved implementation on 2026-11-03. Implementation/reviewer/security review pending.

## Scope-change log

None.
