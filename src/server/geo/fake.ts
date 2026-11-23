import { normalizeAddress } from './address'
import type { GeocodeResult, Geocoder } from './types'

type Entry = Omit<GeocodeResult, 'source' | 'normalizedAddress'> | null | Error

// A table-driven geocoder for tests. Keys are `normalizeAddress` output.
// Unknown addresses resolve to `fallback` (null by default).
export function createFakeGeocoder(
  table: Record<string, Entry> = {},
  options: { name?: string; fallback?: Entry } = {},
) {
  const name = options.name ?? 'fake'
  const calls: Array<string> = []
  const geocoder: Geocoder & { calls: Array<string> } = {
    name,
    calls,
    async geocode(address) {
      const key = normalizeAddress(address)
      calls.push(key)
      const entry = key in table ? table[key] : (options.fallback ?? null)
      if (entry instanceof Error) throw entry
      if (!entry) return null
      return { ...entry, normalizedAddress: key, source: name }
    },
  }
  return geocoder
}
