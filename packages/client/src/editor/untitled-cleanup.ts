import { deleteRuntimePath, deleteRuntimeRelativePath } from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import type { AppState } from '~renderer/store/types'
import { findWorktreeById } from '~renderer/worktree/state/types'

import type { OpenFile } from './file-model'

export function deleteUntouchedUntitledFile(state: AppState, file: OpenFile): void {
  const worktree = findWorktreeById(state.worktreesByRepo, file.worktreeId)
  const owningRuntimeEnvironmentId = file.runtimeEnvironmentId?.trim()
  // Why: untitled placeholders may live on a remote runtime or SSH target.
  // Route through the runtime-aware client instead of assuming client-local FS.
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — a direct repo/worktree owner is never SSH.
  const context = {
    settings: settingsForRuntimeOwner(state.settings, file.runtimeEnvironmentId),
    worktreeId: file.worktreeId,
    worktreePath: worktree?.path ?? null,
    connectionId: undefined
  }
  void deleteRuntimeRelativePath(context, file.relativePath)
    .then((deletedRemotely) => {
      if (!deletedRemotely && !owningRuntimeEnvironmentId) {
        return deleteRuntimePath(context, file.filePath)
      }
      return undefined
    })
    .catch(() => {})
}

export function shouldDeleteUntouchedUntitledFile(
  file: OpenFile | undefined,
  hasDraft: boolean
): boolean {
  return (
    file?.isUntitled === true && !file.isDirty && !hasDraft && file.deleteUntouchedOnClose !== false
  )
}
