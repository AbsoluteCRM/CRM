import { uploadConfig } from './validation.ts'

/** Fixed server-side names; no user input can select an environment variable. */
export function readEnvironmentUploadConfig(
  read: (name: string) => string | undefined,
) {
  return uploadConfig({
    r2_account_id: read('r2_account_id'),
    r2_access_key_id: read('r2_access_key_id'),
    r2_secret_access_key: read('r2_secret_access_key'),
    r2_bucket_name: read('r2_bucket_name'),
    r2_public_base_url: read('r2_public_base_url'),
  })
}
