import { describe, expect, it } from 'vitest'

import { getOptimizer, optimizerInfo } from './index'

describe('optimizerInfo', () => {
  it('defaults to no optimizer, with a reason that names no secrets', () => {
    for (const config of [
      {},
      { OPTIMIZER_PROVIDER: 'none' as const },
      { OPTIMIZER_PROVIDER: 'none' as const, VROOM_URL: 'http://secret:3000' },
    ]) {
      const info = optimizerInfo(config)
      expect(info).toMatchObject({ available: false, provider: 'none' })
      expect(info.reason).toMatch(/nearest-neighbour/)
      expect(info.reason).not.toMatch(/secret|3000|http/)
    }
  })

  it('is unavailable when vroom is chosen without an address', () => {
    expect(optimizerInfo({ OPTIMIZER_PROVIDER: 'vroom' })).toMatchObject({
      available: false,
      provider: 'vroom',
    })
  })

  it('is available with a VROOM address', () => {
    expect(
      optimizerInfo({ OPTIMIZER_PROVIDER: 'vroom', VROOM_URL: 'http://v' }),
    ).toEqual({ available: true, provider: 'vroom', reason: null })
  })
})

describe('getOptimizer', () => {
  it('returns null unless the optimizer is usable', () => {
    expect(getOptimizer({})).toBeNull()
    expect(getOptimizer({ OPTIMIZER_PROVIDER: 'none' })).toBeNull()
    expect(getOptimizer({ OPTIMIZER_PROVIDER: 'vroom' })).toBeNull()
  })

  it('builds a VROOM optimizer, with road legs only when OSRM is set', () => {
    const vroom = getOptimizer({
      OPTIMIZER_PROVIDER: 'vroom',
      VROOM_URL: 'http://v',
    })
    expect(vroom?.name).toBe('vroom')
    expect(vroom?.legs).toBeUndefined()
    const both = getOptimizer({
      OPTIMIZER_PROVIDER: 'vroom',
      VROOM_URL: 'http://v',
      OSRM_URL: 'http://o',
    })
    expect(both?.legs).toBeTypeOf('function')
  })
})
