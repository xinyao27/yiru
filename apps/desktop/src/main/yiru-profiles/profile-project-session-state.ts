import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { WorkspaceSessionState } from '../../shared/types'

export {
  removeRepoFromHostWorkspaceSessions,
  removeRepoFromWorkspaceSession
} from '../persisted-state/workspace-session-owner-removal'

export function mergeHostWorkspaceSessions(
  existing: Partial<Record<ExecutionHostId, WorkspaceSessionState>> | undefined,
  incoming: Partial<Record<ExecutionHostId, WorkspaceSessionState>>
): Partial<Record<ExecutionHostId, WorkspaceSessionState>> {
  const next: Partial<Record<ExecutionHostId, WorkspaceSessionState>> = { ...existing }
  for (const [hostId, session] of Object.entries(incoming)) {
    if (!session) {
      continue
    }
    next[hostId as ExecutionHostId] = mergeWorkspaceSessions(
      next[hostId as ExecutionHostId],
      session
    )
  }
  return next
}

export function mergeWorkspaceSessions(
  existing: WorkspaceSessionState | undefined,
  incoming: WorkspaceSessionState
): WorkspaceSessionState {
  const base = existing ?? getDefaultWorkspaceSession()
  return {
    ...base,
    tabsByWorktree: { ...base.tabsByWorktree, ...incoming.tabsByWorktree },
    terminalLayoutsByTabId: {
      ...base.terminalLayoutsByTabId,
      ...incoming.terminalLayoutsByTabId
    },
    openFilesByWorktree: { ...base.openFilesByWorktree, ...incoming.openFilesByWorktree },
    browserTabsByWorktree: {
      ...base.browserTabsByWorktree,
      ...incoming.browserTabsByWorktree
    },
    browserPagesByWorkspace: {
      ...base.browserPagesByWorkspace,
      ...incoming.browserPagesByWorkspace
    },
    activeBrowserTabIdByWorktree: {
      ...base.activeBrowserTabIdByWorktree,
      ...incoming.activeBrowserTabIdByWorktree
    },
    activeFileIdByWorktree: {
      ...base.activeFileIdByWorktree,
      ...incoming.activeFileIdByWorktree
    },
    activeTabTypeByWorktree: {
      ...base.activeTabTypeByWorktree,
      ...incoming.activeTabTypeByWorktree
    },
    activeTabIdByWorktree: { ...base.activeTabIdByWorktree, ...incoming.activeTabIdByWorktree },
    unifiedTabs: { ...base.unifiedTabs, ...incoming.unifiedTabs },
    tabGroups: { ...base.tabGroups, ...incoming.tabGroups },
    tabGroupLayouts: { ...base.tabGroupLayouts, ...incoming.tabGroupLayouts },
    activeGroupIdByWorktree: {
      ...base.activeGroupIdByWorktree,
      ...incoming.activeGroupIdByWorktree
    },
    lastVisitedAtByWorktreeId: {
      ...base.lastVisitedAtByWorktreeId,
      ...incoming.lastVisitedAtByWorktreeId
    },
    defaultTerminalTabsAppliedByWorktreeId: {
      ...base.defaultTerminalTabsAppliedByWorktreeId,
      ...incoming.defaultTerminalTabsAppliedByWorktreeId
    },
    activeWorktreeIdsOnShutdown: [
      ...(base.activeWorktreeIdsOnShutdown ?? []),
      ...(incoming.activeWorktreeIdsOnShutdown ?? [])
    ],
    activeWorktreeId: base.activeWorktreeId ?? incoming.activeWorktreeId,
    activeWorkspaceKey: base.activeWorkspaceKey ?? incoming.activeWorkspaceKey,
    activeTabId: base.activeTabId ?? incoming.activeTabId
  }
}
