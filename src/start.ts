import { createMiddleware, createStart } from '@tanstack/react-start'

/**
 * Security headers on every response. Framing is decided per request: only
 * a company's embeddable request form may appear inside other sites
 * (src/server/trusted/frame-policy.ts).
 */
const securityHeaders = createMiddleware().server(async ({ request, next }) => {
  const result = await next()
  const { frameAncestorsFor, SAME_ORIGIN_ONLY } =
    await import('./server/trusted/frame-policy')
  const policy = await frameAncestorsFor(new URL(request.url))
  const headers = new Headers(result.response.headers)
  headers.set('Content-Security-Policy', policy)
  // Older browsers ignore frame-ancestors; X-Frame-Options can't list sites,
  // so it's only sent when nobody else may frame the page.
  if (policy === SAME_ORIGIN_ONLY) headers.set('X-Frame-Options', 'SAMEORIGIN')
  else headers.delete('X-Frame-Options')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  return {
    ...result,
    response: new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers,
    }),
  }
})

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
}))
