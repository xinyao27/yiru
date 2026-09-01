import type { StateCreator } from 'zustand'
import { notifyHostOfMirroredEditorClose } from '~renderer/runtime/close-mirrored-editor-tab'
import type { AppState } from '~renderer/store/types'
import { pushRecentlyClosedTabKind } from '~renderer/tab-bar/state/recently-closed'

import { MAX_RECENT_CLOSED_EDITOR_TABS, type ClosedEditorTabSnapshot } from './file-model'
import type { EditorFileSlice } from './file-store'
import type { EditorSlice } from './store-contract'
import { deleteUntouchedUntitledFile, shouldDeleteUntouchedUntitledFile } from './untitled-cleanup'

type EditorBulkCloseActions = Pick<EditorFileSlice, 'reopenClosedEditorTab' | 'closeAllFiles'>

export function createEditorBulkCloseActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorBulkCloseActions {
  return {
    reopenClosedEditorTab: (worktreeId) => {
      const stack = get().recentlyClosedEditorTabsByWorktree[worktreeId] ?? []
      const next = stack[0]
      if (!next) {
        return false
      }
      set((s) => ({
        recentlyClosedEditorTabsByWorktree: {
          ...s.recentlyClosedEditorTabsByWorktree,
          [worktreeId]: (s.recentlyClosedEditorTabsByWorktree[worktreeId] ?? []).slice(1)
        }
      }))
      get().openFile(next)
      return true
    },

    closeAllFiles: () => {
      const state = get()
      const activeWorktreeId = state.activeWorktreeId

      // Why: same rationale as closeFile — untitled files that were never edited
      // are empty placeholders that should not survive a "close all" operation.
      const untitledToDelete = state.openFiles.filter(
        (f) =>
          shouldDeleteUntouchedUntitledFile(f, !!state.editorDrafts[f.id]) &&
          (!activeWorktreeId || f.worktreeId === activeWorktreeId)
      )
      const closingFiles = state.openFiles.filter(
        (file) => !activeWorktreeId || file.worktreeId === activeWorktreeId
      )
      // Why: close-all bypasses closeFile's per-tab path, so mirrored host-owned
      // editors must be notified here or the next host snapshot reopens them.
      for (const file of closingFiles) {
        notifyHostOfMirroredEditorClose(state, file.worktreeId, file.id)
      }

      const closingItemIds = Object.values(state.unifiedTabsByWorktree ?? {})
        .flat()
        .filter(
          (item) =>
            (item.contentType === 'editor' ||
              item.contentType === 'diff' ||
              item.contentType === 'conflict-review' ||
              item.contentType === 'check-details') &&
            (!activeWorktreeId || item.worktreeId === activeWorktreeId)
        )
        .map((item) => item.id)
      set((s) => {
        const activeWorktreeId = s.activeWorktreeId
        if (!activeWorktreeId) {
          return {
            openFiles: [],
            editorDrafts: {},
            editorCursorLine: {},
            activeFileId: null,
            activeTabType: 'terminal',
            markdownViewMode: {},
            editorViewMode: {},
            markdownFrontmatterVisible: {},
            markdownTableOfContentsVisible: {},
            pendingEditorReveal: null
          }
        }
        // Only close files for the current worktree
        const newFiles = s.openFiles.filter((f) => f.worktreeId !== activeWorktreeId)
        const remainingFileIds = new Set(newFiles.map((f) => f.id))
        const newEditorDrafts = Object.fromEntries(
          Object.entries(s.editorDrafts).filter(([fileId]) => remainingFileIds.has(fileId))
        )
        const newMarkdownViewMode = Object.fromEntries(
          Object.entries(s.markdownViewMode).filter(([fileId]) => remainingFileIds.has(fileId))
        )
        const newEditorViewMode = Object.fromEntries(
          Object.entries(s.editorViewMode).filter(([fileId]) => remainingFileIds.has(fileId))
        )
        const newMarkdownFrontmatterVisible = Object.fromEntries(
          Object.entries(s.markdownFrontmatterVisible).filter(([fileId]) =>
            remainingFileIds.has(fileId)
          )
        )
        const newMarkdownTableOfContentsVisible = Object.fromEntries(
          Object.entries(s.markdownTableOfContentsVisible).filter(([fileId]) =>
            remainingFileIds.has(fileId)
          )
        )
        const newEditorCursorLine = Object.fromEntries(
          Object.entries(s.editorCursorLine).filter(([fileId]) => remainingFileIds.has(fileId))
        )
        const newActiveFileIdByWorktree = { ...s.activeFileIdByWorktree }
        delete newActiveFileIdByWorktree[activeWorktreeId]
        const newActiveTabTypeByWorktree = { ...s.activeTabTypeByWorktree }
        const browserTabsForWorktree = s.browserTabsByWorktree[activeWorktreeId] ?? []
        const terminalTabsForWorktree = s.tabsByWorktree[activeWorktreeId] ?? []
        newActiveTabTypeByWorktree[activeWorktreeId] =
          browserTabsForWorktree.length > 0 ? 'browser' : 'terminal'
        const shouldDeactivateWorktree =
          browserTabsForWorktree.length === 0 && terminalTabsForWorktree.length === 0

        // Why: mirrored editor tabs use host tab ids in tab order, while local
        // editor entries may still use file ids. Remove both close-all shapes.
        const closedFileIds = new Set(
          s.openFiles.filter((f) => f.worktreeId === activeWorktreeId).map((f) => f.id)
        )
        const closedTabOrderIds = new Set([...closedFileIds, ...closingItemIds])
        const nextTabBarOrderByWorktree = s.tabBarOrderByWorktree
          ? {
              ...s.tabBarOrderByWorktree,
              [activeWorktreeId]: (s.tabBarOrderByWorktree[activeWorktreeId] ?? []).filter(
                (entryId) => !closedTabOrderIds.has(entryId)
              )
            }
          : s.tabBarOrderByWorktree

        const closingFiles = s.openFiles.filter((f) => f.worktreeId === activeWorktreeId)
        let nextRecentClosed = s.recentlyClosedEditorTabsByWorktree[activeWorktreeId] ?? []
        let capturedCloseCount = 0
        for (const f of [...closingFiles].toReversed()) {
          // Why: untitled non-dirty files are deleted from disk after close —
          // skip them so the reopen stack doesn't reference vanished paths.
          // Preview tabs are ephemeral views that shouldn't pollute the stack.
          if (
            shouldDeleteUntouchedUntitledFile(f, !!s.editorDrafts[f.id]) ||
            f.mode === 'markdown-preview'
          ) {
            continue
          }
          const { id: _id, isDirty: _dirty, mirroredFromRuntimeSession: _mirrored, ...snap } = f
          nextRecentClosed = [snap as ClosedEditorTabSnapshot, ...nextRecentClosed].slice(
            0,
            MAX_RECENT_CLOSED_EDITOR_TABS
          )
          capturedCloseCount += 1
        }

        return {
          openFiles: newFiles,
          editorDrafts: newEditorDrafts,
          editorCursorLine: newEditorCursorLine,
          activeFileId: null,
          // Why: closing every editor in the active worktree can leave no
          // renderable surface at all. Clear the active worktree in that case so
          // the renderer shows the landing page instead of a blank workspace.
          activeWorktreeId: shouldDeactivateWorktree ? null : s.activeWorktreeId,
          activeBrowserTabId: shouldDeactivateWorktree
            ? null
            : browserTabsForWorktree.length > 0
              ? (s.activeBrowserTabIdByWorktree[activeWorktreeId] ??
                browserTabsForWorktree[0]?.id ??
                null)
              : s.activeBrowserTabId,
          activeTabType: browserTabsForWorktree.length > 0 ? 'browser' : 'terminal',
          markdownViewMode: newMarkdownViewMode,
          editorViewMode: newEditorViewMode,
          markdownFrontmatterVisible: newMarkdownFrontmatterVisible,
          markdownTableOfContentsVisible: newMarkdownTableOfContentsVisible,
          activeFileIdByWorktree: newActiveFileIdByWorktree,
          activeTabTypeByWorktree: newActiveTabTypeByWorktree,
          tabBarOrderByWorktree: nextTabBarOrderByWorktree,
          // Why: search-result navigation queues a one-shot reveal for the next
          // editor mount. If the worktree closes all editor tabs before that
          // reveal is consumed, keeping it around would make a later reopen jump
          // to an old match unexpectedly.
          pendingEditorReveal: null,
          recentlyClosedEditorTabsByWorktree: {
            ...s.recentlyClosedEditorTabsByWorktree,
            [activeWorktreeId]: nextRecentClosed
          },
          recentlyClosedTabKindsByWorktree: pushRecentlyClosedTabKind(
            s.recentlyClosedTabKindsByWorktree,
            activeWorktreeId,
            'editor',
            capturedCloseCount
          )
        }
      })
      if (typeof window !== 'undefined') {
        const postCloseState = get()
        for (const f of untitledToDelete) {
          deleteUntouchedUntitledFile(postCloseState, f)
        }
      }
      for (const itemId of closingItemIds) {
        get().closeUnifiedTab?.(itemId)
      }
    }
  }
}
