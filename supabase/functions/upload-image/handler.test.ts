import { createUploadHandler } from './handler.ts'
import type { Dependencies } from './handler.ts'
import {
  imageExtension,
  MAX_BODY_SIZE,
  MAX_FILE_SIZE,
  resolveTarget,
  uploadConfig,
} from './validation.ts'

const org = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const config = {
  r2_account_id: 'a'.repeat(32),
  r2_access_key_id: 'fake-access',
  r2_secret_access_key: 'fake-secret',
  r2_bucket_name: 'test-images',
  r2_public_base_url: 'https://images.example.com',
}
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
}
function fixture(overrides: Partial<Dependencies> = {}) {
  const calls: string[] = []
  const puts: { key: string; cache: string; type: string }[] = []
  let id = 0
  const dependencies: Dependencies = {
    authenticate: async () => {
      calls.push('auth')
      return { id: 'user' }
    },
    authorize: async (_jwt, organizationId) => {
      calls.push('authorize')
      return { data: organizationId, error: null }
    },
    configuration: async () => {
      calls.push('config')
      return { data: config, error: null }
    },
    put: async (_config, key, file, cache, signal) => {
      calls.push('put')
      puts.push({ key, cache, type: file.type })
      equal(signal.aborted, false)
      return new Response(null, { status: 200 })
    },
    randomUUID: () => `generated-${++id}`,
    log: (event) => calls.push(event),
    ...overrides,
  }
  return { handler: createUploadHandler(dependencies), calls, puts }
}
function request(
  options: {
    folder?: string
    organizationId?: string
    bytes?: Uint8Array
    type?: string
    extra?: string
    duplicate?: string
    token?: string
  } = {},
) {
  const form = new FormData()
  form.append('organizationId', options.organizationId ?? org)
  form.append('folder', options.folder ?? `company_logos/${org}`)
  form.append(
    'file',
    new File([new Uint8Array(options.bytes ?? png)], 'untrusted.svg', {
      type: options.type ?? 'image/png',
    }),
  )
  if (options.extra) form.append(options.extra, new File([png], 'extra.png'))
  if (options.duplicate) form.append(options.duplicate, 'duplicate')
  return new Request('https://function.example.com', {
    method: 'POST',
    headers: { authorization: options.token ?? 'Bearer user-jwt' },
    body: form,
  })
}

