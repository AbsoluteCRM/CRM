# 0015. Public R2 image uploads through an authenticated Edge Function

- **Status**: Accepted (2026-11-03)
- **Date**: 2026-11-03
- **Extends**: [0009](0009-supabase-js-data-access.md), trusted service-role boundaries.

## Context

Company logos and job photos need image storage in an existing R2 bucket.
This first slice prepares deployable backend code; application integration,
attachment rows and deployment are separate work.

## Decision

`upload-image` accepts a user JWT, explicit organization ID, a validated folder,
and one JPEG, PNG or WebP image up to 10 MiB. All active employees can upload,
including workers, to job folders. Company logo folders require an active owner/admin membership (2026-11-06 settings integration decision). Portal-only users, anonymous Auth users, invited/disabled
members and nonmembers cannot. The public bucket allows anyone with an image
URL to read it, including clients receiving job photos.

`authorize_image_upload(uuid, text)` is an authenticated-only definer RPC. It
checks `auth.uid()`, active membership in the explicitly selected organization,
and either the matching `company_logos/{organization_id}` prefix or a
`jobs/{job_id}` lookup scoped to that organization. This worker permission
does not grant table access to jobs and is not restricted to assigned visits.

`get_r2_upload_config()` is a service-role-only definer RPC with no parameters.
It reads five fixed Vault names: `r2_account_id`, `r2_access_key_id`,
`r2_secret_access_key`, `r2_bucket_name`, `r2_public_base_url`. Only trusted
code receives this result; clients cannot choose secret names or read values.
Both helpers use an empty search path and explicit execution grants.

The Edge Function is a trusted service-role boundary alongside
`src/server/trusted/`. The caller's JWT is used for upload authorization;
the service-role client is used only to retrieve configuration after that
authorization succeeds. No service-role job lookup or membership decision
occurs in the Edge Function. This extends ADR 0009 for the standalone Deno
runtime without moving service-role access into application request code.

## Consequences

- Logos overwrite `company_logos/{organization_id}/logo.{extension}`. Return
  a fresh URL version parameter and revalidation cache headers. Consumers
  retain the returned URL; Cloudflare cache rules must honor query strings
  and origin cache headers. Concurrent updates are last write wins.
- Job images use unique `jobs/{job_id}/{uuid}.{extension}` keys with public,
  immutable URLs. They do not imply an attachment or visibility flag in the
  CRM database. Existing Supabase Storage attachments are unchanged.
- Users provision Vault entries manually; no credentials belong in SQL or Git.
- Deployment must apply the migration, regenerate database types, configure
  public R2 access/caching, then deploy the function. This feature does none
  of those remote operations.
- There is no image transformation, format normalization, EXIF stripping,
  deletion or orphan cleanup. File signatures validate type, not full decode.
