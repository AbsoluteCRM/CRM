// Lets plain Node (22.18+, which strips TypeScript types) run repo scripts
// that import modules written for Vite's resolver: `#/x` maps to `src/x`
// (Node 22 rejects `#/` as an imports key), and extensionless relative
// imports are retried with `.ts`, `.tsx` and `/index.ts`.
// Usage: node --import ./scripts/register-ts.mjs scripts/<script>.ts
import { register } from 'node:module'

const hooks = `
const SUFFIXES = ['', '.ts', '.tsx', '/index.ts']
let src
export function initialize(data) {
  src = data.src
}
export async function resolve(specifier, context, next) {
  let base = specifier
  if (specifier.startsWith('#/')) base = new URL(specifier.slice(2), src).href
  else if (!specifier.startsWith('./') && !specifier.startsWith('../'))
    return next(specifier, context)
  let firstError
  for (const suffix of SUFFIXES) {
    try {
      return await next(base + suffix, context)
    } catch (error) {
      firstError ??= error
    }
  }
  throw firstError
}
`

register('data:text/javascript,' + encodeURIComponent(hooks), {
  parentURL: import.meta.url,
  data: { src: new URL('../src/', import.meta.url).href },
})
