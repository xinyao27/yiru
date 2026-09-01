import {
  LOCAL_EXECUTION_HOST_ID,
  toWslExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import type {
  GitHubPRRefreshAlias,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshReason,
  GitHubPRRefreshSkippedReason,
  PRRefreshOutcome
} from '@yiru/runtime-protocol/workbench/types'

import type { GitHubPRBranchLookupOptions } from './client'

export const POST_PUSH_REFRESH_DELAY_MS = 2500
export const MANUAL_MERGEABILITY_PENDING_REFRESH_MS = 2500
export const MERGEABILITY_PENDING_REFRESH_MS = 10000

const MIN_BACKGROUND_REFRESH_AGE_MS = 60000

type PRBranchLookupCandidate = Pick<
  GitHubPRRefreshCandidate,
  'localGitOptions' | 'linkedPRNumber' | 'fallbackPRNumber' | 'fallbackPRSource' | 'currentHeadOid'
>

export function hostedReviewOptionArgs(
  candidate: PRBranchLookupCandidate
): [] | [GitHubPRBranchLookupOptions] {
  const options: GitHubPRBranchLookupOptions = {}
  if (candidate.localGitOptions?.wslDistro) {
    options.localGitExecOptions = { wslDistro: candidate.localGitOptions.wslDistro }
  }
  if (
    candidate.linkedPRNumber == null &&
    candidate.fallbackPRNumber != null &&
    candidate.fallbackPRSource != null
  ) {
    options.acceptMergedFallbackPR = true
  }
  if (typeof candidate.currentHeadOid === 'string' && candidate.currentHeadOid.trim()) {
    options.currentHeadOid = candidate.currentHeadOid.trim()
  }
  return Object.keys(options).length > 0 ? [options] : []
}

export function prRefreshKey(candidate: GitHubPRRefreshCandidate): string {
  const runtimeScope = candidate.localGitOptions?.wslDistro
    ? toWslExecutionHostId(candidate.localGitOptions.wslDistro)
    : LOCAL_EXECUTION_HOST_ID
  return typeof candidate.linkedPRNumber === 'number'
    ? `local::${runtimeScope}::${candidate.repoPath}::pr::${candidate.linkedPRNumber}`
    : `local::${runtimeScope}::${candidate.repoPath}::branch::${candidate.branch}`
}

export function prRefreshAlias(candidate: GitHubPRRefreshCandidate): GitHubPRRefreshAlias {
  return {
    cacheKey: candidate.cacheKey,
    repoId: candidate.repoId,
    repoPath: candidate.repoPath,
    branch: candidate.branch,
    worktreeId: candidate.worktreeId,
    connectionId: null,
    currentHeadOid: candidate.currentHeadOid ?? null,
    linkedPRNumber: candidate.linkedPRNumber ?? null,
    fallbackPRNumber:
      candidate.linkedPRNumber == null ? (candidate.fallbackPRNumber ?? null) : null,
    fallbackPRSource: candidate.linkedPRNumber == null ? (candidate.fallbackPRSource ?? null) : null
  }
}

export function validatePRRefreshCandidate(
  candidate: GitHubPRRefreshCandidate
): GitHubPRRefreshSkippedReason | null {
  if (candidate.repoKind !== 'git') {
    return 'not-git'
  }
  if (candidate.isBare) {
    return 'bare'
  }
  if (candidate.isArchived) {
    return 'archived'
  }
  return !candidate.branch && typeof candidate.linkedPRNumber !== 'number' ? 'fresh' : null
}

export function shouldSkipFreshPRRefresh(
  candidate: GitHubPRRefreshCandidate,
  reason: GitHubPRRefreshReason
): boolean {
  if (bypassesFreshnessDelay(reason) || candidate.cachedFetchedAt == null) {
    return false
  }
  return Date.now() - candidate.cachedFetchedAt < refreshIntervalForCandidate(candidate)
}

export function freshPRRefreshRetryAt(candidate: GitHubPRRefreshCandidate): number | null {
  return candidate.cachedFetchedAt == null
    ? null
    : candidate.cachedFetchedAt + refreshIntervalForCandidate(candidate)
}

export function shouldBroadcastQueuedPRRefresh(
  reason: GitHubPRRefreshReason,
  dueAt: number
): boolean {
  return !isBudgetedBackgroundReason(reason) && dueAt > Date.now() && dueAt - Date.now() <= 5000
}

export function bypassesFreshnessDelay(reason: GitHubPRRefreshReason): boolean {
  return reason === 'manual' || reason === 'active' || reason === 'post-push'
}

export function isManualPRRefresh(reason: GitHubPRRefreshReason): boolean {
  return reason === 'manual'
}

export function isBudgetedBackgroundReason(reason: GitHubPRRefreshReason): boolean {
  return reason === 'visible' || reason === 'swr'
}

export function visibleCandidateAfterOutcome(
  candidate: GitHubPRRefreshCandidate,
  outcome: PRRefreshOutcome
): GitHubPRRefreshCandidate {
  return outcome.kind === 'upstream-error'
    ? candidate
    : {
        ...candidate,
        cachedFetchedAt: outcome.fetchedAt,
        cachedHasPR: outcome.kind === 'found',
        cachedPRState: outcome.kind === 'found' ? outcome.pr.state : null,
        cachedChecksStatus: outcome.kind === 'found' ? outcome.pr.checksStatus : null,
        cachedMergeable: outcome.kind === 'found' ? outcome.pr.mergeable : null,
        cachedMergeStateStatus:
          outcome.kind === 'found' ? (outcome.pr.mergeStateStatus ?? null) : null
      }
}

export function isMergeabilityPendingOutcome(outcome: PRRefreshOutcome): boolean {
  return (
    outcome.kind === 'found' &&
    outcome.pr.state === 'open' &&
    outcome.pr.mergeable === 'UNKNOWN' &&
    !hasResolvedMergeStateStatus(outcome.pr.mergeStateStatus)
  )
}

function refreshIntervalForCandidate(candidate: GitHubPRRefreshCandidate): number {
  if (candidate.cachedPRState === 'closed' || candidate.cachedPRState === 'merged') {
    return 30 * 60000
  }
  if (candidate.cachedHasPR === false) {
    return 15 * 60000
  }
  if (
    candidate.cachedHasPR === true &&
    candidate.cachedPRState === 'open' &&
    candidate.cachedMergeable === 'UNKNOWN' &&
    !hasResolvedMergeStateStatus(candidate.cachedMergeStateStatus)
  ) {
    return MERGEABILITY_PENDING_REFRESH_MS
  }
  if (candidate.cachedChecksStatus === 'success') {
    return 10 * 60000
  }
  if (candidate.cachedChecksStatus === 'failure') {
    return 3 * 60000
  }
  return candidate.cachedChecksStatus === 'pending' ? 90000 : MIN_BACKGROUND_REFRESH_AGE_MS
}

function hasResolvedMergeStateStatus(status: string | null | undefined): boolean {
  return status === 'CLEAN' || status === 'BEHIND' || status === 'BLOCKED'
}
