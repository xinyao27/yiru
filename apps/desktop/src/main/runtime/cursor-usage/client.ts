import type { ProviderRateLimits } from '~shared/rate-limit-types'

import { fetchCursorRateLimits } from './fetcher'
import type { CursorUsageRuntimeTarget } from './target'

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
  // answer a remote usage probe; without a remote fetcher it reports
  // unavailable instead of falling through to local usage.
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
