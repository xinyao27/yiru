import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'

import type { AppState } from '../../store/types'
import { settingsForWorktreeOwner } from './runtime-owner'
import type { WorktreeSlice } from './types'

export function createWorktreeDeleteStateActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<
  WorktreeSlice,
  | 'markWorktreesDeleting'
  | 'markWorktreesQueuedForDeletion'
  | 'forceDeletePreservedBranch'
  | 'getWorktreeBranchRenameFailureOutput'
  | 'clearWorktreeDeleteState'
> {
  return {
    markWorktreesDeleting: (worktreeIds) => {
      if (worktreeIds.length === 0) {
        return
      }
      set((s) => {
        const nextDeleteState = { ...s.deleteStateByWorktreeId }
        let changed = false
        for (const worktreeId of new Set(worktreeIds)) {
          const current = nextDeleteState[worktreeId]
          if (current?.isDeleting && current.error === null && !current.canForceDelete) {
            continue
          }
          nextDeleteState[worktreeId] = {
            isDeleting: true,
            phase: 'deleting',
            error: null,
            canForceDelete: false,
            forceDeleteReason: null
          }
          changed = true
        }
        return changed ? { deleteStateByWorktreeId: nextDeleteState } : {}
      })
    },
    markWorktreesQueuedForDeletion: (worktreeIds) => {
      if (worktreeIds.length === 0) {
        return
      }
      set((s) => {
        const nextDeleteState = { ...s.deleteStateByWorktreeId }
        let changed = false
        for (const worktreeId of new Set(worktreeIds)) {
          const current = nextDeleteState[worktreeId]
          if (current?.isDeleting && current.error === null && !current.canForceDelete) {
            continue
          }
          nextDeleteState[worktreeId] = {
            isDeleting: true,
            phase: 'queued',
            error: null,
            canForceDelete: false,
            forceDeleteReason: null
          }
          changed = true
        }
        return changed ? { deleteStateByWorktreeId: nextDeleteState } : {}
      })
    },
    forceDeletePreservedBranch: async (worktreeId, branchName, expectedHead) => {
      try {
        const target = getActiveRuntimeTarget(settingsForWorktreeOwner(get(), worktreeId))
        const result = await (target.kind === 'local'
          ? workspaceHostClient.worktrees.forceDeletePreservedBranch({
              worktreeId,
              branchName,
              expectedHead
            })
          : callRuntimeOrpc(
              target,
              (client) => client.worktree.forceDeleteBranch,
              { worktree: toRuntimeWorktreeSelector(worktreeId), branchName, expectedHead },
              { timeoutMs: 15_000 }
            ))
        publishRendererCommandResult({
          type: 'worktree-branch-delete',
          outcome: 'succeeded',
          branchName
        })
        return { ok: true as const, ...result }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        publishRendererCommandResult({
          type: 'worktree-branch-delete',
          outcome: 'failed',
          branchName,
          error
        })
        return { ok: false as const, error }
      }
    },
    getWorktreeBranchRenameFailureOutput: async (worktreeId) => {
      const target = getActiveRuntimeTarget(settingsForWorktreeOwner(get(), worktreeId))
      return callRuntimeOrpc(
        target,
        (client) => client.worktree.branchRenameFailureOutput,
        { worktree: toRuntimeWorktreeSelector(worktreeId) },
        { timeoutMs: 15_000 }
      )
    },
    clearWorktreeDeleteState: (worktreeId) => {
      set((s) => {
        if (!s.deleteStateByWorktreeId[worktreeId]) {
          return {}
        }
        const next = { ...s.deleteStateByWorktreeId }
        delete next[worktreeId]
        return { deleteStateByWorktreeId: next }
      })
    }
  }
}
