import type {
  CoworkingProviderQuota,
  CoworkingProviderQuotaWindow
} from '../../shared/coworking/catalog-contract'
import type {
  ProviderRateLimits,
  RateLimitState,
  RateLimitWindow
} from '../../shared/rate-limit-types'

export type CoworkingCachedQuotaState = Pick<RateLimitState, 'claude' | 'codex'>

export type CoworkingQuotaProjectionSource = {
  getCachedActiveRateLimitState(): CoworkingCachedQuotaState
  subscribeCachedActiveRateLimitState?: (listener: () => void) => () => void
}

export class CoworkingQuotaProjection {
  constructor(private readonly source: CoworkingQuotaProjectionSource) {}

  snapshot(): readonly CoworkingProviderQuota[] {
    const state = this.source.getCachedActiveRateLimitState()
    return [projectProvider('claude', state.claude), projectProvider('codex', state.codex)]
  }

  subscribe(listener: () => void): () => void {
    return this.source.subscribeCachedActiveRateLimitState?.(listener) ?? (() => {})
  }
}

function projectProvider(
  provider: 'claude' | 'codex',
  rateLimits: ProviderRateLimits | null
): CoworkingProviderQuota {
  if (!rateLimits || rateLimits.provider !== provider || rateLimits.status !== 'ok') {
    return unavailableProvider(provider)
  }
  return {
    provider,
    status: 'ok',
    updatedAt: finiteTimestamp(rateLimits.updatedAt),
    fiveHour: projectWindow(rateLimits.session),
    sevenDay: projectWindow(rateLimits.weekly)
  }
}

function unavailableProvider(provider: 'claude' | 'codex'): CoworkingProviderQuota {
  return {
    provider,
    status: 'unavailable',
    updatedAt: null,
    fiveHour: null,
    sevenDay: null
  }
}

function projectWindow(window: RateLimitWindow | null): CoworkingProviderQuotaWindow | null {
  if (!window || !Number.isFinite(window.usedPercent)) {
    return null
  }
  return {
    usedPercent: Math.min(100, Math.max(0, window.usedPercent)),
    resetsAt: finiteTimestamp(window.resetsAt)
  }
}

function finiteTimestamp(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
