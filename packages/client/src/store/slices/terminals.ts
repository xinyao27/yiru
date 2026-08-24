import type { StateCreator } from 'zustand'
// Why: import the store-free registry, not terminal-parked-tab-watchers —
// that module imports @/store, and a slice importing it would re-enter store
// creation before this slice finishes evaluating.

import type { AppState } from '../types'
import type { TerminalSlice } from './terminal-slice-state'
export type {
  AutomaticAgentResumeClaim,
  HydrateWorkspaceSessionOptions,
  TerminalSlice
} from './terminal-slice-state'
import { createTerminalCloseActions } from './terminal-close-actions'
import { createTerminalCreateActions } from './terminal-create-actions'
import { createTerminalHibernateActions } from './terminal-hibernate-actions'
import { createTerminalHydrationActions } from './terminal-hydration-actions'
import { createTerminalLayoutActions } from './terminal-layout-actions'
import { createTerminalOpenActions } from './terminal-open-actions'
import { createTerminalOrderActions } from './terminal-order-actions'
import { createTerminalPtyOwnershipActions } from './terminal-pty-ownership-actions'
import { createTerminalReconnectActions } from './terminal-reconnect-actions'
import { createTerminalSessionStateActions } from './terminal-session-state-actions'
import { createTerminalShutdownActions } from './terminal-shutdown-actions'
import { createTerminalStartupActions } from './terminal-startup-actions'
import { createTerminalTitleActions } from './terminal-title-actions'
import { createTerminalUnreadActions } from './terminal-unread-actions'
export { worktreeUsesRemoteConnection } from './terminal-runtime-model'

export const createTerminalSlice: StateCreator<AppState, [], [], TerminalSlice> = (set, get) => ({
  tabsByWorktree: {},
  activeTabId: null,
  activeTabIdByWorktree: {},
  ptyIdsByTabId: {},
  runtimePaneTitlesByTabId: {},
  unreadTerminalTabs: {},
  unreadTerminalPanes: {},
  unreadAgentCompletionPanes: {},
  suppressedPtyExitIds: {},
  pendingCodexPaneRestartIds: {},
  codexRestartNoticeByPtyId: {},
  expandedPaneByTabId: {},
  canExpandPaneByTabId: {},
  terminalLayoutsByTabId: {},
  pendingStartupByTabId: {},
  pendingInitialCwdByTabId: {},
  pendingSetupSplitByTabId: {},
  automaticAgentResumeClaimsByTabId: {},
  tabBarOrderByWorktree: {},
  workspaceSessionReady: false,
  restoredRuntimeHostIdByWorkspaceSessionKey: {},
  defaultTerminalTabsAppliedByWorktreeId: {},
  ...createTerminalSessionStateActions(set, get),
  hydrationSucceeded: false,
  pendingReconnectWorktreeIds: [],
  pendingReconnectTabByWorktree: {},
  pendingReconnectPtyIdByTabId: {},
  lastKnownRelayPtyIdByTabId: {},
  pendingSnapshotByPtyId: {},
  pendingColdRestoreByPtyId: {},
  deferredSshReconnectTargets: [],
  cacheTimerByKey: {},
  lastTerminalInputAtByPaneKey: {},
  recentQuickCommandIdByGroup: {},
  ...createTerminalCreateActions(set, get),

  ...createTerminalOpenActions(set, get),

  ...createTerminalCloseActions(set, get),

  ...createTerminalOrderActions(set, get),
  ...createTerminalTitleActions(set, get),
  ...createTerminalUnreadActions(set, get),
  ...createTerminalPtyOwnershipActions(set, get),
  ...createTerminalHibernateActions(set, get),

  ...createTerminalShutdownActions(set, get),

  ...createTerminalLayoutActions(set, get),
  ...createTerminalStartupActions(set, get),
  ...createTerminalHydrationActions(set, get),

  ...createTerminalReconnectActions(set, get)
})
