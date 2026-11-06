import { readEnvironmentUploadConfig } from './configuration.ts'

const valid: Record<string, string> = {
  r2_account_id: 'a'.repeat(32),
  r2_access_key_id: 'fake-access',
  r2_secret_access_key: 'fake-secret',
  r2_bucket_name: 'test-images',
  r2_public_base_url: 'https://images.example.com',
}
function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

Deno.test(
  'environment configuration reads only the five fixed secret names',
  () => {
    const names: string[] = []
    const config = readEnvironmentUploadConfig((name) => {
      names.push(name)
      return valid[name]
    })
    assert(
      JSON.stringify(names) === JSON.stringify(Object.keys(valid)),
      'Unexpected secret names',
    )
    assert(
      config?.r2_bucket_name === valid.r2_bucket_name,
      'Valid configuration rejected',
    )
  },
)

Deno.test('every R2 secret is required and empty secrets are rejected', () => {
  for (const missing of Object.keys(valid)) {
    for (const value of [undefined, '', '   ']) {
      const config = readEnvironmentUploadConfig((name) =>
        name === missing ? value : valid[name],
      )
      assert(config === null, 'Incomplete configuration accepted')
    }
  }
})

Deno.test(
  'environment configuration retains account bucket and public URL validation',
  () => {
    for (const [name, value] of [
      ['r2_account_id', 'invalid'],
      ['r2_bucket_name', 'Invalid Bucket'],
      ['r2_public_base_url', 'http://images.example.com'],
      ['r2_public_base_url', 'https://user:password@images.example.com'],
      ['r2_public_base_url', 'https://images.example.com?token=invalid'],
    ]) {
      assert(
        readEnvironmentUploadConfig((key) =>
          key === name ? value : valid[key],
        ) === null,
        'Invalid configuration accepted',
      )
    }
  },
)
