import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import type { OpenFile } from './file-model'
import type { EditorFileSlice } from './file-store'
import type { EditorSlice } from './store-contract'
import { isEditorTabContentType } from './workspace-editor-target'

type EditorFileMetadataActions = Pick<
  EditorFileSlice,
  | 'setActiveFile'
  | 'reorderFiles'
  | 'markFileDirty'
  | 'setExternalMutation'
  | 'setLastKnownDiskSignature'
  | 'clearPendingDiskBaselineVerification'
  | 'clearUntitled'
>

export function createEditorFileMetadataActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorFileMetadataActions {
  return {
    setActiveFile: (fileId) => {
      set((s) => {
        const file = s.openFiles.find((f) => f.id === fileId)
        const worktreeId = file?.worktreeId
        return {
          activeFileId: fileId,
          activeFileIdByWorktree: worktreeId
            ? { ...s.activeFileIdByWorktree, [worktreeId]: fileId }
            : s.activeFileIdByWorktree
        }
      })
      const state = get()
      const worktreeId = state.activeWorktreeId
      if (!worktreeId) {
        return
      }
      const groupId =
        state.activeGroupIdByWorktree?.[worktreeId] ?? state.groupsByWorktree?.[worktreeId]?.[0]?.id
      if (!groupId) {
        return
      }
      const item =
        state.findTabForEntityInGroup?.(worktreeId, groupId, fileId, 'editor') ??
        state.findTabForEntityInGroup?.(worktreeId, groupId, fileId, 'diff') ??
        state.findTabForEntityInGroup?.(worktreeId, groupId, fileId, 'conflict-review')
      if (item) {
        state.activateTab?.(item.id)
      }
    },

    reorderFiles: (fileIds) =>
      set((s) => {
        const reorderedSet = new Set(fileIds)
        const byId = new Map(s.openFiles.map((f) => [f.id, f]))
        const reordered = fileIds.map((id) => byId.get(id)).filter(Boolean) as OpenFile[]
        // Replace the reordered subset in-place: keep other-worktree files at their positions
        const result: OpenFile[] = []
        let ri = 0
        for (const f of s.openFiles) {
          if (reorderedSet.has(f.id)) {
            result.push(reordered[ri++])
          } else {
            result.push(f)
          }
        }
        return { openFiles: result }
      }),

    markFileDirty: (fileId, dirty) =>
      set((s) => {
        // Why: typing fires this on every keystroke. Rebuilding openFiles
        // unconditionally thrashes every subscriber (EditorPanel → EditorContent
        // → MonacoEditor re-renders) and produced visible typing lag. Bail out
        // when the dirty bit is already the target value and the preview-promote
        // side effect is a no-op.
        const file = s.openFiles.find((f) => f.id === fileId)
        if (!file) {
          return s
        }
        // Why: read-only tabs can never become dirty; a mutation path that reached
        // here (stray change/save callback) must hard no-op the integrity invariant.
        if (file.readOnly === true) {
          return s
        }
        const needsPreviewClear = dirty && file.isPreview
        if (file.isDirty === dirty && !needsPreviewClear) {
          return s
        }
        const nextOpenFiles = s.openFiles.map((f) =>
          f.id === fileId
            ? { ...f, isDirty: dirty, ...(needsPreviewClear ? { isPreview: undefined } : {}) }
            : f
        )
        return {
          openFiles: nextOpenFiles,
          ...(needsPreviewClear
            ? {
                unifiedTabsByWorktree: Object.fromEntries(
                  Object.entries(s.unifiedTabsByWorktree ?? {}).map(([worktreeId, tabs]) => [
                    worktreeId,
                    tabs.map((tab) =>
                      tab.entityId === fileId && isEditorTabContentType(tab.contentType)
                        ? { ...tab, isPreview: false }
                        : tab
                    )
                  ])
                )
              }
            : {})
        }
      }),

    setExternalMutation: (fileId, mutation) =>
      set((s) => {
        const file = s.openFiles.find((f) => f.id === fileId)
        if (!file) {
          return s
        }
        const next = mutation ?? undefined
        if (file.externalMutation === next) {
          return s
        }
        return {
          openFiles: s.openFiles.map((f) =>
            f.id === fileId ? { ...f, externalMutation: next } : f
          )
        }
      }),

    setLastKnownDiskSignature: (fileId, signature) =>
      set((s) => {
        const file = s.openFiles.find((f) => f.id === fileId)
        if (!file || file.lastKnownDiskSignature === signature) {
          return s
        }
        return {
          openFiles: s.openFiles.map((f) =>
            f.id === fileId ? { ...f, lastKnownDiskSignature: signature } : f
          )
        }
      }),

    clearPendingDiskBaselineVerification: (fileId) =>
      set((s) => {
        const file = s.openFiles.find((f) => f.id === fileId)
        if (!file?.pendingDiskBaselineVerification) {
          return s
        }
        return {
          openFiles: s.openFiles.map((f) =>
            f.id === fileId ? { ...f, pendingDiskBaselineVerification: undefined } : f
          )
        }
      }),

    clearUntitled: (fileId) =>
      set((s) => ({
        openFiles: s.openFiles.map((f) => (f.id === fileId ? { ...f, isUntitled: undefined } : f))
      }))
  }
}
