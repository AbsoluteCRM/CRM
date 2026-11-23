# R2 image uploads

Settings uses this endpoint for company logos. Deployment prerequisites and
verification below must be completed independently for each environment.

`upload-image` accepts a signed-in employee's bearer JWT and multipart POST with
exactly these fields:

| Field            | Value                                                      |
| ---------------- | ---------------------------------------------------------- |
| `organizationId` | Active organization UUID explicitly selected by the caller |
| `folder`         | `company_logos/{organizationId}` or `jobs/{jobId}`         |
| `file`           | One nonempty JPEG, PNG, or WebP, at most 10 MiB            |

Company logos require an active owner/admin membership in the selected
organization. All active employee roles, including workers, can upload to any job in their
selected organization. Portal-only, invited, disabled, anonymous and nonmember
users cannot. Authorization verifies membership and the target organization in
the database using the caller's JWT before credentials are retrieved. A worker's
upload permission does not grant access to other job data.

The body is capped at 10 MiB + 64 KiB while streaming, before multipart parsing.
The declared MIME and JPEG/PNG/WebP signature must agree; the supplied filename
is ignored. Signature validation is not full image decoding or sanitization.

```sh
curl "$SUPABASE_URL/functions/v1/upload-image" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $USER_ACCESS_TOKEN" \
  -F "organizationId=$ORGANIZATION_ID" \
  -F "folder=company_logos/$ORGANIZATION_ID" \
  -F 'file=@logo.png;type=image/png'
```

```ts
const body = new FormData()
body.append('organizationId', organizationId)
body.append('folder', `jobs/${jobId}`)
body.append('file', file)
const { data, error } = await supabase.functions.invoke('upload-image', {
  body,
})
```

`invoke` uses the signed-in user's session. Do not manually set multipart
Content-Type: the client must include its generated boundary.

Success returns `{ key, url, organizationId, contentType, size }` after R2 confirms
the PUT. Nothing is persisted to job attachments or organization logo fields.
Errors return `{ error }` with 400 invalid fields/target/multipart/empty image,
401 missing or invalid JWT/anonymous user, 403 forbidden target, 405 wrong method,
413 oversized, 415 unsupported type/signature, 502 upstream failure, or 503
missing/invalid configuration. Provider responses and credentials are omitted.
Every handler response supports CORS; OPTIONS permits Authorization, apikey,
content-type and x-client-info. The platform JWT gateway may reject a request
before the handler runs.

## Configure storage and credentials

Create one R2 bucket and a bucket-scoped Object Read & Write API token. Enable
public reads through a connected custom domain (recommended) or the bucket's
public development `https://pub-<id>.r2.dev` URL. The S3 API endpoint is separate
and is derived from the account ID; callers cannot choose it.

Add these **exact lowercase names** to Supabase **Edge Function secrets**. Do
not put real values in migrations, source files, fixtures or shell history:

| Edge secret name       | Value                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| `r2_account_id`        | Cloudflare's 32-character lowercase hex account ID                             |
| `r2_access_key_id`     | Bucket-scoped R2 access key ID                                                 |
| `r2_secret_access_key` | Corresponding secret access key                                                |
| `r2_bucket_name`       | Bucket name, lowercase letters/digits/hyphens, 3–63 characters                 |
| `r2_public_base_url`   | Public HTTPS base URL, without a bucket suffix, credentials, query or fragment |

After verifying the caller and target permissions, the Edge Function reads only
these fixed names with `Deno.env.get` and validates the configuration. Values
never reach clients or logs. Vault entries are not required. The legacy
service-role-only `get_r2_upload_config()` RPC remains installed but is unused
by uploads.

The function also uses Supabase-provided `SUPABASE_URL` and `SUPABASE_ANON_KEY`
for caller verification and caller-scoped authorization; it no longer needs a
service-role key. Local serving needs equivalent local environment values.
Clients use their project publishable key in `apikey` and their user JWT in
`Authorization`, never an account access token or service-role key.

Logos overwrite `company_logos/{org}/logo.jpg|png|webp` with
`Cache-Control: no-cache, max-age=0, must-revalidate`. Keep the entire returned
URL including its fresh `?v=` token. Configure Cloudflare cache rules to respect
origin Cache-Control and include the query string in the cache key; do not add a
rule that forces logo caching. No purge API token is needed. Concurrent logo
uploads are last successful write wins; version tokens are cache busting values,
not immutable snapshots. Changing formats can leave an unused old logo object;
cleanup is outside this feature.

Job images use `jobs/{job}/{generated-uuid}.{extension}` with
`Cache-Control: public, max-age=31536000, immutable`. Public job URLs can be
shared directly with clients. They are public to anyone with the URL. PUTs have
a 20-second timeout and no automatic retries. A timeout after R2 accepted bytes
can leave an unreferenced object.

## Verification and deployment ordering

Pinned dependencies and their integrity lock live in the function directory,
separate from application dependencies. With Deno installed:

```sh
deno check --config supabase/functions/upload-image/deno.json supabase/functions/upload-image/index.ts
deno test --config supabase/functions/upload-image/deno.json --allow-env supabase/functions/upload-image/
```

The implementation environment used `pnpm dlx deno` (Deno 2.9.6) in place of
bare `deno`. Tests inject Auth, RPC and storage calls and use no real credentials
or network. Root application TypeScript/ESLint exclude this separate Deno
runtime; Deno check/test perform its type checking. Prettier covers both.
Run the migration's pgTAP tests using a local Supabase database before deployment;
they replace fixed Vault fixture entries and use rollback-isolated test organizations
and fake values. Run them only against a disposable local database, never against
a production database, real secrets, or real tenants. A local Docker/Supabase runtime is required.

For a later, separately authorized deployment:

1. Review and apply the committed migration through the repository's database
   workflow. Run database tests/advisors and `pnpm db:types` after application;
   regenerate types using the installed CLI's supported project-selection flags.
2. Provision Edge Function secrets and public bucket/domain/cache settings above.
3. Verify the project's Supabase runtime environment values and deploy the
   function with JWT gateway verification retained (`verify_jwt = true`).
4. Smoke-test allowed employee uploads and cross-organization denials with test
   users, then retain returned URLs in the consuming feature.

The following deployment syntax was checked with **Supabase CLI 3.0.0** help:

```sh
pnpm dlx supabase@3.0.0 functions deploy upload-image --remote=skygtamcakhoirlrqlnq --use-api
```

CLI v2 uses different project-selection flags; consult that installed version's
`functions deploy --help` instead of copying v3 syntax. Do not pass
`--no-verify-jwt`. Deployment and live verification results are recorded in
[the company-logo plan](../plans/company-logo-upload.md).

## Company settings

Company profile uploads validate nonempty JPEG/PNG/WebP files up to 10 MiB before
calling the authenticated function. Settings saves the complete returned public
URL, including `?v=`, through owner/admin-only `settings.setLogo`. Existing private
Storage logos still display through signed URLs and can be replaced or removed.
Remove clears the reference; public R2 objects remain accessible. A fixed-key
upload can replace bytes even if the subsequent reference save fails. Concurrent
clients remain last successful object write wins, not immutable revisions.

Deploy the logo owner/admin authorization migration before enabling this UI.
Deploy/configure the existing function and R2 prerequisites using the ordering
above; this frontend does not provision or deploy them. Verify allowed logo
uploads, worker/dispatcher logo denial, unchanged employee job uploads, and
cross-organization denial using dedicated test organizations. The UI ignores
stale completion after a workspace switch and invalidates the captured workspace.
