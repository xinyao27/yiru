import type {
  ProviderRateLimits,
  RateLimitState,
  RateLimitWindow
} from '../../shared/rate-limit-types'
import type {
  SpoolProviderQuota,
  SpoolProviderQuotaWindow
} from '../../shared/spool/spool-catalog-contract'

export type SpoolCachedQuotaState = Pick<RateLimitState, 'claude' | 'codex'>

export type SpoolQuotaProjectionSource = {
  getCachedActiveRateLimitState(): SpoolCachedQuotaState
  subscribeCachedActiveRateLimitState?: (listener: () => void) => () => void
}

export class SpoolQuotaProjection {
  constructor(private readonly source: SpoolQuotaProjectionSource) {}

  snapshot(): readonly SpoolProviderQuota[] {
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
): SpoolProviderQuota {
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

function unavailableProvider(provider: 'claude' | 'codex'): SpoolProviderQuota {
  return {
    provider,
    status: 'unavailable',
    updatedAt: null,
    fiveHour: null,
    sevenDay: null
  }
}

function projectWindow(window: RateLimitWindow | null): SpoolProviderQuotaWindow | null {
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
