import { describe, expect, it, vi } from 'vitest'

type Middleware = (input: {
  request: Request
  next: () => Promise<{ response: Response }>
}) => Promise<{ response: Response }>

const state = vi.hoisted(() => ({ middleware: null as Middleware | null }))
vi.mock('@tanstack/react-start', () => ({
  createMiddleware: () => ({
    server: (middleware: Middleware) => {
      state.middleware = middleware
      return middleware
    },
  }),
  createStart: (options: () => unknown) => options(),
}))
vi.mock('./server/trusted/frame-policy', () => ({
  frameAncestorsFor: () => Promise.resolve("frame-ancestors 'self'"),
  SAME_ORIGIN_ONLY: "frame-ancestors 'self'",
}))
await import('./start')

describe('security response headers', () => {
  it.each([
    ['no-referrer', 'no-referrer'],
    [null, 'strict-origin-when-cross-origin'],
  ])('preserves route referrer policy %s', async (policy, expected) => {
    const response = new Response('quote', {
      headers: policy ? { 'Referrer-Policy': policy } : {},
    })
    const result = await state.middleware!({
      request: new Request('https://crm.example/q/private-token'),
      next: () => Promise.resolve({ response }),
    })
    expect(result.response.headers.get('Referrer-Policy')).toBe(expected)
    expect(result.response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN')
  })
})
