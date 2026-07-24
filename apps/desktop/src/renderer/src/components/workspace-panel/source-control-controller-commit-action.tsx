import { useCallback } from 'react'

import { getConnectionId } from '@/lib/connection-context'
import { commitRuntimeGit } from '@/runtime/runtime-git-client'

import type { SourceControlLifecycleController } from './source-control-controller-lifecycle'
import { writeCommitDraftForWorktree } from './source-control-panel-state'
import type { SourceControlOperationTarget } from './source-control-panel-types'

export function useSourceControlCommitAction(scope: SourceControlLifecycleController) {
  const {
    activeRepoSettings,
    activeWorktree,
    activeWorktreeId,
    beginGitBranchCompareRequest,
    commitInFlightRef,
    commitMessage,
    compareBaseRef,
    grouped,
    refreshActiveGitStatusAfterMutation,
    refreshBranchCompareRef,
    refreshGitHistoryRef,
    setCommitErrorForWorktree,
    setCommitInFlightByWorktree,
    unresolvedConflicts,
    updateCommitDrafts,
    worktreePath
  } = scope
  const handleCommit = useCallback(
    async (
      messageOverride?: string,
      options?: {
        skipStagedSnapshotCheck?: boolean
        skipActiveConflictCheck?: boolean
        target?: SourceControlOperationTarget
      }
    ): Promise<boolean> => {
      const target =
        options?.target ??
        (activeWorktreeId && worktreePath
          ? {
              settings: activeRepoSettings,
              worktreeId: activeWorktreeId,
              worktreePath,
              connectionId: getConnectionId(activeWorktreeId) ?? undefined,
              pushTarget: activeWorktree?.pushTarget
            }
          : null)
      if (!target) {
        return false
      }
      const message = (messageOverride ?? commitMessage).trim()
      if (
        !message ||
        (!options?.skipStagedSnapshotCheck && grouped.staged.length === 0) ||
        (!options?.skipActiveConflictCheck && unresolvedConflicts.length > 0)
      ) {
        return false
      }

      if (commitInFlightRef.current[target.worktreeId]) {
        return false
      }
      commitInFlightRef.current[target.worktreeId] = true

      setCommitInFlightByWorktree((prev) => ({ ...prev, [target.worktreeId]: true }))
      setCommitErrorForWorktree(target.worktreeId, null)
      try {
        const commitResult = await commitRuntimeGit(
          {
            // Why: route the commit by the repo OWNER host, not the focused runtime.
            settings: target.settings,
            worktreeId: target.worktreeId,
            worktreePath: target.worktreePath,
            connectionId: target.connectionId
          },
          message
        )
        if (!commitResult.success) {
          setCommitErrorForWorktree(target.worktreeId, commitResult.error ?? 'Commit failed')
          return false
        }

        // Why: the textarea stays editable during commit, so clear the draft only
        // when it still matches the captured message and cannot contain new edits.
        updateCommitDrafts((prev) => {
          const current = prev[target.worktreeId]
          if (current !== undefined && current.trim() !== message) {
            // User typed more after submit — preserve their in-progress edits.
            return prev
          }
          return writeCommitDraftForWorktree(prev, target.worktreeId, '')
        })
        setCommitErrorForWorktree(target.worktreeId, null)
        if (!options?.target) {
          void refreshActiveGitStatusAfterMutation()
        }
        // Why: mark compare loading before status clears to prevent a false clean
        // state, then refresh without delaying compound commit-and-push flows.
        if (!options?.target && compareBaseRef) {
          beginGitBranchCompareRequest(
            target.worktreeId,
            `${target.worktreeId}:${compareBaseRef}:${Date.now()}:post-commit`,
            compareBaseRef
          )
        }
        if (!options?.target) {
          void refreshBranchCompareRef.current()
          void refreshGitHistoryRef.current()
        }
        return true
      } catch (error) {
        setCommitErrorForWorktree(
          target.worktreeId,
          error instanceof Error ? error.message : 'Commit failed'
        )
        return false
      } finally {
        setCommitInFlightByWorktree((prev) => ({ ...prev, [target.worktreeId]: false }))
        commitInFlightRef.current[target.worktreeId] = false
      }
    },
    [
      activeRepoSettings,
      activeWorktree?.pushTarget,
      activeWorktreeId,
      beginGitBranchCompareRequest,
      commitInFlightRef,
      commitMessage,
      compareBaseRef,
      grouped.staged.length,
      refreshBranchCompareRef,
      refreshActiveGitStatusAfterMutation,
      refreshGitHistoryRef,
      setCommitErrorForWorktree,
      setCommitInFlightByWorktree,
      updateCommitDrafts,
      unresolvedConflicts.length,
      worktreePath
    ]
  )
  return { ...scope, handleCommit }
}

export type SourceControlCommitActionController = ReturnType<typeof useSourceControlCommitAction>
