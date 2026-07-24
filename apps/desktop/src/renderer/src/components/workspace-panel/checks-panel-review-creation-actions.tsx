import type { HostedReviewProvider } from '@yiru/workbench-model/review'
import { useCallback } from 'react'

import { openWorkspacePanelTab } from '@/lib/open-workspace-panel-tab'
import { refreshHostedReviewCard } from '@/store/slices/hosted-review'

import type { useChecksPanelReviewMutationsState } from './checks-panel-review-mutations'

export function useChecksPanelReviewCreation(context: useChecksPanelReviewMutationsState) {
  const {
    activeConnectionId,
    activeWorktree,
    activeWorktreeId,
    branch,
    fallbackGitHubPRNumber,
    fetchGitLabDetails,
    fetchHostedReviewForBranch,
    fetchUpstreamStatus,
    isPublishingBranch,
    isRemoteOperationActive,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGitLabMR,
    linkedGiteaPR,
    linkedPR,
    ownerSettings,
    pushBranch,
    refreshLinkedGitHubPullRequest,
    repo,
    setGitStatusRefreshNonce,
    setIsPublishingBranch,
    updateWorktreeMeta
  } = context

  const pushBeforeCreatePullRequest = useCallback(async (): Promise<boolean> => {
    if (!activeWorktreeId || !activeWorktree?.path) {
      return false
    }
    const connectionId = activeConnectionId ?? undefined
    try {
      await pushBranch(
        activeWorktreeId,
        activeWorktree.path,
        false,
        connectionId,
        activeWorktree.pushTarget,
        { runtimeTargetSettings: ownerSettings }
      )
      await fetchUpstreamStatus(activeWorktreeId, activeWorktree.path, connectionId, undefined, {
        runtimeTargetSettings: ownerSettings
      })
      return true
    } catch {
      return false
    }
  }, [
    activeConnectionId,
    activeWorktree,
    activeWorktreeId,
    fetchUpstreamStatus,
    ownerSettings,
    pushBranch
  ])

  const handlePublishBranch = useCallback(async (): Promise<void> => {
    if (
      !activeWorktreeId ||
      !activeWorktree?.path ||
      isPublishingBranch ||
      isRemoteOperationActive
    ) {
      return
    }
    const connectionId = activeConnectionId ?? undefined
    setIsPublishingBranch(true)
    try {
      await pushBranch(
        activeWorktreeId,
        activeWorktree.path,
        true,
        connectionId,
        activeWorktree.pushTarget,
        { runtimeTargetSettings: ownerSettings }
      )
      await fetchUpstreamStatus(
        activeWorktreeId,
        activeWorktree.path,
        connectionId,
        activeWorktree.pushTarget,
        { runtimeTargetSettings: ownerSettings }
      )
    } catch {
      // Store remote actions already surface the publish failure toast.
    } finally {
      // Why: publishing changes the upstream boundary the Checks panel uses to
      // decide between Publish, Create PR, and Push & Create PR.
      setGitStatusRefreshNonce((value) => value + 1)
      setIsPublishingBranch(false)
    }
  }, [
    activeWorktree,
    activeWorktreeId,
    activeConnectionId,
    fetchUpstreamStatus,
    isPublishingBranch,
    isRemoteOperationActive,
    ownerSettings,
    pushBranch,
    setGitStatusRefreshNonce,
    setIsPublishingBranch
  ])

  const handlePullRequestCreated = useCallback(
    async (result: {
      provider: HostedReviewProvider
      number: number
      url: string
    }): Promise<void> => {
      if (!repo || !branch) {
        return
      }
      openWorkspacePanelTab({ panel: 'checks', worktreeId: activeWorktreeId })
      try {
        if (activeWorktreeId && result.provider === 'github') {
          await updateWorktreeMeta(activeWorktreeId, { linkedPR: result.number })
        }
        if (activeWorktreeId && result.provider === 'gitlab') {
          await updateWorktreeMeta(activeWorktreeId, { linkedGitLabMR: result.number })
        }
        if (activeWorktreeId && result.provider === 'azure-devops') {
          await updateWorktreeMeta(activeWorktreeId, { linkedAzureDevOpsPR: result.number })
        }
        if (activeWorktreeId && result.provider === 'gitea') {
          await updateWorktreeMeta(activeWorktreeId, { linkedGiteaPR: result.number })
        }
        const linkedReviewNumbers = {
          linkedGitHubPR: result.provider === 'github' ? result.number : linkedPR,
          fallbackGitHubPR: fallbackGitHubPRNumber,
          linkedGitLabMR: result.provider === 'gitlab' ? result.number : linkedGitLabMR,
          linkedBitbucketPR,
          linkedAzureDevOpsPR:
            result.provider === 'azure-devops' ? result.number : linkedAzureDevOpsPR,
          linkedGiteaPR: result.provider === 'gitea' ? result.number : linkedGiteaPR
        }
        if (result.provider === 'gitlab') {
          const refreshedReview = await refreshHostedReviewCard(fetchHostedReviewForBranch, {
            repoPath: repo.path,
            repoId: repo.id,
            branch,
            ...linkedReviewNumbers
          })
          const refreshedGitLabReview =
            refreshedReview?.provider === 'gitlab' ? refreshedReview : null
          await fetchGitLabDetails({
            mrNumberOverride: result.number,
            headShaOverride: refreshedGitLabReview?.headSha,
            commitAsCurrent: true
          })
          return
        }
        if (result.provider !== 'github') {
          await refreshHostedReviewCard(fetchHostedReviewForBranch, {
            repoPath: repo.path,
            repoId: repo.id,
            branch,
            ...linkedReviewNumbers
          })
          return
        }
        await refreshLinkedGitHubPullRequest(result.number)
      } catch {
        // The success toast keeps the hosted URL available; Checks can be refreshed manually.
      }
    },
    [
      branch,
      fallbackGitHubPRNumber,
      fetchGitLabDetails,
      fetchHostedReviewForBranch,
      linkedAzureDevOpsPR,
      linkedBitbucketPR,
      linkedGiteaPR,
      linkedGitLabMR,
      linkedPR,
      refreshLinkedGitHubPullRequest,
      repo,
      activeWorktreeId,
      updateWorktreeMeta
    ]
  )

  return { ...context, pushBeforeCreatePullRequest, handlePublishBranch, handlePullRequestCreated }
}

export type useChecksPanelReviewCreationState = ReturnType<typeof useChecksPanelReviewCreation>
