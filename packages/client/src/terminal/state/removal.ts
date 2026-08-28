import type { TerminalSlice } from './slice-state'

type TerminalStateKey = {
  [Key in keyof TerminalSlice]: TerminalSlice[Key] extends (...args: never[]) => unknown
    ? never
    : Key
}[keyof TerminalSlice]

export type TerminalState = Pick<TerminalSlice, TerminalStateKey>

function removeRecordKey<Value>(values: Record<string, Value>, key: string): Record<string, Value> {
  if (!(key in values)) {
    return values
  }
  const next = { ...values }
  delete next[key]
  return next
}

function removeRecordPrefix<Value>(
  values: Record<string, Value>,
  prefix: string
): Record<string, Value> {
  let next = values
  for (const key of Object.keys(values)) {
    if (!key.startsWith(prefix)) {
      continue
    }
    if (next === values) {
      next = { ...values }
    }
    delete next[key]
  }
  return next
}

export function removeTabFromTerminalState(state: TerminalState, tabId: string): TerminalState {
  const tabsByWorktree = { ...state.tabsByWorktree }
  const activeTabIdByWorktree = { ...state.activeTabIdByWorktree }
  const tabBarOrderByWorktree = { ...state.tabBarOrderByWorktree }
  const pendingReconnectTabByWorktree = { ...state.pendingReconnectTabByWorktree }

  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
    const remainingTabs = tabs.filter((tab) => tab.id !== tabId)
    if (remainingTabs.length === tabs.length) {
      continue
    }
    tabsByWorktree[worktreeId] = remainingTabs
    if (activeTabIdByWorktree[worktreeId] === tabId) {
      activeTabIdByWorktree[worktreeId] = remainingTabs[0]?.id ?? null
    }
  }
  for (const [worktreeId, order] of Object.entries(tabBarOrderByWorktree)) {
    if (order.includes(tabId)) {
      tabBarOrderByWorktree[worktreeId] = order.filter((entryId) => entryId !== tabId)
    }
  }
  for (const [worktreeId, pendingTabIds] of Object.entries(pendingReconnectTabByWorktree)) {
    if (pendingTabIds.includes(tabId)) {
      pendingReconnectTabByWorktree[worktreeId] = pendingTabIds.filter(
        (entryId) => entryId !== tabId
      )
    }
  }

  const paneKeyPrefix = `${tabId}:`
  return {
    tabsByWorktree,
    activeTabId: state.activeTabId === tabId ? null : state.activeTabId,
    activeTabIdByWorktree,
    ptyIdsByTabId: removeRecordKey(state.ptyIdsByTabId, tabId),
    runtimePaneTitlesByTabId: removeRecordKey(state.runtimePaneTitlesByTabId, tabId),
    unreadTerminalTabs: removeRecordKey(state.unreadTerminalTabs, tabId),
    unreadTerminalPanes: removeRecordPrefix(state.unreadTerminalPanes, paneKeyPrefix),
    unreadAgentCompletionPanes: removeRecordPrefix(state.unreadAgentCompletionPanes, paneKeyPrefix),
    suppressedPtyExitIds: state.suppressedPtyExitIds,
    pendingCodexPaneRestartIds: state.pendingCodexPaneRestartIds,
    codexRestartNoticeByPtyId: state.codexRestartNoticeByPtyId,
    expandedPaneByTabId: removeRecordKey(state.expandedPaneByTabId, tabId),
    canExpandPaneByTabId: removeRecordKey(state.canExpandPaneByTabId, tabId),
    terminalLayoutsByTabId: removeRecordKey(state.terminalLayoutsByTabId, tabId),
    recentQuickCommandIdByGroup: state.recentQuickCommandIdByGroup,
    automaticAgentResumeClaimsByTabId: removeRecordKey(
      state.automaticAgentResumeClaimsByTabId,
      tabId
    ),
    pendingStartupByTabId: removeRecordKey(state.pendingStartupByTabId, tabId),
    pendingInitialCwdByTabId: removeRecordKey(state.pendingInitialCwdByTabId, tabId),
    pendingSetupSplitByTabId: removeRecordKey(state.pendingSetupSplitByTabId, tabId),
    tabBarOrderByWorktree,
    workspaceSessionReady: state.workspaceSessionReady,
    restoredRuntimeHostIdByWorkspaceSessionKey: state.restoredRuntimeHostIdByWorkspaceSessionKey,
    defaultTerminalTabsAppliedByWorktreeId: state.defaultTerminalTabsAppliedByWorktreeId,
    hydrationSucceeded: state.hydrationSucceeded,
    pendingReconnectWorktreeIds: state.pendingReconnectWorktreeIds,
    pendingReconnectTabByWorktree,
    pendingReconnectPtyIdByTabId: removeRecordKey(state.pendingReconnectPtyIdByTabId, tabId),
    lastKnownRelayPtyIdByTabId: removeRecordKey(state.lastKnownRelayPtyIdByTabId, tabId),
    pendingSnapshotByPtyId: state.pendingSnapshotByPtyId,
    pendingColdRestoreByPtyId: state.pendingColdRestoreByPtyId,
    cacheTimerByKey: removeRecordPrefix(state.cacheTimerByKey, paneKeyPrefix),
    lastTerminalInputAtByPaneKey: removeRecordPrefix(
      state.lastTerminalInputAtByPaneKey,
      paneKeyPrefix
    ),
    deferredSshReconnectTargets: state.deferredSshReconnectTargets
  }
}
