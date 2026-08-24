import type { StateCreator } from 'zustand'

import type { AppState } from '../types'
import { getActivationSpawnSuppression } from './worktree-refresh-model'
import type { WorktreeSlice } from './worktree-state'

export function createWorktreeRecoveryActions(
  set: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[0],
  _get: Parameters<StateCreator<AppState, [], [], WorktreeSlice>>[1]
): Pick<WorktreeSlice, 'setRenamingWorktreeId' | 'remountTerminalTabForRecovery'> {
  return {
    setRenamingWorktreeId: (request) => {
      set({
        renamingWorktreeId: typeof request === 'string' ? { worktreeId: request } : request
      })
    },
    remountTerminalTabForRecovery: (tabId) => {
      let remounted = false
      set((s) => {
        for (const [worktreeId, tabs] of Object.entries(s.tabsByWorktree)) {
          const index = tabs.findIndex((tab) => tab.id === tabId)
          if (index < 0) {
            continue
          }
          const tab = tabs[index]
          const nextTabs = tabs.slice()
          nextTabs[index] = {
            ...tab,
            // Why: TerminalPane keys on `${tab.id}-${generation}` — the bump is
            // the remount. Same mechanism as the dead-transport activation bump
            // above; here it is health-driven for a pane whose renderer died
            // while its PTY stayed alive (wedged/disposed xterm, unbound
            // transport), so the remounted pane reattaches instead of spawning.
            generation: (tab.generation ?? 0) + 1,
            // Why: recovery is not a user interaction — suppress the resulting
            // PTY updates from reshuffling Recent, like activation remounts do.
            pendingActivationSpawn: getActivationSpawnSuppression(s.terminalLayoutsByTabId[tab.id])
          }
          remounted = true
          return {
            tabsByWorktree: {
              ...s.tabsByWorktree,
              [worktreeId]: nextTabs
            }
          }
        }
        return {}
      })
      return remounted
    }
  }
}
