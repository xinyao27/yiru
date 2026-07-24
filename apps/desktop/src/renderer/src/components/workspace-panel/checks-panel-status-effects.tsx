import { useEffect } from 'react'

import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { getRuntimeGitStatus, getRuntimeGitUpstreamStatus } from '@/runtime/runtime-git-client'

import {
  RUNTIME_SSH_STATUS_REFRESH_MS,
  GIT_STATUS_FAILURE_RETRY_MS
} from './checks-panel-controller-types'
import type { useChecksPanelGenerationFieldsState } from './checks-panel-generation-fields'
import {
  shouldClearChecksPanelGitStatusSnapshot,
  shouldCoalesceChecksPanelGitStatusSnapshotRefresh,
  shouldCommitChecksPanelGitStatusSnapshot,
  shouldPollChecksPanelRuntimeSshStatus
} from './checks-panel-git-status-snapshot'
import { resolveChecksPanelPRRefreshRequest } from './checks-panel-pr-refresh-request'

export function useChecksPanelStatusEffects(context: useChecksPanelGenerationFieldsState) {
  const {
    activeConnectionId,
    activeWorktree,
    activeWorktreeId,
    activeWorktreePath,
    activeWorktreePushTarget,
    agentComposerState,
    branch,
    enqueueGitHubPRRefresh,
    fallbackGitHubPRNumber,
    fetchHostedReviewForBranch,
    gitStatusInvalidation,
    gitStatusRefreshNonce,
    gitStatusSnapshotInFlightContextRef,
    gitStatusSnapshotRerunContextRef,
    gitStatusSnapshotRetryTimerRef,
    isFolder,
    isGitLabReviewContext,
    isPanelVisible,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGitLabMR,
    linkedGiteaPR,
    linkedPR,
    ownerSettings,
    panelContextKey,
    panelContextKeyRef,
    panelVisibleSinceRef,
    prCachedHasPR,
    prFetchedAt,
    remoteStatusInvalidation,
    repo,
    repoConnectionId,
    runtimeEnvironmentId,
    setAgentComposerState,
    setGitStatusRefreshNonce,
    setGitStatusSnapshot,
    sshConnectionStatus,
    stateRequestKey,
    updateWorktreeGitIdentity
  } = context

  useEffect(() => {
    if (
      agentComposerState?.commentResolution &&
      agentComposerState.commentResolution.reviewContextKey !== stateRequestKey
    ) {
      setAgentComposerState(null)
    }
  }, [agentComposerState?.commentResolution, stateRequestKey, setAgentComposerState])

  useEffect(() => {
    if (isPanelVisible && repo && !isFolder && branch) {
      void fetchHostedReviewForBranch(repo.path, branch, {
        repoId: repo.id,
        linkedGitHubPR: linkedPR,
        fallbackGitHubPR: fallbackGitHubPRNumber,
        currentHeadOid: activeWorktree?.head ?? null,
        linkedGitLabMR,
        linkedBitbucketPR,
        linkedAzureDevOpsPR,
        linkedGiteaPR,
        staleWhileRevalidate: true
      })
      if (activeWorktreeId && !isGitLabReviewContext) {
        const refreshRequest = resolveChecksPanelPRRefreshRequest({
          cachedHasPR: prCachedHasPR,
          cachedFetchedAt: prFetchedAt ?? null,
          panelVisibleSince: panelVisibleSinceRef.current
        })
        enqueueGitHubPRRefresh(activeWorktreeId, refreshRequest.reason, refreshRequest.priority)
      }
    }
  }, [
    activeWorktreeId,
    branch,
    enqueueGitHubPRRefresh,
    fallbackGitHubPRNumber,
    fetchHostedReviewForBranch,
    isFolder,
    isGitLabReviewContext,
    isPanelVisible,
    activeWorktree?.head,
    linkedAzureDevOpsPR,
    linkedBitbucketPR,
    linkedGiteaPR,
    linkedGitLabMR,
    linkedPR,
    prCachedHasPR,
    prFetchedAt,
    repo,
    panelVisibleSinceRef
  ])

  useEffect(() => {
    if (
      !shouldPollChecksPanelRuntimeSshStatus({
        isPanelVisible,
        runtimeEnvironmentId,
        repoConnectionId
      })
    ) {
      return undefined
    }
    let skippedInitialRun = false
    return installWindowVisibilityInterval({
      run: () => {
        if (!skippedInitialRun) {
          skippedInitialRun = true
          return
        }
        const currentContextKey = panelContextKeyRef.current
        if (
          shouldCoalesceChecksPanelGitStatusSnapshotRefresh(
            gitStatusSnapshotInFlightContextRef.current,
            currentContextKey
          )
        ) {
          gitStatusSnapshotRerunContextRef.current = currentContextKey
          return
        }
        setGitStatusRefreshNonce((value) => value + 1)
      },
      intervalMs: RUNTIME_SSH_STATUS_REFRESH_MS
    })
  }, [
    isPanelVisible,
    repoConnectionId,
    runtimeEnvironmentId,
    gitStatusSnapshotInFlightContextRef,
    gitStatusSnapshotRerunContextRef,
    setGitStatusRefreshNonce,
    panelContextKeyRef
  ])

  useEffect(() => {
    if (
      !repo ||
      isFolder ||
      !branch ||
      !isPanelVisible ||
      !activeWorktreeId ||
      !activeWorktreePath ||
      (!runtimeEnvironmentId && repoConnectionId && sshConnectionStatus !== 'connected')
    ) {
      if (gitStatusSnapshotRetryTimerRef.current) {
        clearTimeout(gitStatusSnapshotRetryTimerRef.current)
        gitStatusSnapshotRetryTimerRef.current = null
      }
      // Why: hiding the panel or temporarily losing SSH should stop new work,
      // not erase same-context Create PR eligibility that can still be retried.
      return
    }
    let stale = false
    const requestContextKey = panelContextKey
    const connectionId = activeConnectionId ?? undefined
    if (
      shouldCoalesceChecksPanelGitStatusSnapshotRefresh(
        gitStatusSnapshotInFlightContextRef.current,
        requestContextKey
      )
    ) {
      gitStatusSnapshotRerunContextRef.current = requestContextKey
      return () => {
        stale = true
      }
    }
    gitStatusSnapshotInFlightContextRef.current = requestContextKey
    // Why: global status maps are keyed only by worktree. Use their changes as
    // invalidation signals, then fetch a local snapshot for the active boundary.
    if (gitStatusSnapshotRetryTimerRef.current) {
      clearTimeout(gitStatusSnapshotRetryTimerRef.current)
      gitStatusSnapshotRetryTimerRef.current = null
    }
    setGitStatusSnapshot((snapshot) =>
      shouldClearChecksPanelGitStatusSnapshot(snapshot, requestContextKey) ? null : snapshot
    )
    const context = {
      settings: ownerSettings,
      worktreeId: activeWorktreeId,
      worktreePath: activeWorktreePath,
      connectionId
    }
    void (async () => {
      const status = await getRuntimeGitStatus(context)
      if (
        !stale &&
        shouldCommitChecksPanelGitStatusSnapshot(panelContextKeyRef.current, requestContextKey)
      ) {
        // Why: the Checks tab can be the only visible git surface; commit
        // branch identity before branch-scoped upstream refresh can fail.
        updateWorktreeGitIdentity(activeWorktreeId, {
          head: status.head,
          branch: status.branch ?? (status.head ? null : undefined)
        })
      }
      let freshRemoteStatus = status.upstreamStatus
      if (activeWorktreePushTarget) {
        freshRemoteStatus = await getRuntimeGitUpstreamStatus(context, activeWorktreePushTarget)
      } else if (
        !freshRemoteStatus ||
        (freshRemoteStatus.ahead > 0 &&
          freshRemoteStatus.behind > 0 &&
          freshRemoteStatus.behindCommitsArePatchEquivalent === undefined)
      ) {
        freshRemoteStatus = await getRuntimeGitUpstreamStatus(context)
      }
      return { status, remoteStatus: freshRemoteStatus }
    })()
      .then(({ status, remoteStatus }) => {
        if (
          !stale &&
          shouldCommitChecksPanelGitStatusSnapshot(panelContextKeyRef.current, requestContextKey)
        ) {
          setGitStatusSnapshot({
            contextKey: requestContextKey,
            hasUncommittedChanges: status.entries.length > 0,
            remoteStatus,
            gitIdentity: {
              head: status.head,
              branch: status.branch ?? (status.head ? null : undefined)
            }
          })
        }
      })
      .catch((error) => {
        console.warn('[ChecksPanel] git status refresh before eligibility failed', error)
        if (!stale) {
          // Why: transient SSH/runtime flakes should not hide an already-valid
          // Create PR state for this same branch; retry while the panel stays visible.
          setGitStatusSnapshot((snapshot) =>
            shouldClearChecksPanelGitStatusSnapshot(snapshot, requestContextKey) ? null : snapshot
          )
          gitStatusSnapshotRetryTimerRef.current = setTimeout(() => {
            gitStatusSnapshotRetryTimerRef.current = null
            if (
              shouldCommitChecksPanelGitStatusSnapshot(
                panelContextKeyRef.current,
                requestContextKey
              )
            ) {
              setGitStatusRefreshNonce((value) => value + 1)
            }
          }, GIT_STATUS_FAILURE_RETRY_MS)
        }
      })
      .finally(() => {
        if (gitStatusSnapshotInFlightContextRef.current === requestContextKey) {
          gitStatusSnapshotInFlightContextRef.current = null
        }
        if (gitStatusSnapshotRerunContextRef.current === requestContextKey) {
          gitStatusSnapshotRerunContextRef.current = null
          if (
            shouldCommitChecksPanelGitStatusSnapshot(panelContextKeyRef.current, requestContextKey)
          ) {
            setGitStatusRefreshNonce((value) => value + 1)
          }
        }
      })
    return () => {
      stale = true
      if (gitStatusSnapshotRetryTimerRef.current) {
        clearTimeout(gitStatusSnapshotRetryTimerRef.current)
        gitStatusSnapshotRetryTimerRef.current = null
      }
    }
  }, [
    activeWorktreePushTarget,
    activeWorktreeId,
    activeWorktreePath,
    activeConnectionId,
    branch,
    gitStatusInvalidation,
    gitStatusRefreshNonce,
    isFolder,
    isPanelVisible,
    ownerSettings,
    panelContextKey,
    repo,
    repoConnectionId,
    remoteStatusInvalidation,
    runtimeEnvironmentId,
    sshConnectionStatus,
    updateWorktreeGitIdentity,
    setGitStatusSnapshot,
    setGitStatusRefreshNonce,
    gitStatusSnapshotInFlightContextRef,
    gitStatusSnapshotRetryTimerRef,
    gitStatusSnapshotRerunContextRef,
    panelContextKeyRef
  ])

  return { ...context }
}

export type useChecksPanelStatusEffectsState = ReturnType<typeof useChecksPanelStatusEffects>
