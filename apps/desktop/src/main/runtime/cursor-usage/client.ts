import type {
  ProviderRateLimits,
  ProviderRateLimitStatus,
  RateLimitBucket,
  RateLimitWindow
} from '~shared/rate-limit-types'

import { fetchCursorRateLimits } from './fetcher'
import type { CursorUsageRuntimeTarget } from './target'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRateLimitWindow(value: unknown): value is RateLimitWindow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'usedPercent' in value &&
    isFiniteNumber(value.usedPercent) &&
    'windowMinutes' in value &&
    isFiniteNumber(value.windowMinutes) &&
    'resetsAt' in value &&
    (value.resetsAt === null || isFiniteNumber(value.resetsAt)) &&
    'resetDescription' in value &&
    (value.resetDescription === null || typeof value.resetDescription === 'string')
  )
}

function isRateLimitBucket(value: unknown): value is RateLimitBucket {
  return isRateLimitWindow(value) && 'name' in value && typeof value.name === 'string'
}

function isCursorUsageStatus(value: unknown): value is ProviderRateLimitStatus {
  return (
    value === 'idle' ||
    value === 'fetching' ||
    value === 'ok' ||
    value === 'error' ||
    value === 'unavailable'
  )
}

export function parseCursorRateLimitsResponse(value: unknown): ProviderRateLimits | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('provider' in value) ||
    value.provider !== 'cursor' ||
    !('session' in value) ||
    (value.session !== null && !isRateLimitWindow(value.session)) ||
    !('weekly' in value) ||
    (value.weekly !== null && !isRateLimitWindow(value.weekly)) ||
    !('updatedAt' in value) ||
    !isFiniteNumber(value.updatedAt) ||
    !('error' in value) ||
    (value.error !== null && typeof value.error !== 'string') ||
    !('status' in value) ||
    !isCursorUsageStatus(value.status)
  ) {
    return null
  }

  let monthly: RateLimitWindow | null | undefined
  if ('monthly' in value) {
    if (value.monthly !== null && !isRateLimitWindow(value.monthly)) {
      return null
    }
    monthly = value.monthly
  }

  let buckets: RateLimitBucket[] | undefined
  if ('buckets' in value) {
    if (!Array.isArray(value.buckets) || !value.buckets.every(isRateLimitBucket)) {
      return null
    }
    buckets = value.buckets
  }

  let planType: string | null | undefined
  if ('planType' in value) {
    if (value.planType !== null && typeof value.planType !== 'string') {
      return null
    }
    planType = value.planType
  }

  return {
    provider: 'cursor',
    session: value.session,
    weekly: value.weekly,
    ...(monthly !== undefined ? { monthly } : {}),
    ...(buckets !== undefined ? { buckets } : {}),
    ...(planType !== undefined ? { planType } : {}),
    updatedAt: value.updatedAt,
    error: value.error,
    status: value.status,
    usageMetadata: { source: 'cli' }
  }
}

export type RemoteCursorUsageFetcher = (
  environmentId: string,
  signal?: AbortSignal
) => Promise<ProviderRateLimits>

export async function fetchCursorUsageForRuntime(options: {
  target: CursorUsageRuntimeTarget
  remoteFetcher?: RemoteCursorUsageFetcher
  signal?: AbortSignal
}): Promise<ProviderRateLimits> {
  if (options.target.runtime === 'host' || options.target.runtime === 'wsl') {
    return fetchCursorRateLimits({ signal: options.signal, target: options.target })
  }
  // Why: a paired runtime environment is the only remaining target that can
  // answer a remote usage probe. An ssh-scoped target has no transport left, so
  // it reports unavailable instead of falling through to local usage.
  if (options.target.runtime === 'environment' && options.remoteFetcher) {
    return options.remoteFetcher(options.target.environmentId, options.signal)
  }
  return {
    provider: 'cursor',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error: 'Cursor usage is unavailable for this runtime environment.',
    status: 'unavailable',
    usageMetadata: { failureKind: 'usage-unavailable', source: 'cli' }
  }
}
