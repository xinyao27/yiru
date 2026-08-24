import { YIRU_GITHUB_REPOSITORY_SLUG } from '@yiru/workbench-model/product'
import type { PRRefreshOutcome, GitHubPRMergeMethodSettings } from '~shared/types'

import {
  hasHostedReviewLocalGitOptions,
  getHostedReviewLocalGitOptions,
  type HostedReviewExecutionOptions
} from '../source-control/hosted-review-git-options'
import type { ghRepoExecOptions } from './github-cli'
import { getRateLimit, rateLimitGuard, type RateLimitBucketKind } from './rate-limit'

export type GhExecOptions = ReturnType<typeof ghRepoExecOptions> & { signal?: AbortSignal }
export type HostedReviewLocalGitOptions = ReturnType<typeof getHostedReviewLocalGitOptions>

export const YIRU_REPO = YIRU_GITHUB_REPOSITORY_SLUG
export const PR_CHECK_LOG_TAIL_JOB_LIMIT = 5
// Why: each entry holds up to 16KB of log text; bound the cache so a long
// session reviewing many failing checks can't grow it without limit.
export const PR_CHECK_LOG_TAIL_CACHE_MAX_ENTRIES = 128
export const prCheckLogTailCache = new Map<string, string | null>()

export function hostedReviewLocalGitOptionArgs(
  options: HostedReviewExecutionOptions = {}
): [] | [HostedReviewLocalGitOptions] {
  return hasHostedReviewLocalGitOptions(options) ? [getHostedReviewLocalGitOptions(options)] : []
}

export function setPrCheckLogTailCache(cacheKey: string, logTail: string | null): void {
  prCheckLogTailCache.set(cacheKey, logTail)
  while (prCheckLogTailCache.size > PR_CHECK_LOG_TAIL_CACHE_MAX_ENTRIES) {
    const oldestKey = prCheckLogTailCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    prCheckLogTailCache.delete(oldestKey)
  }
}
export const MERGE_QUEUE_CACHE_TTL_MS = 10 * 60 * 1000
export const MERGE_QUEUE_UNKNOWN_CACHE_TTL_MS = 60 * 1000
export const MERGE_QUEUE_CACHE_MAX_ENTRIES = 256
export type GitHubRepositoryMergeMetadata = {
  mergeQueueRequired: boolean | null
  autoMergeAllowed: boolean | null
  mergeMethodSettings?: GitHubPRMergeMethodSettings
}
export const repositoryMergeMetadataCache = new Map<
  string,
  { value: GitHubRepositoryMergeMetadata; expiresAt: number }
>()

export function pruneRepositoryMergeMetadataCache(now = Date.now()): void {
  for (const [cacheKey, cached] of repositoryMergeMetadataCache) {
    if (cached.expiresAt <= now) {
      repositoryMergeMetadataCache.delete(cacheKey)
    }
  }
  while (repositoryMergeMetadataCache.size > MERGE_QUEUE_CACHE_MAX_ENTRIES) {
    const oldestKey = repositoryMergeMetadataCache.keys().next().value
    if (oldestKey === undefined) {
      break
    }
    repositoryMergeMetadataCache.delete(oldestKey)
  }
}

export async function assertRateLimitBudget(bucket: RateLimitBucketKind): Promise<void> {
  await getRateLimit()
  const guard = rateLimitGuard(bucket)
  if (guard.blocked) {
    throw new Error(
      `GitHub ${bucket} rate limit is low; retry after ${new Date(guard.resetAt * 1000).toLocaleTimeString()}`
    )
  }
}

export function classifyPRRefreshError(
  err: unknown
): Extract<PRRefreshOutcome, { kind: 'upstream-error' }>['errorType'] {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()
  if (lower.includes('rate limit')) {
    return 'rate_limited'
  }
  if (
    lower.includes('timeout') ||
    lower.includes('no such host') ||
    lower.includes('network') ||
    lower.includes('could not resolve host')
  ) {
    return 'network'
  }
  if (lower.includes('http 403') || lower.includes('resource not accessible')) {
    return 'permission'
  }
  if (lower.includes('http 404') || lower.includes('could not resolve to a repository')) {
    return 'repo_unavailable'
  }
  return /auth|login|credential/i.test(message) ? 'auth' : 'unknown'
}

export function safePRRefreshErrorMessage(
  errorType: Extract<PRRefreshOutcome, { kind: 'upstream-error' }>['errorType']
): string {
  switch (errorType) {
    case 'rate_limited':
      return 'GitHub rate limit is low. Try again after the limit resets.'
    case 'auth':
      return 'GitHub authentication is unavailable. Check your gh login.'
    case 'network':
      return 'GitHub is unreachable right now. Check your network and try again.'
    case 'permission':
      return 'GitHub did not allow access to this pull request.'
    case 'repo_unavailable':
      return 'The GitHub repository is unavailable or cannot be resolved.'
    case 'gh_unavailable':
      return 'GitHub CLI is unavailable.'
    case 'unknown':
      return 'GitHub pull request refresh failed.'
  }
}

export function prRefreshUpstreamError(
  err: unknown
): Extract<PRRefreshOutcome, { kind: 'upstream-error' }> {
  const errorType = classifyPRRefreshError(err)
  return {
    kind: 'upstream-error',
    errorType,
    message: safePRRefreshErrorMessage(errorType),
    fetchedAt: Date.now()
  }
}

export function isNoPullRequestError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /no pull requests? found|could not find.*pull request/i.test(message)
}

/**
 * Check if the authenticated user has starred the Yiru repo.
 * Returns true if starred, false if not, null if unable to determine (gh unavailable).
 */
