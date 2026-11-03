import { env } from '#/env'
import { createVroomOptimizer } from './vroom'
import type { Optimizer, OptimizerInfo } from './types'

export * from './types'
export { createFakeOptimizer } from './fake'

export const DEFAULT_TIMEOUT_MS = 30_000

type OptimizerEnv = {
  OPTIMIZER_PROVIDER?: 'none' | 'vroom'
  VROOM_URL?: string
  OSRM_URL?: string
  OPTIMIZER_TIMEOUT_MS?: number
}

/**
 * What staff are told about the optimizer: whether it can run and, if not,
 * why. No URLs, no env names, no secrets.
 */
export function optimizerInfo(config: OptimizerEnv = env): OptimizerInfo {
  const provider = config.OPTIMIZER_PROVIDER ?? 'none'
  if (provider === 'none') {
    return {
      available: false,
      provider,
      reason:
        'No route optimizer is set up on this server. Routes keep the nearest-neighbour order from Build routes.',
    }
  }
  if (!config.VROOM_URL) {
    return {
      available: false,
      provider,
      reason:
        'The route optimizer is selected but its address is not set on this server.',
    }
  }
  return { available: true, provider, reason: null }
}

/** The configured optimizer, or null when none is usable. */
export function getOptimizer(
  config: OptimizerEnv = env,
  fetchImpl?: typeof fetch,
): Optimizer | null {
  const info = optimizerInfo(config)
  if (!info.available || !config.VROOM_URL) return null
  return createVroomOptimizer({
    vroomUrl: config.VROOM_URL,
    osrmUrl: config.OSRM_URL,
    timeoutMs: config.OPTIMIZER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
    fetch: fetchImpl,
  })
}
