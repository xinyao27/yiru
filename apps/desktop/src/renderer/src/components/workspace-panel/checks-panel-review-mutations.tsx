import React, { useCallback } from 'react'

import { refreshHostedReviewCard } from '@/store/slices/hosted-review'

import { isMacPlatform } from '../terminal-pane/terminal-link-open-hints'
import type { useChecksPanelAgentActionsState } from './checks-panel-agent-actions'
import { checksPanelAsyncResultKey } from './checks-panel-async-result-key'
import { openChecksPanelHostedReviewUrl } from './checks-panel-hosted-review-click-routing'

export function useChecksPanelReviewMutations(context: useChecksPanelAgentActionsState) {
  const {
    activeReview,
    activeWorktree,
    activeWorktreeId,
    asyncResultKeyRef,
    branch,
    fetchHostedReviewForBranch,
    fetchPRChecks,
    fetchPRComments,
    fetchPRForBranch,
    isCurrentAsyncResult,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGitLabMR,
    linkedGiteaPR,
    linkedPR,
    openModal,
    panelContextKey,
    panelContextKeyRef,
    prCacheKey,
    repo,
    setChecks,
    setChecksLoading,
    setComments,
    setCommentsLoading,
    updateWorktreeMeta
  } = context

  const refreshLinkedGitHubPullRequest = useCallback(
    async (linkedPRNumber: number): Promise<void> => {
      if (!repo || !branch) {
        return
      }
      const requestContextKey = panelContextKey
      const isCurrentRequestContext = (): boolean =>
        panelContextKeyRef.current === requestContextKey
      if (!isCurrentRequestContext()) {
        return
      }
      setChecks([])
      setComments([])
      setChecksLoading(true)
      setCommentsLoading(true)
      let requestKey: string | null = null
      try {
        const refreshedPR = await fetchPRForBranch(repo.path, branch, {
          force: true,
          repoId: repo.id,
          worktreeId: activeWorktreeId ?? undefined,
          linkedPRNumber
        })
        if (!isCurrentRequestContext()) {
          return
        }
        await refreshHostedReviewCard(fetchHostedReviewForBranch, {
          repoPath: repo.path,
          repoId: repo.id,
          branch,
          linkedGitHubPR: linkedPRNumber,
          linkedGitLabMR,
          linkedBitbucketPR,
          linkedAzureDevOpsPR,
          linkedGiteaPR
        })
        if (!isCurrentRequestContext()) {
          return
        }
        if (!refreshedPR) {
          return
        }
        const refreshedRequestKey = checksPanelAsyncResultKey(
          prCacheKey,
          branch,
          refreshedPR.number,
          refreshedPR.prRepo,
          refreshedPR.headSha
        )
        requestKey = refreshedRequestKey
        if (!isCurrentRequestContext()) {
          return
        }
        asyncResultKeyRef.current = refreshedRequestKey
        await Promise.all([
          fetchPRChecks(
            repo.path,
            refreshedPR.number,
            branch,
            refreshedPR.headSha,
            refreshedPR.prRepo,
            {
              force: true,
              repoId: repo.id
            }
          )
            .then(
              (result) => {
                if (isCurrentAsyncResult(refreshedRequestKey)) {
                  setChecks(result)
                }
              },
              (err) => {
                if (!isCurrentAsyncResult(refreshedRequestKey)) {
                  return
                }
                console.warn('Failed to fetch PR checks:', err)
                setChecks([])
              }
            )
            .finally(() => {
              if (isCurrentAsyncResult(refreshedRequestKey)) {
                setChecksLoading(false)
              }
            }),
          fetchPRComments(repo.path, refreshedPR.number, {
            force: true,
            repoId: repo.id,
            prRepo: refreshedPR.prRepo
          })
            .then(
              (result) => {
                if (isCurrentAsyncResult(refreshedRequestKey)) {
                  setComments(result)
                }
              },
              (err) => {
                if (!isCurrentAsyncResult(refreshedRequestKey)) {
                  return
                }
                console.warn('Failed to fetch PR comments:', err)
                setComments([])
              }
            )
            .finally(() => {
              if (isCurrentAsyncResult(refreshedRequestKey)) {
                setCommentsLoading(false)
              }
            })
        ])
      } catch (err) {
        if (
          isCurrentRequestContext() &&
          (requestKey === null || isCurrentAsyncResult(requestKey))
        ) {
          console.warn('Failed to refresh linked GitHub PR:', err)
          setChecks([])
          setComments([])
        }
      } finally {
        if (requestKey === null && isCurrentRequestContext()) {
          setChecksLoading(false)
          setCommentsLoading(false)
        }
        if (requestKey !== null && isCurrentAsyncResult(requestKey)) {
          setChecksLoading(false)
          setCommentsLoading(false)
        }
      }
    },
    [
      activeWorktreeId,
      branch,
      fetchHostedReviewForBranch,
      fetchPRChecks,
      fetchPRComments,
      fetchPRForBranch,
      isCurrentAsyncResult,
      linkedAzureDevOpsPR,
      linkedBitbucketPR,
      linkedGiteaPR,
      linkedGitLabMR,
      panelContextKey,
      prCacheKey,
      repo,
      setChecksLoading,
      setCommentsLoading,
      setChecks,
      setComments,
      asyncResultKeyRef,
      panelContextKeyRef
    ]
  )

  // Open hosted review in browser
  const handleOpenPR = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (activeReview?.url) {
        // Why: route through openHttpLink so PR/MR links honor the "open links
        // in app" setting; Shift+Cmd/Ctrl keeps the terminal-link escape hatch.
        openChecksPanelHostedReviewUrl({
          url: activeReview.url,
          event: event.nativeEvent,
          isMac: isMacPlatform(),
          worktreeId: activeWorktreeId
        })
      }
    },
    [activeReview, activeWorktreeId]
  )

  const handleUnlinkPullRequest = useCallback(() => {
    if (!activeWorktreeId || activeReview?.provider !== 'github' || linkedPR === null) {
      return
    }
    void updateWorktreeMeta(activeWorktreeId, { linkedPR: null })
  }, [activeReview?.provider, activeWorktreeId, linkedPR, updateWorktreeMeta])

  const handleLinkAnotherPullRequest = useCallback(() => {
    if (!activeWorktreeId || !activeWorktree || activeReview?.provider !== 'github') {
      return
    }
    openModal('edit-meta', {
      worktreeId: activeWorktreeId,
      currentDisplayName: activeWorktree.displayName,
      currentPR: activeWorktree.linkedPR ?? activeReview.number,
      currentComment: activeWorktree.comment,
      focus: 'pr',
      afterSave: ({ updates }: { updates?: { linkedPR?: unknown } }) => {
        const nextLinkedPR = updates?.linkedPR
        if (typeof nextLinkedPR === 'number') {
          void refreshLinkedGitHubPullRequest(nextLinkedPR)
        }
      }
    })
  }, [activeReview, activeWorktree, activeWorktreeId, openModal, refreshLinkedGitHubPullRequest])

  return {
    ...context,
    refreshLinkedGitHubPullRequest,
    handleOpenPR,
    handleUnlinkPullRequest,
    handleLinkAnotherPullRequest
  }
}

export type useChecksPanelReviewMutationsState = ReturnType<typeof useChecksPanelReviewMutations>
