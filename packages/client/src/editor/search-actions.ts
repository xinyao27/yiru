import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

import { createDefaultFileSearchState } from './search-defaults'
import type { EditorSearchSlice } from './search-store'
import type { EditorSlice } from './store-contract'

type EditorSearchActions = Omit<EditorSearchSlice, 'hydrateEditorSession'>

export function createEditorSearchActions(
  set: Parameters<StateCreator<AppState, [], [], EditorSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], EditorSlice>>[1]
): EditorSearchActions {
  return {
    fileSearchStateByWorktree: {},
    updateFileSearchState: (worktreeId, updates) =>
      set((s) => {
        const current = s.fileSearchStateByWorktree[worktreeId] || createDefaultFileSearchState()
        return {
          fileSearchStateByWorktree: {
            ...s.fileSearchStateByWorktree,
            [worktreeId]: { ...current, ...updates }
          }
        }
      }),
    seedFileSearchQuery: (worktreeId, query) =>
      set((s) => {
        const current = s.fileSearchStateByWorktree[worktreeId] || createDefaultFileSearchState()
        return {
          fileSearchStateByWorktree: {
            ...s.fileSearchStateByWorktree,
            [worktreeId]: {
              ...current,
              query,
              results: null,
              loading: false,
              collapsedFiles: new Set(),
              seedRequestId: (current.seedRequestId ?? 0) + 1
            }
          }
        }
      }),
    seedFileSearchIncludePattern: (worktreeId, includePattern) =>
      set((s) => {
        const current = s.fileSearchStateByWorktree[worktreeId] || createDefaultFileSearchState()
        return {
          fileSearchStateByWorktree: {
            ...s.fileSearchStateByWorktree,
            [worktreeId]: {
              ...current,
              includePattern,
              results: null,
              loading: false,
              collapsedFiles: new Set(),
              seedRequestId: (current.seedRequestId ?? 0) + 1
            }
          }
        }
      }),
    consumeFileSearchSeedRequest: (worktreeId, seedRequestId) =>
      set((s) => {
        const current = s.fileSearchStateByWorktree[worktreeId]
        if (!current || current.seedRequestId !== seedRequestId) {
          return s
        }
        const next = { ...current }
        delete next.seedRequestId
        return {
          fileSearchStateByWorktree: {
            ...s.fileSearchStateByWorktree,
            [worktreeId]: next
          }
        }
      }),
    toggleFileSearchCollapsedFile: (worktreeId, filePath) =>
      set((s) => {
        const current = s.fileSearchStateByWorktree[worktreeId]
        if (!current) {
          return s
        }
        const nextCollapsed = new Set(current.collapsedFiles)
        if (nextCollapsed.has(filePath)) {
          nextCollapsed.delete(filePath)
        } else {
          nextCollapsed.add(filePath)
        }
        return {
          fileSearchStateByWorktree: {
            ...s.fileSearchStateByWorktree,
            [worktreeId]: { ...current, collapsedFiles: nextCollapsed }
          }
        }
      }),
    clearFileSearch: (worktreeId) =>
      set((s) => {
        const current = s.fileSearchStateByWorktree[worktreeId]
        if (!current) {
          return s
        }
        return {
          fileSearchStateByWorktree: {
            ...s.fileSearchStateByWorktree,
            [worktreeId]: {
              ...current,
              query: '',
              results: null,
              loading: false,
              collapsedFiles: new Set()
            }
          }
        }
      }),

    // Editor navigation
    pendingEditorReveal: null,
    setPendingEditorReveal: (reveal) => set({ pendingEditorReveal: reveal })
  }
}
