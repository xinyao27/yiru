import {
  buildWorkspaceSessionPayload,
  shouldPersistWorkspaceSession
} from '~renderer/components/editor/workspace-session'
import { persistWorkspaceSessionByHost } from '~renderer/components/editor/workspace-session-host-persistence'
import { getConnectionIdForFile } from '~renderer/lib/connection-context'
import { shellClient } from '~renderer/runtime/shell-client'
import type {
  EditorPrepareHotExitDetail,
  EditorSaveDirtyFilesDetail
} from '~shared/editor-save-events'

import { canAutoSaveOpenFile, getOpenFilesForExternalFileChange } from './autosave'
import type {
  EditorPathMutationTarget,
  EditorSaveFileDetail,
  EditorSaveQuiesceDetail
} from './autosave'
import type { AppStoreApi, EditorAutosaveScheduler } from './autosave-scheduler'
import { getDuplicateDirtySavePaths } from './autosave-state-projections'
import { markFileChangedOnDisk } from './changed-on-disk-mark'
import { flushPendingEditorChange } from './pending-flush'
import { getEditorSelfWriteHostId, hasRecentSelfWrite } from './self-write-registry'

export type EditorAutosaveEventHandlers = {
  handleSaveDirtyFiles: (event: Event) => Promise<void>
  handlePrepareHotExit: (event: Event) => Promise<void>
  handleSaveAndClose: (event: Event) => Promise<void>
  handleSaveFile: (event: Event) => Promise<void>
  handleQuiesce: (event: Event) => Promise<void>
  handleExternalFileChange: (event: Event) => void
}

export function createEditorAutosaveEventHandlers(
  store: AppStoreApi,
  scheduler: EditorAutosaveScheduler
): EditorAutosaveEventHandlers {
  const handleSaveDirtyFiles = async (event: Event): Promise<void> => {
    const detail = (event as CustomEvent<EditorSaveDirtyFilesDetail>).detail
    if (!detail) {
      return
    }
    try {
      detail.claim()
      const dirtyFiles = store.getState().openFiles.filter((file) => file.isDirty)
      if (dirtyFiles.some((file) => !canAutoSaveOpenFile(file))) {
        detail.reject('Some unsaved editor changes cannot be auto-saved before restart.')
        return
      }
      for (const file of dirtyFiles) {
        flushPendingEditorChange(file.id)
      }
      if (getDuplicateDirtySavePaths(dirtyFiles).length > 0) {
        detail.reject(
          'Some unsaved files are open in multiple dirty tabs. Save them manually before restarting.'
        )
        return
      }
      await Promise.all(
        dirtyFiles.map(async (file) => {
          const content = scheduler.getLatestWritableContent(file)
          if (content === null) {
            throw new Error(`Missing editor buffer for ${file.relativePath}`)
          }
          await scheduler.queueSave(file, content)
        })
      )
      detail.resolve()
    } catch (error) {
      detail.reject(String((error as Error)?.message ?? error))
    }
  }

  const handlePrepareHotExit = async (event: Event): Promise<void> => {
    const detail = (event as CustomEvent<EditorPrepareHotExitDetail>).detail
    if (!detail) {
      return
    }
    try {
      detail.claim()
      const initiallyDirtyFiles = store.getState().openFiles.filter((file) => file.isDirty)
      await Promise.all(initiallyDirtyFiles.map((file) => scheduler.quiesceFileSave(file.id)))
      const state = store.getState()
      const dirtyFiles = state.openFiles.filter((file) => file.isDirty)
      if (dirtyFiles.some((file) => file.mode !== 'edit')) {
        detail.reject('Some unsaved editor changes cannot be backed up before restart.')
        return
      }
      for (const file of dirtyFiles) {
        if (state.editorDrafts[file.id] === undefined) {
          throw new Error(`Missing editor buffer for ${file.relativePath}`)
        }
      }
      if (dirtyFiles.length > 0 && !shouldPersistWorkspaceSession(state)) {
        detail.reject(
          'Unsaved editor changes cannot be backed up until workspace restore finishes.'
        )
        return
      }
      if (shouldPersistWorkspaceSession(state)) {
        await persistWorkspaceSessionByHost(
          shellClient.session,
          buildWorkspaceSessionPayload(state),
          state
        )
      }
      detail.resolve()
    } catch (error) {
      detail.reject(String((error as Error)?.message ?? error))
    }
  }

  const handleSaveAndClose = async (event: Event): Promise<void> => {
    const { fileId } = (event as CustomEvent<{ fileId: string }>).detail
    const file = store.getState().openFiles.find((openFile) => openFile.id === fileId)
    if (!file) {
      return
    }
    flushPendingEditorChange(file.id)
    const draft = store.getState().editorDrafts[fileId]
    if (draft !== undefined) {
      try {
        await scheduler.queueSave(file, draft)
      } catch {
        return
      }
    }
    store.getState().closeFile(fileId)
  }

  const handleSaveFile = async (event: Event): Promise<void> => {
    const detail = (event as CustomEvent<EditorSaveFileDetail>).detail
    if (!detail) {
      return
    }
    try {
      detail.claim()
      const file = store.getState().openFiles.find((openFile) => openFile.id === detail.fileId)
      if (!file) {
        detail.resolve()
        return
      }
      flushPendingEditorChange(file.id)
      const content = store.getState().editorDrafts[file.id] ?? detail.fallbackContent
      if (content === undefined) {
        detail.resolve()
        return
      }
      await scheduler.queueSave(file, content)
      detail.resolve()
    } catch (error) {
      detail.reject(String((error as Error)?.message ?? error))
    }
  }

  const handleQuiesce = async (event: Event): Promise<void> => {
    const detail = (event as CustomEvent<EditorSaveQuiesceDetail>).detail
    if (!detail) {
      return
    }
    detail.claim()
    const matchingFiles =
      'fileId' in detail
        ? store.getState().openFiles.filter((file) => file.id === detail.fileId)
        : getOpenFilesForExternalFileChange(store.getState().openFiles, detail)
    await Promise.all(matchingFiles.map((file) => scheduler.quiesceFileSave(file.id)))
    detail.resolve()
  }

  const handleExternalFileChange = (event: Event): void => {
    const detail = (event as CustomEvent<EditorPathMutationTarget>).detail
    if (!detail) {
      return
    }
    const state = store.getState()
    const matchingFiles = getOpenFilesForExternalFileChange(state.openFiles, detail)
    if (matchingFiles.length === 0) {
      return
    }
    const reloadingFiles = matchingFiles.filter((file) => !file.isDirty)
    for (const file of matchingFiles) {
      if (file.isDirty) {
        const connectionId = getConnectionIdForFile(file.worktreeId, file.filePath) ?? undefined
        if (
          !hasRecentSelfWrite(
            file.filePath,
            getEditorSelfWriteHostId(file.runtimeEnvironmentId, connectionId)
          )
        ) {
          markFileChangedOnDisk(state, file, { connectionId, origin: 'live' })
        }
        continue
      }
      scheduler.cancelFileSave(file.id)
      state.markFileDirty(file.id, false)
      if (file.externalMutation === 'changed') {
        state.setExternalMutation(file.id, null)
      }
    }
    state.clearEditorDrafts(reloadingFiles.map((file) => file.id))
  }

  return {
    handleSaveDirtyFiles,
    handlePrepareHotExit,
    handleSaveAndClose,
    handleSaveFile,
    handleQuiesce,
    handleExternalFileChange
  }
}
