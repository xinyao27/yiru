import { useCallback, useEffect } from 'react'

import { getConnectionId } from '@/lib/connection-context'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { getRuntimeGitBranchCompare, getRuntimeGitHistory } from '@/runtime/runtime-git-client'
import { useAppStore } from '@/store'

import { shouldClearBranchCompareForMissingBase } from './source-control-base-ref'
import {
  shouldRefreshBranchCompareForRemoteStatus,
  shouldRefreshBranchCompareForStatusHead
} from './source-control-compare-summary'
import type { SourceControlBulkActionsController } from './source-control-controller-bulk-actions'
import { BRANCH_REFRESH_INTERVAL_MS } from './source-control-panel-constants'

export function useSourceControlBranchCompare(scope: SourceControlBulkActionsController) {
  const {
    activeGitStatusHead,
    activeRepoSettings,
    activeWorktreeId,
    beginGitBranchCompareRequest,
    branchCompareInFlightRef,
    branchCompareRemoteStatusRef,
    branchCompareRerunRef,
    branchCompareRunPromiseRef,
    branchCompareStatusHeadRef,
    branchName,
    clearGitBranchCompare,
    compareBaseRef,
    gitHistoryRequestByWorktreeRef,
    gitHistoryRequestSeqRef,
    isBranchVisible,
    isFolder,
    isGitHistoryExpanded,
    isGitHistoryVisible,
    refreshBranchCompareRef,
    refreshGitHistoryRef,
    remoteStatus,
    setGitBranchCompareResult,
    setGitHistoryByWorktree,
    worktreePath
  } = scope
  const runBranchCompare = useCallback(async () => {
    if (!activeWorktreeId || !worktreePath || !compareBaseRef || isFolder) {
      return
    }

    const requestKey = `${activeWorktreeId}:${compareBaseRef}:${Date.now()}`
    const existingSummary =
      useAppStore.getState().gitBranchCompareSummaryByWorktree[activeWorktreeId]

    // Why: only initial or base-changing requests should replace the current
    // result with a spinner; polling retries must not flicker loading/error.
    const baseRefChanged = existingSummary && existingSummary.baseRef !== compareBaseRef
    const shouldResetToLoading = !existingSummary || baseRefChanged
    if (shouldResetToLoading) {
      beginGitBranchCompareRequest(activeWorktreeId, requestKey, compareBaseRef)
    } else {
      beginGitBranchCompareRequest(activeWorktreeId, requestKey, compareBaseRef, {
        preserveExistingSummary: true
      })
    }

    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      const result = await getRuntimeGitBranchCompare(
        {
          // Why: route the branch compare by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        compareBaseRef
      )
      setGitBranchCompareResult(activeWorktreeId, requestKey, result)
    } catch (error) {
      setGitBranchCompareResult(activeWorktreeId, requestKey, {
        summary: {
          baseRef: compareBaseRef,
          baseOid: null,
          compareRef: branchName,
          headOid: null,
          mergeBase: null,
          changedFiles: 0,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Branch compare failed'
        },
        entries: []
      })
    }
  }, [
    activeRepoSettings,
    activeWorktreeId,
    beginGitBranchCompareRequest,
    branchName,
    compareBaseRef,
    isFolder,
    setGitBranchCompareResult,
    worktreePath
  ])
  const refreshBranchCompare = useCallback(async () => {
    if (branchCompareInFlightRef.current) {
      branchCompareRerunRef.current = true
      return branchCompareRunPromiseRef.current ?? undefined
    }

    branchCompareInFlightRef.current = true
    const runPromise = (async (): Promise<void> => {
      // Why: event and timer refreshes share one Git subprocess chain, with
      // concurrent requests collapsed into one trailing refresh.
      try {
        await runBranchCompare()
      } finally {
        branchCompareInFlightRef.current = false
        if (branchCompareRerunRef.current) {
          branchCompareRerunRef.current = false
          await refreshBranchCompareRef.current()
        }
      }
    })()
    branchCompareRunPromiseRef.current = runPromise
    try {
      await runPromise
    } finally {
      if (branchCompareRunPromiseRef.current === runPromise) {
        branchCompareRunPromiseRef.current = null
      }
    }
  }, [
    branchCompareInFlightRef,
    branchCompareRerunRef,
    branchCompareRunPromiseRef,
    refreshBranchCompareRef,
    runBranchCompare
  ])
  refreshBranchCompareRef.current = refreshBranchCompare
  const refreshGitHistory = useCallback(async (): Promise<void> => {
    if (
      !activeWorktreeId ||
      !worktreePath ||
      isFolder ||
      !isBranchVisible ||
      !isGitHistoryExpanded ||
      !isGitHistoryVisible
    ) {
      return
    }

    const worktreeId = activeWorktreeId
    const requestId = gitHistoryRequestSeqRef.current + 1
    gitHistoryRequestSeqRef.current = requestId
    gitHistoryRequestByWorktreeRef.current[worktreeId] = requestId
    setGitHistoryByWorktree((prev) => {
      const previous = prev[worktreeId]
      return {
        ...prev,
        [worktreeId]: previous?.result
          ? { status: 'refreshing', result: previous.result }
          : { status: 'loading' }
      }
    })

    try {
      const connectionId = getConnectionId(worktreeId) ?? undefined
      const result = await getRuntimeGitHistory(
        {
          // Why: route the history read by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId,
          worktreePath,
          connectionId
        },
        { limit: 50, baseRef: compareBaseRef }
      )
      if (gitHistoryRequestByWorktreeRef.current[worktreeId] !== requestId) {
        return
      }
      setGitHistoryByWorktree((prev) => ({ ...prev, [worktreeId]: { status: 'ready', result } }))
    } catch (error) {
      if (gitHistoryRequestByWorktreeRef.current[worktreeId] !== requestId) {
        return
      }
      const message = error instanceof Error ? error.message : 'Failed to load commits'
      setGitHistoryByWorktree((prev) => {
        const previous = prev[worktreeId]
        return {
          ...prev,
          [worktreeId]: previous?.result
            ? { status: 'error', result: previous.result, error: message }
            : { status: 'error', error: message }
        }
      })
    }
  }, [
    activeRepoSettings,
    activeWorktreeId,
    gitHistoryRequestByWorktreeRef,
    gitHistoryRequestSeqRef,
    compareBaseRef,
    isBranchVisible,
    isFolder,
    isGitHistoryExpanded,
    isGitHistoryVisible,
    setGitHistoryByWorktree,
    worktreePath
  ])
  refreshGitHistoryRef.current = refreshGitHistory
  useEffect(() => {
    if (!activeWorktreeId || !worktreePath || !isBranchVisible || !compareBaseRef || isFolder) {
      branchCompareStatusHeadRef.current = null
      return
    }

    const current = {
      baseRef: compareBaseRef,
      statusHead: activeGitStatusHead,
      worktreeId: activeWorktreeId
    }
    const previous = branchCompareStatusHeadRef.current
    branchCompareStatusHeadRef.current = current
    if (shouldRefreshBranchCompareForStatusHead(previous, current)) {
      void refreshBranchCompareRef.current()
    }
  }, [
    activeGitStatusHead,
    activeWorktreeId,
    compareBaseRef,
    isBranchVisible,
    isFolder,
    branchCompareStatusHeadRef,
    refreshBranchCompareRef,
    worktreePath
  ])
  useEffect(() => {
    if (!activeWorktreeId || !worktreePath || !isBranchVisible || !compareBaseRef || isFolder) {
      branchCompareRemoteStatusRef.current = null
      return
    }

    // Why: pushing a branch can move its remote-tracking base and ahead count
    // without changing local HEAD, so the HEAD-change effect alone misses it.
    const current = {
      ahead: remoteStatus?.ahead ?? null,
      baseRef: compareBaseRef,
      behind: remoteStatus?.behind ?? null,
      hasUpstream: remoteStatus?.hasUpstream ?? null,
      upstreamName: remoteStatus?.upstreamName ?? null,
      worktreeId: activeWorktreeId
    }
    const previous = branchCompareRemoteStatusRef.current
    branchCompareRemoteStatusRef.current = current
    if (shouldRefreshBranchCompareForRemoteStatus(previous, current)) {
      void refreshBranchCompareRef.current()
    }
  }, [
    activeWorktreeId,
    compareBaseRef,
    branchCompareRemoteStatusRef,
    isBranchVisible,
    isFolder,
    remoteStatus?.ahead,
    remoteStatus?.behind,
    remoteStatus?.hasUpstream,
    remoteStatus?.upstreamName,
    refreshBranchCompareRef,
    worktreePath
  ])
  useEffect(() => {
    if (!activeWorktreeId || !worktreePath || !isBranchVisible || !compareBaseRef || isFolder) {
      return
    }

    // Why: git-status HEAD changes refresh branch compare immediately. Keep a
    // visible-window fallback for base refs or remote updates that do not move HEAD.
    return installWindowVisibilityInterval({
      run: () => void refreshBranchCompareRef.current(),
      intervalMs: BRANCH_REFRESH_INTERVAL_MS
    })
  }, [
    activeWorktreeId,
    compareBaseRef,
    isBranchVisible,
    isFolder,
    refreshBranchCompareRef,
    worktreePath
  ])
  useEffect(() => {
    // Why: clear a stale summary only after upstream status confirms there is no
    // compare base; clearing earlier makes the committed section flicker.
    if (
      !activeWorktreeId ||
      !shouldClearBranchCompareForMissingBase({ isFolder, compareBaseRef, remoteStatus })
    ) {
      return
    }
    clearGitBranchCompare(activeWorktreeId)
  }, [activeWorktreeId, clearGitBranchCompare, compareBaseRef, isFolder, remoteStatus])
  return { ...scope, runBranchCompare, refreshBranchCompare, refreshGitHistory }
}

export type SourceControlBranchCompareController = ReturnType<typeof useSourceControlBranchCompare>
