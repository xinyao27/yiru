import type { StateCreator } from 'zustand'
import { createRemoteSessionTerminalCommand } from '~renderer/runtime/remote-session/commands'
import { requestRemoteSessionTabsRefresh } from '~renderer/runtime/remote-session/tabs-refresh-requests'
import { focusTerminalTabSurface } from '~renderer/tab-bar/focus-terminal-surface'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import type { AppState } from '../../store/types'
import type { TerminalSlice } from './slice'

export function createTerminalOpenActions(
  _set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<TerminalSlice, 'openNewTerminalTabInActiveWorkspace'> {
  return {
    openNewTerminalTabInActiveWorkspace: async (groupId) => {
      const state = get()
      const worktreeId = state.activeWorktreeId
      if (!worktreeId) {
        return
      }
      const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
      if (runtimeEnvironmentId) {
        const result = await createRemoteSessionTerminalCommand({
          worktreeId,
          environmentId: runtimeEnvironmentId,
          targetGroupId: groupId,
          activate: true
        })
        if (result.status === 'failed') {
          console.warn(
            '[terminal] remote terminal creation failed:',
            result.error instanceof Error ? result.error.message : String(result.error)
          )
        } else {
          await requestRemoteSessionTabsRefresh({
            environmentId: runtimeEnvironmentId,
            worktreeId
          })
        }
        return
      }
      const terminal = get().createTab(worktreeId, groupId)
      get().setActiveTab(terminal.id)
      get().setActiveTabType('terminal')
      const latest = get()
      const currentTerminals = latest.tabsByWorktree[worktreeId] ?? []
      const currentEditors = latest.openFiles.filter((file) => file.worktreeId === worktreeId)
      const currentBrowsers = latest.browserTabsByWorktree[worktreeId] ?? []
      const stored = latest.tabBarOrderByWorktree[worktreeId]
      const validIds = new Set([
        ...currentTerminals.map((tab) => tab.id),
        ...currentEditors.map((file) => file.id),
        ...currentBrowsers.map((tab) => tab.id)
      ])
      const base = (stored ?? []).filter((id) => validIds.has(id))
      const inBase = new Set(base)
      for (const id of validIds) {
        if (!inBase.has(id)) {
          base.push(id)
        }
      }
      // Why: the Command Palette uses the same creation path as the titlebar button, so a new
      // terminal should append after mixed editor/browser tabs rather than jump first.
      get().setTabBarOrder(worktreeId, [...base.filter((id) => id !== terminal.id), terminal.id])
      focusTerminalTabSurface(terminal.id)
    }
  }
}
