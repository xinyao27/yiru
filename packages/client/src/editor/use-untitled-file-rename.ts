import { useState } from 'react'
import type { OpenFile } from '~renderer/editor/state'
import { detectLanguage } from '~renderer/file-presentation/language-detect'
import { dirname, joinPath } from '~renderer/path'
import { getConnectionId } from '~renderer/runtime/connection-context'
import {
  createRuntimePath,
  renameRuntimePath,
  runtimePathExists
} from '~renderer/runtime/file-client'
import { settingsForRuntimeOwner } from '~renderer/runtime/rpc-client'
import { useAppStore } from '~renderer/store/state'

import { requestEditorFileSave, requestEditorSaveQuiesce } from './autosave'
import { getUntitledFileRoot } from './untitled-file-rename-path'

type UseUntitledFileRenameParams = {
  openFiles: OpenFile[]
  closeFile: (filePath: string) => void
  openFile: (file: {
    filePath: string
    relativePath: string
    worktreeId: string
    runtimeEnvironmentId?: string | null
    language: string
    mode: 'edit'
  }) => void
  clearUntitled: (fileId: string) => void
}

type UseUntitledFileRenameResult = {
  renameDialogFileId: string | null
  renameDialogFile: OpenFile | null
  renameError: string | null
  requestRenameForFile: (fileId: string) => void
  closeRenameDialog: () => void
  handleRenameConfirm: (newRelPath: string) => Promise<void>
}

export function useUntitledFileRename({
  openFiles,
  closeFile,
  openFile,
  clearUntitled
}: UseUntitledFileRenameParams): UseUntitledFileRenameResult {
  const [renameDialogFileId, setRenameDialogFileId] = useState<string | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const renameDialogFile = renameDialogFileId
    ? (openFiles.find((f) => f.id === renameDialogFileId) ?? null)
    : null

  const closeRenameDialog = (): void => {
    setRenameDialogFileId(null)
    setRenameError(null)
  }

  const handleRenameConfirm = async (newRelPath: string) => {
    if (!renameDialogFile) {
      return
    }
    const oldPath = renameDialogFile.filePath
    const worktreeRoot = getUntitledFileRoot(renameDialogFile)
    const newPath = joinPath(worktreeRoot, newRelPath)
    const connectionId = getConnectionId(renameDialogFile.worktreeId) ?? undefined
    const fileContext = {
      settings: settingsForRuntimeOwner(
        useAppStore.getState().settings,
        renameDialogFile.runtimeEnvironmentId
      ),
      worktreeId: renameDialogFile.worktreeId,
      worktreePath: worktreeRoot,
      connectionId
    }

    if (newPath !== oldPath && (await runtimePathExists(fileContext, newPath))) {
      setRenameError('A file with that name already exists')
      return
    }

    await requestEditorSaveQuiesce({ fileId: renameDialogFile.id })
    const draft = useAppStore.getState().editorDrafts[renameDialogFile.id]
    if (draft !== undefined) {
      try {
        await requestEditorFileSave({ fileId: renameDialogFile.id, fallbackContent: draft })
      } catch {
        setRenameError('Failed to save file')
        return
      }
    }

    if (newPath === oldPath) {
      clearUntitled(renameDialogFile.id)
      closeRenameDialog()
      return
    }

    const newDir = dirname(newPath)
    if (newDir !== worktreeRoot && !(await runtimePathExists(fileContext, newDir))) {
      await createRuntimePath(fileContext, newDir, 'directory')
    }

    try {
      await renameRuntimePath(fileContext, oldPath, newPath)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename file')
      return
    }

    closeFile(renameDialogFile.id)
    openFile({
      filePath: newPath,
      relativePath: newRelPath,
      worktreeId: renameDialogFile.worktreeId,
      runtimeEnvironmentId: renameDialogFile.runtimeEnvironmentId,
      language: detectLanguage(newRelPath),
      mode: 'edit'
    })
    closeRenameDialog()
  }

  return {
    renameDialogFileId,
    renameDialogFile,
    renameError,
    requestRenameForFile: setRenameDialogFileId,
    closeRenameDialog,
    handleRenameConfirm
  }
}
