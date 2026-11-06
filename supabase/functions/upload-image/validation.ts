export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const MAX_BODY_SIZE = MAX_FILE_SIZE + 64 * 1024
export const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const organizationPattern = new RegExp(`^${UUID}$`)
const targets = [
  { pattern: new RegExp(`^company_logos/(${UUID})$`), logo: true },
  { pattern: new RegExp(`^jobs/(${UUID})$`), logo: false },
]

export function resolveTarget(organizationId: string, folder: string) {
  if (!organizationPattern.test(organizationId)) return null
  for (const target of targets) {
    const match = target.pattern.exec(folder)
    if (match && (!target.logo || match[1] === organizationId)) {
      return { folder, logo: target.logo }
    }
  }
  return null
}

export async function imageExtension(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const starts = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte)
  if (file.type === 'image/jpeg' && starts([255, 216, 255])) return 'jpg'
  if (file.type === 'image/png' && starts([137, 80, 78, 71, 13, 10, 26, 10]))
    return 'png'
  if (
    file.type === 'image/webp' &&
    starts([82, 73, 70, 70]) &&
    [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte)
  )
    return 'webp'
  return null
}

export type UploadConfig = {
  r2_account_id: string
  r2_access_key_id: string
  r2_secret_access_key: string
  r2_bucket_name: string
  r2_public_base_url: string
}

export function uploadConfig(
  value: unknown,
  reportInvalid?: (field: keyof UploadConfig | 'configuration') => void,
): UploadConfig | null {
  const invalid = (field: keyof UploadConfig | 'configuration') => {
    reportInvalid?.(field)
    return null
  }
  if (!value || typeof value !== 'object') return invalid('configuration')
  const config = value as Record<string, unknown>
  const names = [
    'r2_account_id',
    'r2_access_key_id',
    'r2_secret_access_key',
    'r2_bucket_name',
    'r2_public_base_url',
  ] as const
  const missing = names.find(
    (name) =>
      typeof config[name] !== 'string' || !(config[name] as string).trim(),
  )
  if (missing) return invalid(missing)
  const result = config as UploadConfig
  if (!/^[a-f0-9]{32}$/.test(result.r2_account_id))
    return invalid('r2_account_id')
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(result.r2_bucket_name))
    return invalid('r2_bucket_name')
  try {
    const url = new URL(result.r2_public_base_url)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return invalid('r2_public_base_url')
  } catch {
    return invalid('r2_public_base_url')
  }
  return result
}
