import type {
  PRMergeableState,
  PRReviewDecision,
  GitHubPRMergeMethod,
  GitHubPRMergeMethodSettings
} from '~shared/types'

import type { HostedReviewExecutionOptions } from '../source-control/hosted-review-git-options'
import type { GitHubRepositoryMergeMetadata } from './client-foundation'
import {
  repositoryMergeMetadataCache,
  pruneRepositoryMergeMetadataCache
} from './client-foundation'
import { gitExecFileAsync } from './github-cli'
import { mapPRState } from './mappers'
import {
  normalizePRMergeable,
  normalizeReviewDecision,
  isAutoMergeEnabled
} from './work-item-mapping'

export type PullRequestLookupData = {
  number: number
  title: string
  state: string
  url: string
  statusCheckRollup: unknown[]
  updatedAt: string
  isDraft?: boolean
  mergeable: string
  reviewDecision?: PRReviewDecision | null
  autoMergeRequest?: unknown
  autoMergeEnabled?: boolean
  autoMergeAllowed?: boolean | null
  mergeQueueRequired?: boolean | null
  mergeMethodSettings?: GitHubPRMergeMethodSettings
  mergeStateStatus?: string | null
  baseRefName?: string
  headRefName?: string
  baseRefOid?: string
  headRefOid?: string
}

export type RestPullRequest = {
  number: number
  title: string
  state: string
  html_url?: string
  url?: string
  updated_at?: string
  draft?: boolean
  merged_at?: string | null
  mergeable?: boolean | null
  mergeable_state?: string | null
  base?: { ref?: string; sha?: string }
  head?: { ref?: string; sha?: string }
}

export const PR_LOOKUP_JSON_FIELDS =
  'number,title,state,url,statusCheckRollup,updatedAt,isDraft,mergeable,reviewDecision,mergeStateStatus,autoMergeRequest,baseRefName,headRefName,baseRefOid,headRefOid'
export const PR_BRANCH_LIST_JSON_FIELDS =
  'number,title,state,url,statusCheckRollup,updatedAt,isDraft,mergeable,baseRefName,headRefName,baseRefOid,headRefOid'
export const PR_AUTO_MERGE_IDENTITY_JSON_FIELDS = 'id,headRefOid,baseRefName'
export const GITHUB_AUTO_MERGE_METHODS: Record<GitHubPRMergeMethod, 'MERGE' | 'SQUASH' | 'REBASE'> =
  {
    merge: 'MERGE',
    squash: 'SQUASH',
    rebase: 'REBASE'
  }

export type GitHubPRBranchLookupOptions = HostedReviewExecutionOptions & {
  acceptMergedFallbackPR?: boolean
  // Why: compare merged implicit PRs against the inspected worktree HEAD, not
  // the main repo HEAD, without adding a worktree-scoped git call.
  currentHeadOid?: string | null
}

export function mapRestPRMergeable(pr: RestPullRequest): PRMergeableState {
  const mergeableState = pr.mergeable_state?.toLowerCase()
  if (mergeableState === 'dirty') {
    return 'CONFLICTING'
  }
  if (mergeableState === 'clean' || pr.mergeable === true) {
    return 'MERGEABLE'
  }
  return 'UNKNOWN'
}

export function derivePullRequestMergeable(data: PullRequestLookupData): PRMergeableState {
  const mergeable = normalizePRMergeable(data.mergeable)
  if (mergeable === 'CONFLICTING' || data.mergeStateStatus === 'DIRTY') {
    return 'CONFLICTING'
  }
  return mergeable ?? 'UNKNOWN'
}

export function mapRestPullRequest(pr: RestPullRequest): PullRequestLookupData {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? 'MERGED' : pr.state,
    url: pr.html_url ?? pr.url ?? '',
    statusCheckRollup: [],
    updatedAt: pr.updated_at ?? '',
    isDraft: pr.draft,
    mergeable: mapRestPRMergeable(pr),
    baseRefName: pr.base?.ref,
    headRefName: pr.head?.ref,
    baseRefOid: pr.base?.sha,
    headRefOid: pr.head?.sha
  }
}

export function isMergedImplicitPR(
  data: PullRequestLookupData,
  linkedPRNumber?: number | null
): boolean {
  // Why: merged PRs are historical branch matches unless the worktree has an
  // explicit PR link. Showing them as implicit review context leaves nothing
  // meaningful to unlink after the branch has been rebased or merged.
  return typeof linkedPRNumber !== 'number' && mapPRState(data.state, data.isDraft) === 'merged'
}

export async function getCurrentHeadOid(
  repoPath: string,
  localGitOptions: { wslDistro?: string } = {}
): Promise<string | null> {
  try {
    const result = await gitExecFileAsync(['rev-parse', 'HEAD'], {
      cwd: repoPath,
      ...(localGitOptions.wslDistro ? { wslDistro: localGitOptions.wslDistro } : {})
    })
    return result.stdout.trim() || null
  } catch {
    return null
  }
}

export function shouldHideMergedImplicitPR(
  data: PullRequestLookupData | null,
  linkedPRNumber: number | null | undefined,
  currentHeadOid: string | null
): boolean {
  if (!data || !isMergedImplicitPR(data, linkedPRNumber)) {
    return false
  }
  // Why: keep hiding historical merged branch matches, but preserve the merged
  // PR for the exact commit currently checked out in the sidebar.
  return !currentHeadOid || data.headRefOid !== currentHeadOid
}

export function normalizePullRequestLookupData(data: PullRequestLookupData): PullRequestLookupData {
  return {
    ...data,
    reviewDecision:
      data.reviewDecision !== undefined ? normalizeReviewDecision(data.reviewDecision) : undefined,
    autoMergeEnabled:
      data.autoMergeEnabled ??
      ('autoMergeRequest' in data ? isAutoMergeEnabled(data.autoMergeRequest) : undefined)
  }
}

export function cacheRepositoryMergeMetadata(
  cacheKey: string,
  value: GitHubRepositoryMergeMetadata,
  ttlMs: number
): void {
  const now = Date.now()
  pruneRepositoryMergeMetadataCache(now)
  // Why: merge metadata is keyed by user-controlled branch names. Keep the
  // per-session cache bounded even if many short-lived branches are inspected.
  repositoryMergeMetadataCache.delete(cacheKey)
  repositoryMergeMetadataCache.set(cacheKey, {
    value,
    expiresAt: now + ttlMs
  })
  pruneRepositoryMergeMetadataCache(now)
}
