import { shouldForcePushWithLeaseForUpstream } from '@yiru/workbench-model/review'
import { useCallback, useRef } from 'react'

import { getConnectionId } from '@/lib/connection-context'
import { bulkStageRuntimeGitPaths, bulkUnstageRuntimeGitPaths } from '@/runtime/runtime-git-client'

import { getStageAllPaths } from './discard-all-sequence'
import type {
  BranchCompareRemoteStatusSnapshot,
  BranchCompareStatusHeadSnapshot
} from './source-control-compare-summary'
import type { SourceControlFileOpenController } from './source-control-controller-file-open'

export function useSourceControlBulkActions(scope: SourceControlFileOpenController) {
  const {
    activeRepoSettings,
    activeWorktreeId,
    bulkStagePaths,
    bulkUnstagePaths,
    clearSelection,
    createPrHeaderAction,
    grouped,
    handleActionInvoke,
    handleCreatePullRequest,
    isExecutingBulk,
    primaryAction,
    refreshActiveGitStatusAfterMutation,
    remoteStatus,
    remoteStatusForActions,
    runCreatePrIntent,
    setIsExecutingBulk,
    worktreePath
  } = scope
  const handleBulkStage = useCallback(async () => {
    if (!worktreePath || bulkStagePaths.length === 0) {
      return
    }
    setIsExecutingBulk(true)
    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      await bulkStageRuntimeGitPaths(
        {
          // Why: route staging by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        bulkStagePaths
      )
      await refreshActiveGitStatusAfterMutation()
      clearSelection()
    } finally {
      setIsExecutingBulk(false)
    }
  }, [
    activeRepoSettings,
    worktreePath,
    bulkStagePaths,
    clearSelection,
    activeWorktreeId,
    refreshActiveGitStatusAfterMutation,
    setIsExecutingBulk
  ])
  const handleBulkUnstage = useCallback(async () => {
    if (!worktreePath || bulkUnstagePaths.length === 0) {
      return
    }
    setIsExecutingBulk(true)
    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      await bulkUnstageRuntimeGitPaths(
        {
          // Why: route unstaging by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        bulkUnstagePaths
      )
      await refreshActiveGitStatusAfterMutation()
      clearSelection()
    } finally {
      setIsExecutingBulk(false)
    }
  }, [
    activeRepoSettings,
    worktreePath,
    bulkUnstagePaths,
    clearSelection,
    activeWorktreeId,
    refreshActiveGitStatusAfterMutation,
    setIsExecutingBulk
  ])
  const handleStageAllPaths = useCallback(
    async (paths: readonly string[]) => {
      if (!worktreePath || isExecutingBulk || paths.length === 0) {
        return
      }
      setIsExecutingBulk(true)
      try {
        const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
        await bulkStageRuntimeGitPaths(
          {
            // Why: route staging by the repo OWNER host, not the focused runtime.
            settings: activeRepoSettings,
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          [...paths]
        )
        await refreshActiveGitStatusAfterMutation()
        clearSelection()
      } finally {
        setIsExecutingBulk(false)
      }
    },
    [
      activeRepoSettings,
      activeWorktreeId,
      clearSelection,
      isExecutingBulk,
      refreshActiveGitStatusAfterMutation,
      setIsExecutingBulk,
      worktreePath
    ]
  )
  const handleUnstagePaths = useCallback(
    async (paths: readonly string[]) => {
      if (!worktreePath || isExecutingBulk || paths.length === 0) {
        return
      }
      setIsExecutingBulk(true)
      try {
        const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
        await bulkUnstageRuntimeGitPaths(
          {
            // Why: route unstaging by the repo OWNER host, not the focused runtime.
            settings: activeRepoSettings,
            worktreeId: activeWorktreeId,
            worktreePath,
            connectionId
          },
          [...paths]
        )
        await refreshActiveGitStatusAfterMutation()
        clearSelection()
      } finally {
        setIsExecutingBulk(false)
      }
    },
    [
      activeRepoSettings,
      activeWorktreeId,
      clearSelection,
      isExecutingBulk,
      refreshActiveGitStatusAfterMutation,
      setIsExecutingBulk,
      worktreePath
    ]
  )
  const handleStageAllPrimary = useCallback(async (): Promise<void> => {
    if (!worktreePath || isExecutingBulk) {
      return
    }
    const filePaths = [
      ...getStageAllPaths(grouped.unstaged, 'unstaged'),
      ...getStageAllPaths(grouped.untracked, 'untracked')
    ]
    if (filePaths.length === 0) {
      return
    }
    setIsExecutingBulk(true)
    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      await bulkStageRuntimeGitPaths(
        {
          // Why: route staging by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        filePaths
      )
      await refreshActiveGitStatusAfterMutation()
      clearSelection()
    } finally {
      setIsExecutingBulk(false)
    }
  }, [
    activeRepoSettings,
    worktreePath,
    isExecutingBulk,
    grouped,
    activeWorktreeId,
    clearSelection,
    refreshActiveGitStatusAfterMutation,
    setIsExecutingBulk
  ])
  const handlePrimaryClick = useCallback((): void => {
    switch (primaryAction.kind) {
      case 'stage':
        void handleStageAllPrimary()
        return
      case 'push':
        // Why: the primary keeps kind `push` even when its label requires a lease
        // force; route that state explicitly without changing dropdown Push.
        handleActionInvoke(
          shouldForcePushWithLeaseForUpstream(remoteStatusForActions ?? remoteStatus)
            ? 'force_push'
            : 'push'
        )
        return
      case 'commit':
      case 'pull':
      case 'sync':
      case 'publish':
      case 'create_pr':
        handleActionInvoke(primaryAction.kind)
        return
      case 'create_pr_intent':
        void runCreatePrIntent()
    }
  }, [
    handleActionInvoke,
    handleStageAllPrimary,
    primaryAction.kind,
    remoteStatus,
    remoteStatusForActions,
    runCreatePrIntent
  ])
  const handleCreatePrHeaderClick = useCallback((): void => {
    if (!createPrHeaderAction || createPrHeaderAction.disabled) {
      return
    }
    if (createPrHeaderAction.kind === 'create_pr') {
      void handleCreatePullRequest()
      return
    }
    if (createPrHeaderAction.kind === 'create_pr_intent') {
      void runCreatePrIntent()
    }
  }, [createPrHeaderAction, handleCreatePullRequest, runCreatePrIntent])
  const branchCompareInFlightRef = useRef(false)
  const branchCompareRerunRef = useRef(false)
  const branchCompareRunPromiseRef = useRef<Promise<void> | null>(null)
  const branchCompareStatusHeadRef = useRef<BranchCompareStatusHeadSnapshot | null>(null)
  const branchCompareRemoteStatusRef = useRef<BranchCompareRemoteStatusSnapshot | null>(null)
  return {
    ...scope,
    handleBulkStage,
    handleBulkUnstage,
    handleStageAllPaths,
    handleUnstagePaths,
    handleStageAllPrimary,
    handlePrimaryClick,
    handleCreatePrHeaderClick,
    branchCompareInFlightRef,
    branchCompareRerunRef,
    branchCompareRunPromiseRef,
    branchCompareStatusHeadRef,
    branchCompareRemoteStatusRef
  }
}

export type SourceControlBulkActionsController = ReturnType<typeof useSourceControlBulkActions>
