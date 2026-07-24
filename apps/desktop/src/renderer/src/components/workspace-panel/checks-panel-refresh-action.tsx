import { useCallback } from 'react'

import { getRuntimeGitStatus, getRuntimeGitUpstreamStatus } from '@/runtime/runtime-git-client'
import { useAppStore } from '@/store'
import { buildGitHubPRRefreshStateClearToken } from '@/store/slices/github'
import { refreshHostedReviewCard } from '@/store/slices/hosted-review'

import type { PRInfo } from '../../../../shared/types'
import { checksPanelAsyncResultKey } from './checks-panel-async-result-key'
import type { useChecksPanelCommentsLoadingState } from './checks-panel-comments-loading'
import {
  readChecksPanelRefreshGitIdentitySnapshot,
  hasChecksPanelGitStatusBranchChanged,
  shouldCommitChecksPanelGitStatusSnapshot
} from './checks-panel-git-status-snapshot'
import { recordChecksPanelPRRefreshBreadcrumb } from './checks-panel-pr-refresh-breadcrumb'

export function useChecksPanelRefreshAction(context: useChecksPanelCommentsLoadingState) {
  const {
    activeConnectionId,
    activeGitLabReview,
    activeWorktreeId,
    activeWorktreePath,
    activeWorktreePushTarget,
    asyncResultKeyRef,
    branch,
    expireGitHubPRRefreshState,
    fallbackGitHubPRNumber,
    fetchGitLabDetails,
    fetchHostedReviewForBranch,
    fetchPRChecks,
    fetchPRComments,
    fetchPRForBranch,
    gitStatusSnapshot,
    isCurrentAsyncResult,
    isFolder,
    isGitLabReviewContext,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGitLabMR,
    linkedGiteaPR,
    linkedPR,
    ownerSettings,
    panelContextKey,
    panelContextKeyRef,
    pollIntervalRef,
    pr,
    prCacheKey,
    prNumber,
    prevChecksRef,
    refreshInFlightRef,
    refreshRequestKeyRef,
    repo,
    setChecks,
    setChecksLoading,
    setComments,
    setCommentsLoading,
    setGitStatusSnapshot,
    setIsRefreshing,
    updateWorktreeGitIdentity
  } = context

  const handleRefresh = useCallback(async () => {
    if (!repo || !branch) {
      return
    }
    if (refreshInFlightRef.current) {
      return
    }
    // Why: React has not disabled the button until the next render, so a rapid
    // double-click must not start duplicate git status/upstream subprocesses.
    refreshInFlightRef.current = true
    const initialRequestKey = checksPanelAsyncResultKey(
      prCacheKey,
      branch,
      prNumber,
      pr?.prRepo,
      pr?.headSha
    )
    const refreshRequestKey = `${activeWorktreeId ?? ''}::${prCacheKey}::${branch}::${Date.now()}::${Math.random()}`
    refreshRequestKeyRef.current = refreshRequestKey
    const isCurrentRequest = (): boolean => refreshRequestKeyRef.current === refreshRequestKey
    const refreshStartedAt = Date.now()
    const refreshProvider = isGitLabReviewContext ? 'gitlab' : 'github'
    let refreshOutcome = 'started'
    setIsRefreshing(true)
    recordChecksPanelPRRefreshBreadcrumb({
      event: 'start',
      provider: refreshProvider,
      repoId: repo.id,
      worktreeId: activeWorktreeId,
      branch,
      prCacheKey,
      prNumber: activeGitLabReview?.number ?? prNumber,
      prState: activeGitLabReview?.state ?? pr?.state,
      prChecksStatus: pr?.checksStatus,
      refreshState: prCacheKey ? useAppStore.getState().prRefreshStates[prCacheKey] : null
    })
    try {
      if (activeWorktreeId && activeWorktreePath && !isFolder) {
        const snapshotIdentity = readChecksPanelRefreshGitIdentitySnapshot({
          snapshot: gitStatusSnapshot,
          contextKey: panelContextKey,
          currentBranch: branch
        })
        if (snapshotIdentity.kind === 'changed') {
          updateWorktreeGitIdentity(activeWorktreeId, {
            head: snapshotIdentity.head,
            branch: snapshotIdentity.branch
          })
          // Why: this click discovered a terminal branch switch. Let the
          // branch-keyed render/effects restart instead of refreshing old PR data.
          refreshOutcome = 'branch-changed'
          return
        }
        try {
          const statusContext = {
            settings: ownerSettings,
            worktreeId: activeWorktreeId,
            worktreePath: activeWorktreePath,
            connectionId: activeConnectionId ?? undefined
          }
          const status = await getRuntimeGitStatus(statusContext)
          const observedBranch = status.branch ?? (status.head ? null : undefined)
          updateWorktreeGitIdentity(activeWorktreeId, {
            head: status.head,
            branch: observedBranch
          })
          if (
            observedBranch !== undefined &&
            hasChecksPanelGitStatusBranchChanged({
              observedBranch,
              currentBranch: branch
            })
          ) {
            // Why: this click discovered a terminal branch switch. Let the
            // branch-keyed render/effects restart instead of refreshing old PR data.
            refreshOutcome = 'branch-changed'
            return
          }
          let freshRemoteStatus = status.upstreamStatus
          if (activeWorktreePushTarget) {
            freshRemoteStatus = await getRuntimeGitUpstreamStatus(
              statusContext,
              activeWorktreePushTarget
            )
          } else if (
            !freshRemoteStatus ||
            (freshRemoteStatus.ahead > 0 &&
              freshRemoteStatus.behind > 0 &&
              freshRemoteStatus.behindCommitsArePatchEquivalent === undefined)
          ) {
            freshRemoteStatus = await getRuntimeGitUpstreamStatus(statusContext)
          }
          if (
            isCurrentRequest() &&
            shouldCommitChecksPanelGitStatusSnapshot(panelContextKeyRef.current, panelContextKey)
          ) {
            // Why: the explicit Refresh click already paid for this status read;
            // commit it so empty-state Publish/Create eligibility is fresh.
            setGitStatusSnapshot({
              contextKey: panelContextKey,
              hasUncommittedChanges: status.entries.length > 0,
              remoteStatus: freshRemoteStatus,
              gitIdentity: {
                head: status.head,
                branch: observedBranch
              }
            })
          }
        } catch (error) {
          console.warn('[ChecksPanel] pre-refresh git identity refresh failed', error)
        }
      }
      if (isGitLabReviewContext) {
        const refreshedReview = await refreshHostedReviewCard(fetchHostedReviewForBranch, {
          repoPath: repo.path,
          repoId: repo.id,
          branch,
          linkedGitHubPR: linkedPR,
          fallbackGitHubPR: fallbackGitHubPRNumber,
          linkedGitLabMR,
          linkedBitbucketPR,
          linkedAzureDevOpsPR,
          linkedGiteaPR
        })
        if (!isCurrentRequest()) {
          return
        }
        const refreshedGitLabReview =
          refreshedReview?.provider === 'gitlab' ? refreshedReview : activeGitLabReview
        if (refreshedGitLabReview) {
          await fetchGitLabDetails({
            mrNumberOverride: refreshedGitLabReview.number,
            headShaOverride: refreshedGitLabReview.headSha,
            commitAsCurrent: true
          })
          refreshOutcome = 'review'
        } else {
          setChecks([])
          setComments([])
          refreshOutcome = 'no-review'
        }
        return
      }
      const refreshStoreState = useAppStore.getState()
      const rawPRRefreshState = refreshStoreState.prRefreshStates[prCacheKey]
      const startedPRRefreshToken = buildGitHubPRRefreshStateClearToken(
        rawPRRefreshState,
        refreshStoreState.prRefreshSequences,
        prCacheKey
      )
      let refreshedPR: PRInfo | null = null
      try {
        refreshedPR = await fetchPRForBranch(repo.path, branch, {
          force: true,
          repoId: repo.id,
          worktreeId: activeWorktreeId ?? undefined,
          linkedPRNumber: linkedPR,
          fallbackPRNumber: fallbackGitHubPRNumber
        })
      } finally {
        if (startedPRRefreshToken) {
          expireGitHubPRRefreshState(prCacheKey, startedPRRefreshToken)
        }
      }
      if (!isCurrentRequest()) {
        return
      }
      await refreshHostedReviewCard(fetchHostedReviewForBranch, {
        repoPath: repo.path,
        repoId: repo.id,
        branch,
        linkedGitHubPR: linkedPR,
        fallbackGitHubPR: refreshedPR?.number ?? fallbackGitHubPRNumber,
        linkedGitLabMR,
        linkedBitbucketPR,
        linkedAzureDevOpsPR,
        linkedGiteaPR
      })
      if (!isCurrentRequest()) {
        return
      }
      if (refreshedPR) {
        refreshOutcome = 'pr'
        const prRequestKey = checksPanelAsyncResultKey(
          prCacheKey,
          branch,
          refreshedPR.number,
          refreshedPR.prRepo,
          refreshedPR.headSha
        )
        if (!isCurrentAsyncResult(initialRequestKey) && !isCurrentRequest()) {
          return
        }
        // Why: a forced PR refresh can discover the PR number before React has
        // repainted from prCache; make this refresh's follow-up checks current.
        asyncResultKeyRef.current = prRequestKey
        // Why: use the refreshed head directly; the fetchChecks closure may still
        // hold a pre-refresh SHA after a force-push or review-number change.
        const refreshedChecks = fetchPRChecks(
          repo.path,
          refreshedPR.number,
          branch,
          refreshedPR.headSha,
          refreshedPR.prRepo,
          { force: true, repoId: repo.id }
        ).then(
          (result) => {
            if (!isCurrentRequest() || !isCurrentAsyncResult(prRequestKey)) {
              return
            }
            setChecks(result)
            const signature = JSON.stringify(
              result.map((c) => `${c.name}:${c.status}:${c.conclusion}`)
            )
            pollIntervalRef.current =
              signature === prevChecksRef.current
                ? Math.min(pollIntervalRef.current * 2, 120_000)
                : 30_000
            prevChecksRef.current = signature
          },
          (err) => {
            if (!isCurrentRequest() || !isCurrentAsyncResult(prRequestKey)) {
              return
            }
            console.warn('Failed to fetch PR checks:', err)
            setChecks([])
          }
        )
        setChecksLoading(true)
        setCommentsLoading(true)
        const refreshedComments = fetchPRComments(repo.path, refreshedPR.number, {
          force: true,
          repoId: repo.id,
          prRepo: refreshedPR.prRepo
        }).then(
          (result) => {
            if (isCurrentRequest() && isCurrentAsyncResult(prRequestKey)) {
              setComments(result)
            }
          },
          (err) => {
            if (!isCurrentRequest() || !isCurrentAsyncResult(prRequestKey)) {
              return
            }
            console.warn('Failed to fetch PR comments:', err)
            setComments([])
          }
        )
        await Promise.all([
          refreshedChecks.finally(() => {
            if (isCurrentRequest() && isCurrentAsyncResult(prRequestKey)) {
              setChecksLoading(false)
            }
          }),
          refreshedComments.finally(() => {
            if (isCurrentRequest() && isCurrentAsyncResult(prRequestKey)) {
              setCommentsLoading(false)
            }
          })
        ])
      } else if (isCurrentRequest()) {
        setChecks([])
        setComments([])
        refreshOutcome = 'no-pr'
      }
    } catch (error) {
      refreshOutcome = 'error'
      throw error
    } finally {
      recordChecksPanelPRRefreshBreadcrumb({
        event: 'done',
        provider: refreshProvider,
        repoId: repo.id,
        worktreeId: activeWorktreeId,
        branch,
        prCacheKey,
        prNumber: activeGitLabReview?.number ?? prNumber,
        prState: activeGitLabReview?.state ?? pr?.state,
        prChecksStatus: pr?.checksStatus,
        refreshState: prCacheKey ? useAppStore.getState().prRefreshStates[prCacheKey] : null,
        outcome: refreshOutcome,
        durationMs: Date.now() - refreshStartedAt,
        currentRequest: isCurrentRequest()
      })
      if (isCurrentRequest()) {
        refreshInFlightRef.current = false
        setIsRefreshing(false)
      }
    }
  }, [
    repo,
    branch,
    activeConnectionId,
    activeWorktreeId,
    activeWorktreePath,
    activeWorktreePushTarget,
    activeGitLabReview,
    prNumber,
    pr?.checksStatus,
    pr?.headSha,
    pr?.prRepo,
    pr?.state,
    prCacheKey,
    linkedPR,
    fallbackGitHubPRNumber,
    fetchGitLabDetails,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGiteaPR,
    linkedGitLabMR,
    isFolder,
    isGitLabReviewContext,
    gitStatusSnapshot,
    panelContextKey,
    fetchPRForBranch,
    fetchPRChecks,
    fetchPRComments,
    fetchHostedReviewForBranch,
    expireGitHubPRRefreshState,
    isCurrentAsyncResult,
    ownerSettings,
    updateWorktreeGitIdentity,
    panelContextKeyRef,
    asyncResultKeyRef,
    setCommentsLoading,
    setIsRefreshing,
    prevChecksRef,
    setChecksLoading,
    refreshRequestKeyRef,
    setChecks,
    setGitStatusSnapshot,
    setComments,
    pollIntervalRef,
    refreshInFlightRef
  ])

  return { ...context, handleRefresh }
}

export type useChecksPanelRefreshActionState = ReturnType<typeof useChecksPanelRefreshAction>
