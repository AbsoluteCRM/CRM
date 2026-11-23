export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const LOGO_MAX_BYTES = 10 * 1024 * 1024

export function isPublicLogo(reference: string) {
  return reference.startsWith('https://')
}

/** Check raw paths before URL parsing can normalize dot segments away. */
export function validLogoReference(reference: string, organizationId: string) {
  if (reference.length > 2048 || /[\\\s#]/.test(reference)) return false
  const rawPath = reference.split('?')[0]
  if (/%(?:2e|2f|5c|25)/i.test(rawPath) || rawPath.includes('..')) return false
  if (!isPublicLogo(reference)) {
    return (
      reference.length <= 300 &&
      reference.startsWith(`${organizationId}/branding/`) &&
      /\.(png|jpe?g|webp)$/i.test(reference) &&
      !reference.includes('?') &&
      !reference.includes(':')
    )
  }
  try {
    const url = new URL(reference)
    return publicPathMatches(url, organizationId)
  } catch {
    return false
  }
}

function publicPathMatches(url: URL, organizationId: string) {
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.hash &&
    ['jpg', 'png', 'webp'].some((ext) =>
      url.pathname.endsWith(`/company_logos/${organizationId}/logo.${ext}`),
    )
  )
}

export async function resolveLogoUrl(
  reference: string | null,
  sign: (path: string) => Promise<string | null>,
) {
  if (!reference) return null
  return isPublicLogo(reference) ? reference : sign(reference)
}

export function validateLogoFile(file: File) {
  if (!LOGO_TYPES.includes(file.type))
    throw new Error('Use a PNG, JPG, or WebP image.')
  if (!file.size) throw new Error('Choose a nonempty image.')
  if (file.size > LOGO_MAX_BYTES) throw new Error('Logos can be up to 10 MiB.')
}

type UploadDependencies = {
  invoke: (body: FormData) => Promise<{ data: unknown; error: unknown }>
  save: (path: string) => Promise<unknown>
  isCurrent: () => boolean
}

export async function uploadCompanyLogo(
  file: File,
  organizationId: string,
  dependencies: UploadDependencies,
) {
  validateLogoFile(file)
  const body = new FormData()
  body.append('organizationId', organizationId)
  body.append('folder', `company_logos/${organizationId}`)
  body.append('file', file)
  let response: Awaited<ReturnType<UploadDependencies['invoke']>>
  try {
    response = await dependencies.invoke(body)
  } catch {
    throw new Error('Couldn’t upload the logo. Please try again.')
  }
  if (!dependencies.isCurrent()) return false
  if (response.error)
    throw new Error('Couldn’t upload the logo. Please try again.')
  const result = response.data as Record<string, unknown> | null
  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const key = `company_logos/${organizationId}/logo.${extension}`
  if (
    !result ||
    result.organizationId !== organizationId ||
    result.key !== key ||
    typeof result.url !== 'string' ||
    !isPublicLogo(result.url) ||
    !validLogoReference(result.url, organizationId) ||
    !new URL(result.url).pathname.endsWith(`/${key}`)
  ) {
    throw new Error('The upload returned an invalid logo. Please try again.')
  }
  await dependencies.save(result.url)
  return dependencies.isCurrent()
}
