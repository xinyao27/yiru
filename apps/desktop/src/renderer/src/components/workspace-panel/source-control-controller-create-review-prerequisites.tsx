import type { HostedReviewCreationEligibility } from '@yiru/workbench-model/review'
import { useCallback } from 'react'

import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeGitBranchCompare } from '@/runtime/runtime-git-client'

import { refreshGitStatusForWorktreeStrict } from './git-status-refresh'
import type { SourceControlCreateReviewSubmitController } from './source-control-controller-create-review-submit'
import type { CreatePrIntentRunToken } from './source-control-create-pr-intent-flow'

export function useSourceControlCreateReviewPrerequisites(
  scope: SourceControlCreateReviewSubmitController
) {
  const {
    activeRepo,
    activeRepoSettings,
    beginGitBranchCompareRequest,
    fallbackGitHubPRNumber,
    getCreatePrIntentOperationTarget,
    getHostedReviewCreationEligibility,
    isFolder,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGitHubPR,
    linkedGitLabMR,
    linkedGiteaPR,
    remoteStatus,
    setGitBranchCompareResult,
    setGitStatus,
    setHostedReviewCreationState,
    setUpstreamStatus,
    updateWorktreeGitIdentity
  } = scope
  const refreshBranchCompareForCreatePrIntent = useCallback(
    async (token: CreatePrIntentRunToken): Promise<number | undefined> => {
      const baseRef = token.baseRef?.trim()
      if (!baseRef) {
        return undefined
      }
      const requestKey = `${token.worktreeId}:${baseRef}:${Date.now()}:create-pr-intent`
      beginGitBranchCompareRequest(token.worktreeId, requestKey, baseRef)
      const result = await getRuntimeGitBranchCompare(
        {
          // Why: the intent flow may continue after a worktree switch; use the
          // token's original host target, not whatever branch is focused later.
          settings: activeRepoSettings,
          worktreeId: token.worktreeId,
          worktreePath: token.worktreePath,
          connectionId: getConnectionId(token.worktreeId) ?? undefined
        },
        baseRef
      )
      setGitBranchCompareResult(token.worktreeId, requestKey, result)
      return result.summary.status === 'ready' ? (result.summary.commitsAhead ?? 0) : undefined
    },
    [activeRepoSettings, beginGitBranchCompareRequest, setGitBranchCompareResult]
  )
  const readHostedReviewCreationEligibilityForIntent = useCallback(
    async ({
      token,
      hasUncommittedChanges,
      upstreamStatus
    }: {
      token: CreatePrIntentRunToken
      hasUncommittedChanges: boolean
      upstreamStatus?: NonNullable<typeof remoteStatus>
    }): Promise<HostedReviewCreationEligibility | null> => {
      if (!activeRepo || !token.branch) {
        return null
      }
      const result = await getHostedReviewCreationEligibility({
        repoPath: activeRepo.path,
        repoId: activeRepo.id,
        worktreePath: token.worktreePath,
        branch: token.branch,
        base: token.baseRef ?? null,
        hasUncommittedChanges,
        hasUpstream: upstreamStatus?.hasUpstream,
        ahead: upstreamStatus?.ahead,
        behind: upstreamStatus?.behind,
        linkedGitHubPR,
        fallbackGitHubPR: fallbackGitHubPRNumber,
        linkedGitLabMR,
        linkedBitbucketPR,
        linkedAzureDevOpsPR,
        linkedGiteaPR
      })
      setHostedReviewCreationState({
        repoId: activeRepo.id,
        worktreeId: token.worktreeId,
        branch: token.branch,
        data: result
      })
      return result
    },
    [
      activeRepo,
      fallbackGitHubPRNumber,
      getHostedReviewCreationEligibility,
      linkedAzureDevOpsPR,
      linkedBitbucketPR,
      linkedGiteaPR,
      linkedGitHubPR,
      linkedGitLabMR,
      setHostedReviewCreationState
    ]
  )
  const refreshGitStatusForCreatePrIntent = useCallback(
    async (token: CreatePrIntentRunToken) => {
      if (isFolder) {
        return null
      }
      const target = getCreatePrIntentOperationTarget(token)
      return await refreshGitStatusForWorktreeStrict({
        // Why: Create PR intent can finish in the background after navigation,
        // but branch-safety checks must inspect the worktree that started it.
        settings: target.settings,
        worktreeId: target.worktreeId,
        worktreePath: target.worktreePath,
        connectionId: target.connectionId,
        pushTarget: target.pushTarget,
        deps: {
          setGitStatus,
          updateWorktreeGitIdentity,
          setUpstreamStatus
        }
      })
    },
    [
      getCreatePrIntentOperationTarget,
      isFolder,
      setGitStatus,
      setUpstreamStatus,
      updateWorktreeGitIdentity
    ]
  )
  return {
    ...scope,
    refreshBranchCompareForCreatePrIntent,
    readHostedReviewCreationEligibilityForIntent,
    refreshGitStatusForCreatePrIntent
  }
}

export type SourceControlCreateReviewPrerequisitesController = ReturnType<
  typeof useSourceControlCreateReviewPrerequisites
>
