import { clearGitStatusLineStatsCache } from '~shared/git/status-line-stats-cache'
import { InFlightPromiseDedupe } from '~shared/in-flight-promise-dedupe'
import type { GitDiffResult, GitStatusResult } from '~shared/types'

import { clearSubmodulePathsCache } from './submodule-paths'
import { clearResolvedUpstreamNameCache } from './upstream-status'

export const gitDiffReadDedupe = new InFlightPromiseDedupe<GitDiffResult>()
export const statusReadsInFlight = new Map<string, Promise<GitStatusResult>>()

export function invalidateGitReadCaches(): void {
  gitDiffReadDedupe.clear()
  statusReadsInFlight.clear()
  clearGitStatusLineStatsCache()
  clearSubmodulePathsCache()
  clearResolvedUpstreamNameCache()
}

export async function runWithGitReadCacheInvalidation<T>(run: () => Promise<T>): Promise<T> {
  invalidateGitReadCaches()
  try {
    return await run()
  } finally {
    // Why: reads started during a mutation can be stale too, so retire both
    // pre-existing and overlapping reads at the post-mutation boundary.
    invalidateGitReadCaches()
  }
}
