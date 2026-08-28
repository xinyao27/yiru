import type { StateCreator } from 'zustand'
import { extractIpcErrorMessage } from '~renderer/runtime/ipc-error'
import { publishRendererCommandResult } from '~renderer/runtime/renderer-command-result-channel'
import type { AppState } from '~renderer/store/types'

import { resolveEditorFileIdForOwner } from '../file-identity'
import type { OpenFile } from '../file-model'
import type { EditorFileSlice } from '../file-store'
import type { EditorSlice } from '../store-contract'
import { createUntitledMarkdownFileWithTemplateSelection } from '../untitled-markdown'
import { buildEditorActiveResult, openWorkspaceEditorItem } from '../workspace-editor-target'

type EditorMarkdownPreviewActions = Pick<
  EditorFileSlice,
  | 'openNewMarkdownInActiveWorkspace'
  | 'openMarkdownPreview'
  | 'makePreviewFilePermanent'
  | 'pinFile'
>

export function createEditorMarkdownPreviewActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorMarkdownPreviewActions {
  return {
    openNewMarkdownInActiveWorkspace: async (groupId) => {
      const state = get()
      const worktreeId = state.activeWorktreeId
      if (!worktreeId) {
        return
      }
      const worktree = state.getKnownWorktreeById(worktreeId)
      if (!worktree) {
        return
      }
      try {
        // Why: Repo.connectionId is dead — nothing sets it since remote hosts
        // were removed (#63) — a direct repo/worktree owner is never SSH.
        const fileInfo = await createUntitledMarkdownFileWithTemplateSelection(
          worktree.path,
          worktreeId,
          undefined,
          get().settings
        )
        if (!fileInfo) {
          return
        }
        get().openFile(fileInfo, { preview: false, targetGroupId: groupId })
        get().recordFeatureInteraction('markdown-file-created')
      } catch (err) {
        publishRendererCommandResult({
          type: 'editor-markdown-create-failed',
          error: extractIpcErrorMessage(err, 'Failed to create untitled markdown file.')
        })
      }
    },

    openMarkdownPreview: (file, options) => {
      const initialState = get()
      const resolvedRuntimeEnvironmentId =
        file.runtimeEnvironmentId === null
          ? null
          : (file.runtimeEnvironmentId ??
            initialState.settings?.activeRuntimeEnvironmentId?.trim() ??
            undefined)
      const sourceFileId =
        options?.sourceFileId ??
        resolveEditorFileIdForOwner(
          initialState,
          file.filePath,
          file.worktreeId,
          resolvedRuntimeEnvironmentId,
          ['edit']
        )
      const id = `markdown-preview::${sourceFileId}`
      const anchor = options?.anchor || undefined
      set((s) => {
        const existing = s.openFiles.find((openFile) => openFile.id === id)
        const worktreeId = file.worktreeId
        const runtimeEnvironmentId = resolvedRuntimeEnvironmentId
        const activeResult = buildEditorActiveResult(s, worktreeId, id)

        if (existing) {
          const needsUpdate =
            existing.relativePath !== file.relativePath ||
            existing.filePath !== file.filePath ||
            existing.language !== file.language ||
            existing.markdownPreviewSourceFileId !== sourceFileId ||
            existing.markdownPreviewAnchor !== anchor ||
            existing.mode !== 'markdown-preview'
          return needsUpdate
            ? {
                openFiles: s.openFiles.map((openFile) =>
                  openFile.id === id
                    ? {
                        ...openFile,
                        filePath: file.filePath,
                        relativePath: file.relativePath,
                        worktreeId: file.worktreeId,
                        language: file.language,
                        runtimeEnvironmentId,
                        markdownPreviewSourceFileId: sourceFileId,
                        markdownPreviewAnchor: anchor,
                        mode: 'markdown-preview' as const
                      }
                    : openFile
                ),
                ...activeResult
              }
            : activeResult
        }

        const newFile: OpenFile = {
          id,
          filePath: file.filePath,
          relativePath: file.relativePath,
          worktreeId: file.worktreeId,
          language: file.language,
          isDirty: false,
          runtimeEnvironmentId,
          markdownPreviewSourceFileId: sourceFileId,
          markdownPreviewAnchor: anchor,
          mode: 'markdown-preview'
        }

        return {
          openFiles: [...s.openFiles, newFile],
          ...activeResult
        }
      })
      void openWorkspaceEditorItem(
        get(),
        id,
        file.worktreeId,
        `${file.relativePath} (preview)`,
        'editor',
        false,
        options?.targetGroupId
      )
    },

    makePreviewFilePermanent: (fileId, tabId) => {
      set((s) => {
        let changed = false
        const openFiles = s.openFiles.map((file) => {
          if (file.id !== fileId || !file.isPreview) {
            return file
          }
          changed = true
          return { ...file, isPreview: undefined }
        })
        const unifiedTabsByWorktree: typeof s.unifiedTabsByWorktree = {}
        for (const [worktreeId, tabs] of Object.entries(s.unifiedTabsByWorktree ?? {})) {
          unifiedTabsByWorktree[worktreeId] = tabs.map((tab) => {
            if (tab.entityId !== fileId || (tabId && tab.id !== tabId) || !tab.isPreview) {
              return tab
            }
            changed = true
            return { ...tab, isPreview: false }
          })
        }
        return changed ? { openFiles, unifiedTabsByWorktree } : s
      })
    },

    pinFile: (fileId, tabId) => {
      get().makePreviewFilePermanent(fileId, tabId)
      const state = get()
      for (const tabs of Object.values(state.unifiedTabsByWorktree ?? {})) {
        for (const item of tabs) {
          if (item.entityId === fileId && (!tabId || item.id === tabId)) {
            state.pinTab?.(item.id)
          }
        }
      }
    }
  }
}
