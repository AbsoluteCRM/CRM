import { OptimizerError } from './types'

// Shared JSON-over-HTTP helper for the solver adapters. Errors never carry the
// URL (it holds coordinates for OSRM) or any part of a response body.

export type JsonRequest = {
  method: 'GET' | 'POST'
  body?: unknown
  timeoutMs: number
  signal?: AbortSignal
  /** Used in error messages, e.g. 'route optimizer' or 'road network'. */
  label: string
}

export async function requestJson(
  url: URL,
  init: JsonRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs)
  const onAbort = () => controller.abort()
  init.signal?.addEventListener('abort', onAbort, { once: true })
  const state = { timedOut: false }
  controller.signal.addEventListener(
    'abort',
    () => {
      state.timedOut = !init.signal?.aborted
    },
    { once: true },
  )
  try {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: init.method,
        headers: {
          accept: 'application/json',
          ...(init.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
        redirect: 'error',
      })
    } catch {
      throw state.timedOut
        ? new OptimizerError(
            'timeout',
            `The ${init.label} did not answer in time.`,
          )
        : new OptimizerError(
            'unreachable',
            `The ${init.label} could not be reached.`,
          )
    }
    if (!response.ok) {
      throw new OptimizerError(
        'bad_status',
        `The ${init.label} returned an error (HTTP ${response.status}).`,
      )
    }
    try {
      return await response.json()
    } catch {
      throw state.timedOut
        ? new OptimizerError(
            'timeout',
            `The ${init.label} did not answer in time.`,
          )
        : new OptimizerError(
            'bad_response',
            `The ${init.label} returned an unexpected response.`,
          )
    }
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener('abort', onAbort)
  }
}

/** `base` + `path`, keeping any path prefix on `base` (reverse proxies). */
export function joinUrl(base: string, path: string): URL {
  const url = new URL(base)
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  url.search = ''
  url.hash = ''
  return url
}