Deno.test(
  'logos use stable validated extension, no-cache and fresh URL versions',
  async () => {
    const { handler, puts, calls } = fixture()
    const first = await handler(request())
    equal(first.status, 200)
    const data = await first.json()
    equal(data.key, `company_logos/${org}/logo.png`)
    equal(
      data.url,
      `https://images.example.com/company_logos/${org}/logo.png?v=generated-1`,
    )
    equal(data.size, png.length)
    equal(data.contentType, 'image/png')
    equal(
      (await (await handler(request())).json()).url.endsWith('?v=generated-2'),
      true,
    )
    equal(puts[0].cache, 'no-cache, max-age=0, must-revalidate')
    equal(calls.slice(0, 4), ['auth', 'authorize', 'config', 'put'])
  },
)
Deno.test('jobs use unique immutable keys without query tokens', async () => {
  const { handler, puts } = fixture()
  const first = await (
    await handler(request({ folder: `jobs/${other}` }))
  ).json()
  const second = await (
    await handler(request({ folder: `jobs/${other}` }))
  ).json()
  equal(first.key, `jobs/${other}/generated-1.png`)
  equal(second.key, `jobs/${other}/generated-2.png`)
  equal(new URL(first.url).search, '')
  equal(puts[0].cache, 'public, max-age=31536000, immutable')
})
Deno.test(
  'SQL role and tenant authorization gates every employee role and denials before secrets',
  async () => {
    // The SQL tests own the role matrix. The handler delegates with the selected
    // organization and uses no role claims from the JWT.
    for (const organizationId of [org, other]) {
      const { handler } = fixture({
        authorize: async (jwt, selected, folder) => {
          equal(jwt, 'user-jwt')
          equal(selected, organizationId)
          equal(folder, `jobs/${other}`)
          return { data: selected, error: null }
        },
      })
      equal(
        (await handler(request({ organizationId, folder: `jobs/${other}` })))
          .status,
        200,
      )
    }
    for (const denied of [
      'disabled',
      'invited',
      'portal',
      'nonmember',
      'cross-org',
      'missing-job',
    ]) {
      const { handler, calls } = fixture({
        authorize: async () => ({ data: null, error: { message: denied } }),
      })
      const response = await handler(request({ folder: `jobs/${other}` }))
      equal(response.status, 403)
      equal(await response.json(), { error: 'Upload forbidden' })
      equal(calls, ['auth'])
    }
    const { handler } = fixture({
      authorize: async () => ({ data: other, error: null }),
    })
    equal((await handler(request())).status, 403)
  },
)
Deno.test(
  'missing invalid expired anonymous JWT rejected without reading request body',
  async () => {
    for (const user of [null, { id: 'anonymous', is_anonymous: true }]) {
      const { handler, calls } = fixture({ authenticate: async () => user })
      equal((await handler(request())).status, 401)
      equal(calls, [])
    }
    const { handler, calls } = fixture()
    equal((await handler(request({ token: 'invalid' }))).status, 401)
    equal(calls, [])
  },
)
Deno.test('CORS preflight and method restrictions', async () => {
  const { handler, calls } = fixture()
  for (const [method, status] of [
    ['OPTIONS', 204],
    ['GET', 405],
  ] as const) {
    const response = await handler(
      new Request('https://example.com', { method }),
    )
    equal(response.status, status)
    equal(response.headers.get('access-control-allow-origin'), '*')
  }
  equal(calls, [])
})
Deno.test(
  'rejects malformed fields targets MIME and empty uploads before authorization',
  async () => {
    const cases = [
      { extra: 'otherFile' },
      { duplicate: 'file' },
      { duplicate: 'folder' },
      { duplicate: 'organizationId' },
      { organizationId: 'invalid' },
      { folder: `company_logos/${other}` },
      { folder: `jobs/${other}/../x` },
      { folder: `jobs%2f${other}` },
      { bytes: new Uint8Array() },
      { type: 'image/svg+xml' },
      { type: 'image/jpeg' },
    ]
    for (const options of cases) {
      const { handler, calls } = fixture()
      const response = await handler(request(options))
      equal(response.status, options.type ? 415 : 400)
      equal(calls, ['auth'])
    }
    const { handler } = fixture()
    equal(
      (
        await handler(
          new Request('https://example.com', {
            method: 'POST',
            headers: {
              authorization: 'Bearer jwt',
              'content-type': 'multipart/form-data; boundary=bad',
            },
            body: 'broken',
          }),
        )
      ).status,
      400,
    )
  },
)
Deno.test(
  'enforces file and actual streamed body caps despite absent or false Content-Length',
  async () => {
    const { handler } = fixture()
    equal(
      (await handler(request({ bytes: new Uint8Array(MAX_FILE_SIZE + 1) })))
        .status,
      413,
    )
    for (const length of [undefined, '1', String(MAX_BODY_SIZE + 1)]) {
      let cancelled = false
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(64 * 1024))
        },
        cancel() {
          cancelled = true
        },
      })
      const headers: Record<string, string> = {
        authorization: 'Bearer jwt',
        'content-type': 'multipart/form-data; boundary=x',
      }
      if (length) headers['content-length'] = length
      equal(
        (
          await handler(
            new Request('https://example.com', {
              method: 'POST',
              headers,
              body: stream,
            }),
          )
        ).status,
        413,
      )
      if (length !== String(MAX_BODY_SIZE + 1)) equal(cancelled, true)
    }
  },
)
Deno.test(
  'validates JPEG PNG and WebP signatures and MIME agreement',
  async () => {
    for (const [type, bytes, extension] of [
      ['image/jpeg', [255, 216, 255], 'jpg'],
      ['image/png', [...png], 'png'],
      ['image/webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], 'webp'],
    ] as const) {
      equal(
        await imageExtension(
          new File([new Uint8Array(bytes)], 'anything', { type }),
        ),
        extension,
      )
      equal(
        await imageExtension(
          new File([new Uint8Array([1, 2])], 'anything', { type }),
        ),
        null,
      )
    }
    for (const folder of [
      `jobs/${other}/`,
      'jobs/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
      `other/${org}`,
      `jobs//${org}`,
    ])
      equal(resolveTarget(org, folder), null)
  },
)
Deno.test(
  'configuration is validated and never included in errors',
  async () => {
    for (const invalid of [
      null,
      {},
      { ...config, r2_account_id: '../x' },
      { ...config, r2_bucket_name: '../bucket' },
      { ...config, r2_access_key_id: '' },
      ...[
        'http://example.com',
        'https://user:pass@example.com',
        'https://example.com/?secret=x',
        'https://example.com/#x',
      ].map((url) => ({ ...config, r2_public_base_url: url })),
    ]) {
      equal(uploadConfig(invalid), null)
      const { handler, calls } = fixture({
        configuration: async () => ({ data: invalid, error: null }),
      })
      const response = await handler(request())
      equal(response.status, 503)
      equal(await response.json(), {
        error: 'Upload configuration unavailable',
      })
      equal(calls.includes('put'), false)
    }
  },
)
Deno.test(
  'upstream HTTP network and timeout failures are sanitized without retries',
  async () => {
    for (const put of [
      async () => new Response('provider fake-secret', { status: 403 }),
      async () => {
        throw new Error('fake-secret')
      },
      async () => {
        throw new DOMException('fake-secret', 'TimeoutError')
      },
    ]) {
      let count = 0
      const { handler, calls } = fixture({
        put: async () => {
          count++
          return await put()
        },
      })
      const response = await handler(request())
      equal(response.status, 502)
      equal(await response.json(), { error: 'Image storage unavailable' })
      equal(count, 1)
      equal(calls.at(-1), 'upload_image_failure_502')
    }
  },
)

Deno.test(
  'accepts exactly the maximum image size and rejects authentication before pulling bytes',
  async () => {
    const bytes = new Uint8Array(MAX_FILE_SIZE)
    bytes.set(png)
    const { handler } = fixture()
    equal((await handler(request({ bytes }))).status, 200)
    let pulls = 0
    const body = new ReadableStream<Uint8Array>(
      {
        pull() {
          pulls++
        },
      },
      { highWaterMark: 0 },
    )
    const unauthenticated = new Request('https://example.com', {
      method: 'POST',
      body,
    })
    equal((await handler(unauthenticated)).status, 401)
    equal(pulls, 0)
    await body.cancel()
  },
)
