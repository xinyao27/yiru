import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import type { WorktreeSlice } from './types'

export function createWorktreePendingCreationActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<
  WorktreeSlice,
  | 'beginPendingWorktreeCreation'
  | 'updatePendingWorktreeCreation'
  | 'removePendingWorktreeCreation'
  | 'setActivePendingWorktreeCreation'
> {
  return {
    beginPendingWorktreeCreation: (entry) => {
      set((s) => ({
        pendingWorktreeCreations: { ...s.pendingWorktreeCreations, [entry.creationId]: entry },
        activePendingCreationId: entry.creationId
      }))
    },
    updatePendingWorktreeCreation: (creationId, patch) => {
      set((s) => {
        const entry = s.pendingWorktreeCreations[creationId]
        if (!entry) {
          return {}
        }
        // Why: the main process re-emits the same phase across mutually-exclusive
        // fetch paths; skip the write when nothing changes so the strip and panel
        // don't re-render on a no-op progress event.
        const hasChange = (Object.keys(patch) as (keyof typeof patch)[]).some(
          (key) => patch[key] !== entry[key]
        )
        if (!hasChange) {
          return {}
        }
        return {
          pendingWorktreeCreations: {
            ...s.pendingWorktreeCreations,
            [creationId]: { ...entry, ...patch }
          }
        }
      })
    },
    removePendingWorktreeCreation: (creationId) => {
      set((s) => {
        if (!s.pendingWorktreeCreations[creationId]) {
          return {}
        }
        const { [creationId]: _removed, ...rest } = s.pendingWorktreeCreations
        return {
          pendingWorktreeCreations: rest,
          // Why: only clear the active surface if it pointed here, so dismissing a
          // background creation the user already navigated away from doesn't yank
          // them off whatever they're now looking at.
          ...(s.activePendingCreationId === creationId ? { activePendingCreationId: null } : {})
        }
      })
    },
    setActivePendingWorktreeCreation: (creationId) => {
      set((s) => {
        if (creationId !== null && !s.pendingWorktreeCreations[creationId]) {
          return {}
        }
        return { activePendingCreationId: creationId }
      })
    }
  }
}
