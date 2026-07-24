import {
  LOCAL_EXECUTION_HOST_ID,
  WORKTREE_ID_SEPARATOR,
  type ExecutionHostId
} from '@yiru/workbench-model/workspace'

import { getDefaultWorkspaceSession } from '../../shared/constants'
import type { WorkspaceSessionState } from '../../shared/types'
import { parseWorkspaceKey } from '../../shared/workspace-scope'

type HostWorkspaceSessions = Partial<Record<ExecutionHostId, WorkspaceSessionState>>

function ownerKeyBelongsToRepo(ownerKey: string, repoId: string): boolean {
  const scope = parseWorkspaceKey(ownerKey)
  const worktreeId = scope?.type === 'worktree' ? scope.worktreeId : ownerKey
  return worktreeId === repoId || worktreeId.startsWith(`${repoId}${WORKTREE_ID_SEPARATOR}`)
}

function deleteMatchingOwnerKeys<T>(
  record: Record<string, T> | undefined,
  isRemovedOwner: (ownerKey: string) => boolean
): void {
  for (const ownerKey of Object.keys(record ?? {})) {
    if (isRemovedOwner(ownerKey)) {
      delete record![ownerKey]
    }
  }
}

function removeWorkspaceSessionOwnersMatching(
  session: WorkspaceSessionState | undefined,
  isRemovedOwner: (ownerKey: string) => boolean
): WorkspaceSessionState | undefined {
  if (!session) {
    return session
  }

  const next = structuredClone(session)
  for (const [ownerKey, tabs] of Object.entries(next.tabsByWorktree)) {
    if (!isRemovedOwner(ownerKey)) {
      continue
    }
    delete next.tabsByWorktree[ownerKey]
    for (const tab of tabs) {
      delete next.terminalLayoutsByTabId[tab.id]
      delete next.remoteSessionIdsByTabId?.[tab.id]
      if (next.activeTabId === tab.id) {
        next.activeTabId = null
      }
    }
  }

  deleteMatchingOwnerKeys(next.openFilesByWorktree, isRemovedOwner)
  deleteMatchingOwnerKeys(next.activeFileIdByWorktree, isRemovedOwner)
  for (const [ownerKey, browserWorkspaces] of Object.entries(next.browserTabsByWorktree ?? {})) {
    if (!isRemovedOwner(ownerKey)) {
      continue
    }
    delete next.browserTabsByWorktree![ownerKey]
    for (const workspace of browserWorkspaces) {
      delete next.browserPagesByWorkspace?.[workspace.id]
    }
  }
  deleteMatchingOwnerKeys(next.activeBrowserTabIdByWorktree, isRemovedOwner)
  deleteMatchingOwnerKeys(next.activeTabTypeByWorktree, isRemovedOwner)
  deleteMatchingOwnerKeys(next.activeTabIdByWorktree, isRemovedOwner)
  deleteMatchingOwnerKeys(next.unifiedTabs, isRemovedOwner)
  deleteMatchingOwnerKeys(next.tabGroups, isRemovedOwner)
  deleteMatchingOwnerKeys(next.tabGroupLayouts, isRemovedOwner)
  deleteMatchingOwnerKeys(next.activeGroupIdByWorktree, isRemovedOwner)
  deleteMatchingOwnerKeys(next.lastVisitedAtByWorktreeId, isRemovedOwner)
  deleteMatchingOwnerKeys(next.defaultTerminalTabsAppliedByWorktreeId, isRemovedOwner)

  for (const [paneKey, record] of Object.entries(next.sleepingAgentSessionsByPaneKey ?? {})) {
    if (isRemovedOwner(record.worktreeId)) {
      delete next.sleepingAgentSessionsByPaneKey![paneKey]
    }
  }
  if (next.activeWorkspaceKey && isRemovedOwner(next.activeWorkspaceKey)) {
    next.activeWorkspaceKey = null
  }
  if (next.activeWorktreeId && isRemovedOwner(next.activeWorktreeId)) {
    next.activeWorktreeId = null
  }
  next.activeWorktreeIdsOnShutdown = next.activeWorktreeIdsOnShutdown?.filter(
    (worktreeId) => !isRemovedOwner(worktreeId)
  )

  return next
}

export function removeWorkspaceSessionOwner(
  session: WorkspaceSessionState | undefined,
  ownerKey: string
): WorkspaceSessionState | undefined {
  return removeWorkspaceSessionOwnersMatching(session, (candidate) => candidate === ownerKey)
}

export function removeRepoFromWorkspaceSession(
  session: WorkspaceSessionState | undefined,
  repoId: string
): WorkspaceSessionState {
  const next =
    removeWorkspaceSessionOwnersMatching(session ?? getDefaultWorkspaceSession(), (ownerKey) =>
      ownerKeyBelongsToRepo(ownerKey, repoId)
    ) ?? getDefaultWorkspaceSession()
  if (next.activeRepoId === repoId) {
    next.activeRepoId = null
  }
  return next
}

export function removeRepoFromHostWorkspaceSessions(
  sessions: HostWorkspaceSessions | undefined,
  repoId: string
): HostWorkspaceSessions {
  const next: HostWorkspaceSessions = {}
  for (const [hostId, session] of Object.entries(sessions ?? {})) {
    next[hostId as ExecutionHostId] = removeRepoFromWorkspaceSession(session, repoId)
  }
  return next
}

export function removeRepoFromWorkspaceSessionsForHost(args: {
  workspaceSession: WorkspaceSessionState
  workspaceSessionsByHostId: HostWorkspaceSessions | undefined
  repoId: string
  hostId: ExecutionHostId | null
}): {
  workspaceSession: WorkspaceSessionState
  workspaceSessionsByHostId: HostWorkspaceSessions | undefined
} {
  const removeLegacySession = args.hostId === null || args.hostId === LOCAL_EXECUTION_HOST_ID
  const workspaceSession = removeLegacySession
    ? removeRepoFromWorkspaceSession(args.workspaceSession, args.repoId)
    : args.workspaceSession

  if (args.hostId === LOCAL_EXECUTION_HOST_ID || !args.workspaceSessionsByHostId) {
    return { workspaceSession, workspaceSessionsByHostId: args.workspaceSessionsByHostId }
  }
  if (args.hostId === null) {
    return {
      workspaceSession,
      workspaceSessionsByHostId: removeRepoFromHostWorkspaceSessions(
        args.workspaceSessionsByHostId,
        args.repoId
      )
    }
  }

  const targetSession = args.workspaceSessionsByHostId[args.hostId]
  if (!targetSession) {
    return { workspaceSession, workspaceSessionsByHostId: args.workspaceSessionsByHostId }
  }
  return {
    workspaceSession,
    workspaceSessionsByHostId: {
      ...args.workspaceSessionsByHostId,
      [args.hostId]: removeRepoFromWorkspaceSession(targetSession, args.repoId)
    }
  }
}
