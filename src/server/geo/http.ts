// Shared fetch helper for providers. Errors never carry the request URL,
// because provider URLs hold API keys.
export class GeocoderError extends Error {
  constructor(provider: string, reason: string) {
    super(`${provider}: ${reason}`)
    this.name = 'GeocoderError'
  }
}

export async function fetchJson(
  provider: string,
  url: URL,
  init: {
    headers?: Record<string, string>
    timeoutMs: number
    signal?: AbortSignal
  },
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs)
  const onAbort = () => controller.abort()
  init.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { accept: 'application/json', ...init.headers },
        signal: controller.signal,
      })
    } catch {
      throw new GeocoderError(
        provider,
        controller.signal.aborted ? 'timed out or aborted' : 'network error',
      )
    }
    if (!response.ok)
      throw new GeocoderError(provider, `HTTP ${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new GeocoderError(provider, 'invalid JSON')
    }
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', onAbort)
  }
}
