import { describe, expect, it, vi } from 'vitest'
import {
  LOGO_MAX_BYTES,
  resolveLogoUrl,
  uploadCompanyLogo,
  validLogoReference,
  validateLogoFile,
} from './logo'

const org = '0198f0a0-0000-7000-8000-000000000001'
const key = `company_logos/${org}/logo.png`
const url = `https://images.test/base/${key}?v=one%2Ftwo&extra=yes`
const file = () => new File(['png'], 'logo.png', { type: 'image/png' })

describe('logo references', () => {
  it('preserves full public queries and signs only legacy paths (settings and portal)', async () => {
    const sign = vi.fn(async () => 'signed')
    expect(validLogoReference(url, org)).toBe(true)
    expect(await resolveLogoUrl(url, sign)).toBe(url)
    expect(sign).not.toHaveBeenCalled()
    expect(await resolveLogoUrl(`${org}/branding/logo.png`, sign)).toBe(
      'signed',
    )
    expect(await resolveLogoUrl(null, sign)).toBeNull()
  })
  it.each([
    `http://images.test/${key}`,
    `https://user:pass@images.test/${key}`,
    `https://images.test/${key}#fragment`,
    `https://images.test/company_logos/foreign/logo.png`,
    `https://images.test/prefixcompany_logos/${org}/logo.png`,
    `https://images.test/x/../${key}`,
    `https://images.test/%2e%2e/${key}`,
    `https://images.test/%2F/${key}`,
    `https://images.test/%5c/${key}`,
    `https://images.test/%252e/${key}`,
    `https://images.test/jobs/${org}/logo.png`,
    `${org}/branding/%2e%2e/logo.png`,
    `${org}/branding/../../logo.png`,
  ])('rejects %s', (reference) =>
    expect(validLogoReference(reference, org)).toBe(false),
  )
})

describe('upload orchestration', () => {
  const setup = () => ({
    invoke: vi.fn(async (_body: FormData) => ({
      data: { organizationId: org, key, url },
      error: null as unknown,
    })),
    save: vi.fn(async (_path: string) => {}),
    isCurrent: vi.fn(() => true),
  })
  it('sends multipart fields and persists the full URL only after upload', async () => {
    const deps = setup()
    expect(await uploadCompanyLogo(file(), org, deps)).toBe(true)
    const body = deps.invoke.mock.calls[0][0]
    expect(body.get('organizationId')).toBe(org)
    expect(body.get('folder')).toBe(`company_logos/${org}`)
    expect(body.get('file')).toBeInstanceOf(File)
    expect(deps.save).toHaveBeenCalledWith(url)
  })
  it('waits for upload completion before persisting', async () => {
    const deps = setup()
    let finish!: (value: Awaited<ReturnType<typeof deps.invoke>>) => void
    deps.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = uploadCompanyLogo(file(), org, deps)
    expect(deps.save).not.toHaveBeenCalled()
    finish({ data: { organizationId: org, key, url }, error: null })
    await pending
    expect(deps.save).toHaveBeenCalledWith(url)
  })
  it('accepts exactly 10 MiB and rejects invalid files before network', async () => {
    expect(() =>
      validateLogoFile(
        new File([new Uint8Array(LOGO_MAX_BYTES)], 'x', { type: 'image/png' }),
      ),
    ).not.toThrow()
    for (const invalid of [
      new File([], 'x', { type: 'image/png' }),
      new File(['x'], 'x', { type: 'image/svg+xml' }),
      new File([new Uint8Array(LOGO_MAX_BYTES + 1)], 'x', {
        type: 'image/png',
      }),
    ]) {
      const deps = setup()
      await expect(uploadCompanyLogo(invalid, org, deps)).rejects.toThrow()
      expect(deps.invoke).not.toHaveBeenCalled()
      expect(deps.save).not.toHaveBeenCalled()
    }
  })
  it('suppresses followup persistence after workspace switches', async () => {
    const deps = setup()
    deps.isCurrent.mockReturnValue(false)
    expect(await uploadCompanyLogo(file(), org, deps)).toBe(false)
    expect(deps.save).not.toHaveBeenCalled()
  })
  it('suppresses stale completion after a save already began', async () => {
    const deps = setup()
    deps.save.mockImplementation(async () => {
      deps.isCurrent.mockReturnValue(false)
    })
    expect(await uploadCompanyLogo(file(), org, deps)).toBe(false)
  })
  it('propagates save failure and sanitizes service errors', async () => {
    const deps = setup()
    deps.save.mockRejectedValue(new Error('Save failed'))
    await expect(uploadCompanyLogo(file(), org, deps)).rejects.toThrow(
      'Save failed',
    )
    deps.invoke.mockResolvedValue({
      data: { organizationId: org, key, url },
      error: new Error('secret provider details'),
    })
    await expect(uploadCompanyLogo(file(), org, deps)).rejects.toThrow(
      'Couldn’t upload the logo. Please try again.',
    )
  })
  it.each([
    { organizationId: 'other', key, url },
    { organizationId: org, key: 'jobs/x', url },
    { organizationId: org, key, url: 'http://unsafe.test/logo.png' },
    null,
  ])('rejects malformed results', async (data) => {
    const deps = setup()
    deps.invoke = vi.fn(async () => ({
      data,
      error: null,
    })) as typeof deps.invoke
    await expect(uploadCompanyLogo(file(), org, deps)).rejects.toThrow(
      'invalid logo',
    )
    expect(deps.save).not.toHaveBeenCalled()
  })
})
