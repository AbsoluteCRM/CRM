import {
  imageExtension,
  MAX_BODY_SIZE,
  MAX_FILE_SIZE,
  resolveTarget,
  uploadConfig,
} from './validation.ts'
import type { UploadConfig } from './validation.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Result = { data: unknown; error: unknown }
export type Dependencies = {
  authenticate: (
    jwt: string,
  ) => Promise<{ id: string; is_anonymous?: boolean } | null>
  authorize: (
    jwt: string,
    organizationId: string,
    folder: string,
  ) => Promise<Result>
  configuration: () => Promise<Result>
  put: (
    config: UploadConfig,
    key: string,
    file: File,
    cacheControl: string,
    signal: AbortSignal,
  ) => Promise<Response>
  randomUUID: () => string
  log: (event: string) => void
}

class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function multipart(request: Request): Promise<FormData> {
  if (
    !/^multipart\/form-data\s*;/i.test(
      request.headers.get('content-type') ?? '',
    )
  )
    throw new UploadError(400, 'Invalid multipart request')
  const length = request.headers.get('content-length')
  if (length && Number(length) > MAX_BODY_SIZE)
    throw new UploadError(413, 'Image too large')
  if (!request.body) throw new UploadError(400, 'Missing body')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_SIZE) {
        await reader.cancel()
        throw new UploadError(413, 'Image too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return await new Response(bytes, {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData()
  } catch {
    throw new UploadError(400, 'Invalid multipart request')
  }
}

export function createUploadHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const json = (body: unknown, status: number) =>
      Response.json(body, { status, headers: corsHeaders })
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders })
    if (request.method !== 'POST')
      return json({ error: 'Method not allowed' }, 405)
    try {
      const token = /^Bearer\s+(\S+)$/i.exec(
        request.headers.get('authorization') ?? '',
      )?.[1]
      if (!token) throw new UploadError(401, 'Authentication required')
      let user
      try {
        user = await dependencies.authenticate(token)
      } catch {
        throw new UploadError(401, 'Authentication required')
      }
      if (!user || user.is_anonymous)
        throw new UploadError(401, 'Authentication required')
      const form = await multipart(request)
      const fields = ['organizationId', 'folder', 'file']
      if (
        [...form.keys()].some((name) => !fields.includes(name)) ||
        fields.some((name) => form.getAll(name).length !== 1)
      )
        throw new UploadError(400, 'Invalid upload fields')
      const organizationId = form.get('organizationId')
      const folder = form.get('folder')
      const file = form.get('file')
      if (
        typeof organizationId !== 'string' ||
        typeof folder !== 'string' ||
        !(file instanceof File)
      )
        throw new UploadError(400, 'Invalid upload fields')
      const target = resolveTarget(organizationId, folder)
      if (!target) throw new UploadError(400, 'Invalid upload target')
      if (file.size > MAX_FILE_SIZE)
        throw new UploadError(413, 'Image too large')
      if (!file.size) throw new UploadError(400, 'Empty image')
      const extension = await imageExtension(file)
      if (!extension) throw new UploadError(415, 'Unsupported image type')
      const authorization = await dependencies.authorize(
        token,
        organizationId,
        folder,
      )
      if (authorization.error || authorization.data !== organizationId)
        throw new UploadError(403, 'Upload forbidden')
      const configuration = await dependencies.configuration()
      const config = configuration.error
        ? null
        : uploadConfig(configuration.data)
      if (!config)
        throw new UploadError(503, 'Upload configuration unavailable')
      const key = `${folder}/${target.logo ? 'logo' : dependencies.randomUUID()}.${extension}`
      const cacheControl = target.logo
        ? 'no-cache, max-age=0, must-revalidate'
        : 'public, max-age=31536000, immutable'
      let response: Response
      try {
        response = await dependencies.put(
          config,
          key,
          file,
          cacheControl,
          AbortSignal.timeout(20_000),
        )
      } catch {
        throw new UploadError(502, 'Image storage unavailable')
      }
      await response.body?.cancel()
      if (!response.ok) throw new UploadError(502, 'Image storage unavailable')
      const url = new URL(
        `${config.r2_public_base_url.replace(/\/$/, '')}/${key}`,
      )
      if (target.logo) url.searchParams.set('v', dependencies.randomUUID())
      return json(
        {
          key,
          url: url.href,
          organizationId,
          contentType: file.type,
          size: file.size,
        },
        200,
      )
    } catch (error) {
      const status = error instanceof UploadError ? error.status : 502
      if (status >= 500) dependencies.log(`upload_image_failure_${status}`)
      return json(
        {
          error:
            error instanceof UploadError ? error.message : 'Upload unavailable',
        },
        status,
      )
    }
  }
}
