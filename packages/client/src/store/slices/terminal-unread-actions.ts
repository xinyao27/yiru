import type { StateCreator } from 'zustand'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { scheduleRuntimeGraphSync } from '~renderer/runtime/sync-runtime-graph'
import { setWebSessionTabPropsCommand } from '~renderer/runtime/web-session-commands'

import type { AppState } from '../types'
import type { TerminalSlice } from './terminals'

export function createTerminalUnreadActions(
  set: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], TerminalSlice>>[1]
): Pick<
  TerminalSlice,
  | 'markTerminalTabUnread'
  | 'markTerminalPaneUnread'
  | 'markAgentCompletionPaneUnread'
  | 'clearTerminalTabUnread'
  | 'clearTerminalPaneUnread'
  | 'setTabCustomTitle'
  | 'setTabColor'
> {
  return {
    markTerminalTabUnread: (tabId) => {
      const state = get()
      const ownerTab = Object.values(state.tabsByWorktree ?? {})
        .flat()
        .find((t) => t.id === tabId)
      if (!ownerTab) {
        return
      }
      // Why: terminal attention must stay visible until interaction ("show
      // until interact"). A signal on the focused tab still sets the indicator;
      // real user interaction with the pane dismisses it. Keystroke/pointerdown
      // routes through clearTerminalTabUnread (see pty-connection.ts and
      // terminal-pane.tsx); tab/group activation clears unreadTerminalTabs
      // directly in activateTab/focusGroup as a pre-existing side-effect.
      set((s) => {
        if (s.unreadTerminalTabs[tabId]) {
          return s
        }
        return { unreadTerminalTabs: { ...s.unreadTerminalTabs, [tabId]: true as const } }
      })
    },
    markTerminalPaneUnread: (paneKey) => {
      set((s) => {
        if (s.unreadTerminalPanes[paneKey]) {
          return s
        }
        return { unreadTerminalPanes: { ...s.unreadTerminalPanes, [paneKey]: true as const } }
      })
    },
    markAgentCompletionPaneUnread: (paneKey) => {
      set((s) => {
        if (s.unreadAgentCompletionPanes[paneKey]) {
          return s
        }
        return {
          unreadAgentCompletionPanes: {
            ...s.unreadAgentCompletionPanes,
            [paneKey]: true as const
          }
        }
      })
    },
    clearTerminalTabUnread: (tabId) => {
      set((s) => {
        if (!s.unreadTerminalTabs[tabId]) {
          return s
        }
        const copy = { ...s.unreadTerminalTabs }
        delete copy[tabId]
        return { unreadTerminalTabs: copy }
      })
    },
    clearTerminalPaneUnread: (paneKey) => {
      set((s) => {
        if (!s.unreadTerminalPanes[paneKey] && !s.unreadAgentCompletionPanes[paneKey]) {
          return s
        }
        const nextUnreadTerminalPanes = { ...s.unreadTerminalPanes }
        const nextUnreadAgentCompletionPanes = { ...s.unreadAgentCompletionPanes }
        delete nextUnreadTerminalPanes[paneKey]
        delete nextUnreadAgentCompletionPanes[paneKey]
        return {
          unreadTerminalPanes: nextUnreadTerminalPanes,
          unreadAgentCompletionPanes: nextUnreadAgentCompletionPanes
        }
      })
    },
    setTabCustomTitle: (tabId, title, opts) => {
      set((s) => {
        const next = { ...s.tabsByWorktree }
        for (const wId of Object.keys(next)) {
          next[wId] = next[wId].map((t) => (t.id === tabId ? { ...t, customTitle: title } : t))
        }
        scheduleRuntimeGraphSync()
        return { tabsByWorktree: next }
      })
      const item = Object.values(get().unifiedTabsByWorktree)
        .flat()
        .find((entry) => entry.contentType === 'terminal' && entry.entityId === tabId)
      if (item) {
        get().setTabCustomLabel(item.id, title, opts)
      }
    },
    setTabColor: (tabId, color) => {
      set((s) => {
        const next = { ...s.tabsByWorktree }
        for (const wId of Object.keys(next)) {
          next[wId] = next[wId].map((t) => (t.id === tabId ? { ...t, color } : t))
        }
        return { tabsByWorktree: next }
      })
      const item = Object.values(get().unifiedTabsByWorktree)
        .flat()
        .find((entry) => entry.contentType === 'terminal' && entry.entityId === tabId)
      if (item) {
        get().setUnifiedTabColor(item.id, color)
        // Why: tab color is host-authoritative for remote-server tabs; mirror it
        // so it persists instead of reverting on the next snapshot.
        const state = get()
        const owningWorktreeId = Object.keys(state.unifiedTabsByWorktree).find((wId) =>
          (state.unifiedTabsByWorktree[wId] ?? []).some((entry) => entry.id === item.id)
        )
        const environmentId = owningWorktreeId
          ? getRuntimeEnvironmentIdForWorktree(state, owningWorktreeId)
          : null
        if (owningWorktreeId && environmentId) {
          setWebSessionTabPropsCommand({
            environmentId,
            worktreeId: owningWorktreeId,
            tabId: item.id,
            color
          })
        }
      }
    }
  }
}
