import { createClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'
import { corsHeaders, createUploadHandler } from './handler.ts'
import { readEnvironmentUploadConfig } from './configuration.ts'

const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}
const caller = (jwt: string) =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } },
  )

const handler = createUploadHandler({
  async authenticate(jwt) {
    const { data, error } = await caller(jwt).auth.getUser(jwt)
    return error ? null : data.user
  },
  async authorize(jwt, organizationId, folder) {
    return await caller(jwt).rpc('authorize_image_upload', {
      p_organization_id: organizationId,
      p_folder: folder,
    })
  },
  async configuration() {
    return {
      data: readEnvironmentUploadConfig(
        (name) => Deno.env.get(name),
        (field) =>
          console.error(
            JSON.stringify({ event: 'upload_image_config_invalid', field }),
          ),
      ),
      error: null,
    }
  },
  async put(config, key, file, cacheControl, signal) {
    const client = new AwsClient({
      accessKeyId: config.r2_access_key_id,
      secretAccessKey: config.r2_secret_access_key,
      region: 'auto',
      service: 's3',
      retries: 0,
    })
    const request = await client.sign(
      `https://${config.r2_account_id}.r2.cloudflarestorage.com/${config.r2_bucket_name}/${key}`,
      {
        method: 'PUT',
        body: file,
        signal,
        headers: { 'Content-Type': file.type, 'Cache-Control': cacheControl },
      },
    )
    return await fetch(request, { signal, redirect: 'error' })
  },
  randomUUID: () => crypto.randomUUID(),
  log: (event) => console.error(JSON.stringify({ event })),
})

Deno.serve((request) => {
  if (
    request.method === 'POST' &&
    (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_ANON_KEY'))
  ) {
    console.error(JSON.stringify({ event: 'upload_image_failure_503' }))
    return Response.json(
      { error: 'Upload configuration unavailable' },
      { status: 503, headers: corsHeaders },
    )
  }
  return handler(request)
})
