import type { PRRefreshOutcome } from '~shared/types'

import {
  lookupPRByBranchName,
  lookupPRByNumber,
  ownerRepoFromPullRequestUrl
} from './branch-lookup'
import type { PullRequestLookupData, GitHubPRBranchLookupOptions } from './branch-metadata'
import {
  derivePullRequestMergeable,
  isMergedImplicitPR,
  getCurrentHeadOid,
  shouldHideMergedImplicitPR
} from './branch-metadata'
import { shouldRetryTrackedUpstreamBranch, getTrackedUpstreamBranch } from './branch-upstream'
import type { GhExecOptions } from './client-foundation'
import { hostedReviewLocalGitOptionArgs, prRefreshUpstreamError } from './client-foundation'
import { getPRConflictSummary } from './conflict-summary'
import {
  acquire,
  release,
  ghRepoExecOptions,
  getOwnerRepoForRemote,
  resolvePRRepositoryCandidates,
  githubRepoContext,
  type OwnerRepo
} from './github-cli'
import { mapPRState, deriveCheckStatus } from './mappers'
import {
  isCommitPartOfMergedPR,
  type MergedPRCommitMembership
} from './merged-pr-commit-membership'

export async function getPRForBranchOutcome(
  repoPath: string,
  branch: string,
  linkedPRNumber?: number | null,
  connectionId?: string | null,
  fallbackPRNumber?: number | null,
  options: GitHubPRBranchLookupOptions = {}
): Promise<PRRefreshOutcome> {
  // Strip refs/heads/ prefix if present
  const branchName = branch.replace(/^refs\/heads\//, '')
  // Why: detached HEAD cannot use branch lookup, but an exact linked/fallback
  // PR number remains safe to query and keeps review state visible.
  if (!branchName && typeof linkedPRNumber !== 'number' && typeof fallbackPRNumber !== 'number') {
    return { kind: 'no-pr', fetchedAt: Date.now() }
  }
  const localGitArgs = hostedReviewLocalGitOptionArgs(options)
  const localGitOptions = localGitArgs[0] ?? {}
  const context = githubRepoContext(repoPath, connectionId, localGitOptions)
  const ghOptions: GhExecOptions = {
    ...ghRepoExecOptions(context),
    ...(options.signal ? { signal: options.signal } : {})
  }

  options.signal?.throwIfAborted()
  await acquire()
  try {
    options.signal?.throwIfAborted()
    const { candidates, headRepo } = await resolvePRRepositoryCandidates(
      repoPath,
      connectionId,
      ...localGitArgs
    )
    let data: PullRequestLookupData | null = null
    let dataRepo: OwnerRepo | null = null
    let dataHeadRepo: OwnerRepo | null = headRepo
    let pendingBranchLookupError: unknown
    let hasPendingBranchLookupError = false
    let currentHeadOidForMergedImplicit: string | null | undefined

    const explicitCurrentHeadOid =
      typeof options.currentHeadOid === 'string' && options.currentHeadOid.trim().length > 0
        ? options.currentHeadOid.trim()
        : null
    let confirmedContainedHeadOid: string | null = null
    let headDivergedFromMergedPRAtOid: string | null = null
    const mergedPRContainsHead = async (
      candidate: PullRequestLookupData,
      candidateRepo: OwnerRepo | null,
      headOid: string | null
    ): Promise<MergedPRCommitMembership> => {
      if (!candidateRepo || !headOid) {
        return 'unknown'
      }
      const membership = await isCommitPartOfMergedPR({
        ownerRepo: candidateRepo,
        prNumber: candidate.number,
        commitOid: headOid,
        ghOptions
      })
      if (membership === 'contained') {
        confirmedContainedHeadOid = headOid
      }
      return membership
    }
    const recordLinkedMergedPRDivergence = async (
      candidate: PullRequestLookupData | null,
      candidateRepo: OwnerRepo | null
    ): Promise<void> => {
      if (
        typeof linkedPRNumber !== 'number' ||
        !candidate ||
        mapPRState(candidate.state, candidate.isDraft) !== 'merged' ||
        explicitCurrentHeadOid === null ||
        candidate.headRefOid === explicitCurrentHeadOid
      ) {
        return
      }
      const membership = await mergedPRContainsHead(
        candidate,
        candidateRepo ?? ownerRepoFromPullRequestUrl(candidate.url),
        explicitCurrentHeadOid
      )
      if (membership === 'not-contained') {
        // explicitCurrentHeadOid is non-null here (guarded above); record the
        // exact head so consumers only clear the worktree that actually diverged.
        headDivergedFromMergedPRAtOid = explicitCurrentHeadOid
      }
    }
    const hideMergedImplicitPR = async (
      candidate: PullRequestLookupData | null,
      candidateRepo: OwnerRepo | null
    ) => {
      if (!candidate || !isMergedImplicitPR(candidate, linkedPRNumber)) {
        return false
      }
      // Why: prefer the caller-supplied worktree HEAD; only shell out (against
      // the main repo path) when no explicit oid is available, matching legacy
      // behavior. This keeps merged-at-head PRs visible for secondary worktrees.
      currentHeadOidForMergedImplicit ??=
        explicitCurrentHeadOid !== null
          ? explicitCurrentHeadOid
          : await getCurrentHeadOid(repoPath, localGitOptions)
      if (!shouldHideMergedImplicitPR(candidate, linkedPRNumber, currentHeadOidForMergedImplicit)) {
        return false
      }
      // Why: a worktree can sit behind its own PR's final head (update-branch
      // merges, web-committed suggestions). A head that is one of the PR's own
      // commits is the same line of work, not a reused branch name — keep the
      // merged PR visible instead of offering "create a pull request".
      return (
        (await mergedPRContainsHead(candidate, candidateRepo, currentHeadOidForMergedImplicit)) !==
        'contained'
      )
    }

    if (typeof linkedPRNumber === 'number') {
      const exactLookup = await lookupPRByNumber({
        candidates,
        number: linkedPRNumber,
        ghOptions
      })
      data = exactLookup.data
      dataRepo = exactLookup.dataRepo
    } else if (branchName) {
      // During a rebase the worktree is in detached HEAD and branch is empty.
      // An empty --head filter causes gh to return an arbitrary PR.
      const branchLookup = await lookupPRByBranchName({
        candidates,
        headRepo,
        branchName,
        ghOptions
      })
      data = branchLookup.data
      dataRepo = branchLookup.dataRepo
      if ('pendingError' in branchLookup) {
        pendingBranchLookupError = branchLookup.pendingError
        hasPendingBranchLookupError = true
      }
      if (!data) {
        // Why: the tracked upstream can identify the real PR head by branch
        // name or by fork owner even when branch names match locally.
        const upstreamBranch = await getTrackedUpstreamBranch(
          repoPath,
          branchName,
          connectionId,
          localGitOptions
        )
        if (upstreamBranch) {
          const upstreamHeadRepo =
            (await getOwnerRepoForRemote(
              repoPath,
              upstreamBranch.remoteName,
              connectionId,
              ...localGitArgs
            )) ?? headRepo
          if (
            upstreamHeadRepo &&
            shouldRetryTrackedUpstreamBranch(upstreamBranch, branchName, upstreamHeadRepo, headRepo)
          ) {
            const upstreamLookup = await lookupPRByBranchName({
              candidates,
              headRepo: upstreamHeadRepo,
              branchName: upstreamBranch.branchName,
              ghOptions
            })
            data = upstreamLookup.data
            dataRepo = upstreamLookup.dataRepo
            if (!hasPendingBranchLookupError && 'pendingError' in upstreamLookup) {
              pendingBranchLookupError = upstreamLookup.pendingError
              hasPendingBranchLookupError = true
            }
            if (data) {
              dataHeadRepo = upstreamHeadRepo
            }
          }
        }
      }
    }
    let mergedBranchLookupNumber: number | null = null
    if (await hideMergedImplicitPR(data, dataRepo)) {
      mergedBranchLookupNumber = data?.number ?? null
      data = null
      dataRepo = null
      dataHeadRepo = headRepo
    }
    if (!data && typeof linkedPRNumber !== 'number' && typeof fallbackPRNumber === 'number') {
      const fallbackLookup = await lookupPRByNumber({
        candidates,
        number: fallbackPRNumber,
        ghOptions
      })
      data = fallbackLookup.data
      dataRepo = fallbackLookup.dataRepo
    }
    if (!data) {
      if (hasPendingBranchLookupError) {
        return prRefreshUpstreamError(pendingBranchLookupError)
      }
      return { kind: 'no-pr', fetchedAt: Date.now() }
    }
    await recordLinkedMergedPRDivergence(data, dataRepo)
    const fallbackConfirmedMergedBranch =
      typeof fallbackPRNumber === 'number' &&
      mergedBranchLookupNumber === fallbackPRNumber &&
      data.number === fallbackPRNumber
    const explicitHeadHidesMergedImplicitPR =
      explicitCurrentHeadOid !== null &&
      shouldHideMergedImplicitPR(data, linkedPRNumber, explicitCurrentHeadOid) &&
      (await mergedPRContainsHead(data, dataRepo, explicitCurrentHeadOid)) !== 'contained'
    // Why no lazy-HEAD re-check on preservation: fallback numbers come from
    // callers that already gated them on head equality or confirmed
    // containment; re-hiding against the main-repo HEAD would blank
    // deleted-head merged PRs that are deliberately kept visible.
    const shouldPreserveMergedFallback =
      !explicitHeadHidesMergedImplicitPR &&
      (fallbackConfirmedMergedBranch || options.acceptMergedFallbackPR === true)
    // Why: a currently visible PR can be merged outside Yiru; when the caller
    // marks the fallback as visible review state, keep its lifecycle fresh even
    // if GitHub no longer reports it by branch (for example deleted heads).
    if ((await hideMergedImplicitPR(data, dataRepo)) && !shouldPreserveMergedFallback) {
      return { kind: 'no-pr', fetchedAt: Date.now() }
    }

    const mergeable = derivePullRequestMergeable(data)
    const conflictSummary =
      !connectionId &&
      mergeable === 'CONFLICTING' &&
      data.baseRefName &&
      data.baseRefOid &&
      data.headRefOid
        ? await getPRConflictSummary(
            repoPath,
            data.baseRefName,
            data.baseRefOid,
            data.headRefOid,
            localGitOptions
          )
        : undefined

    return {
      kind: 'found',
      fetchedAt: Date.now(),
      pr: {
        number: data.number,
        title: data.title,
        state: mapPRState(data.state, data.isDraft),
        url: data.url,
        checksStatus: deriveCheckStatus(data.statusCheckRollup),
        updatedAt: data.updatedAt,
        mergeable,
        ...(data.reviewDecision !== undefined ? { reviewDecision: data.reviewDecision } : {}),
        ...(data.autoMergeEnabled !== undefined ? { autoMergeEnabled: data.autoMergeEnabled } : {}),
        ...(data.autoMergeAllowed !== undefined ? { autoMergeAllowed: data.autoMergeAllowed } : {}),
        ...(data.mergeQueueRequired !== undefined
          ? { mergeQueueRequired: data.mergeQueueRequired }
          : {}),
        ...(data.mergeMethodSettings !== undefined
          ? { mergeMethodSettings: data.mergeMethodSettings }
          : {}),
        ...(data.mergeStateStatus !== undefined ? { mergeStateStatus: data.mergeStateStatus } : {}),
        headSha: data.headRefOid,
        ...(confirmedContainedHeadOid ? { confirmedContainedHeadOid } : {}),
        ...(headDivergedFromMergedPRAtOid ? { headDivergedFromMergedPRAtOid } : {}),
        ...(data.baseRefName ? { baseRefName: data.baseRefName } : {}),
        ...(data.headRefName ? { headRefName: data.headRefName } : {}),
        prRepo: dataRepo ?? undefined,
        headRepo: dataHeadRepo ?? undefined,
        conflictSummary
      }
    }
  } catch (err) {
    return prRefreshUpstreamError(err)
  } finally {
    release()
  }
}
