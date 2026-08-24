import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import type { UISlice } from './ui'

export function createUIRevealActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'revealWorktreeInSidebar'
  | 'revealSidebarRow'
  | 'clearPendingRevealWorktreeId'
  | 'clearPendingRevealSidebarRow'
  | 'setScrollToDiffCommentId'
  | 'setUIZoomLevel'
  | 'setEditorFontZoomLevel'
> {
  return {
    revealWorktreeInSidebar: (worktreeId, options) =>
      set({
        pendingRevealWorktree: {
          worktreeId,
          behavior: options?.behavior ?? 'smooth',
          ...(options?.highlight ? { highlight: true } : {}),
          ...(options?.beginRename ? { beginRename: true } : {})
        }
      }),
    revealSidebarRow: (rowKey, options) =>
      set({
        pendingRevealSidebarRow: {
          rowKey,
          behavior: options?.behavior ?? 'smooth',
          ...(options?.highlight === false ? {} : { highlight: true })
        }
      }),
    clearPendingRevealWorktreeId: () => set({ pendingRevealWorktree: null }),
    clearPendingRevealSidebarRow: () => set({ pendingRevealSidebarRow: null }),
    setScrollToDiffCommentId: (id) => set({ scrollToDiffCommentId: id }),
    setUIZoomLevel: (level) => set({ uiZoomLevel: level }),
    setEditorFontZoomLevel: (level) => set({ editorFontZoomLevel: level })
  }
}
