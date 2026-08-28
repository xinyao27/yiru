import { isDeepStrictEqual } from 'node:util'

import type {
  WorkspaceSessionPatch,
  WorkspaceSessionState
} from '@yiru/runtime-protocol/workbench/types'

export type WorkspaceSessionPatchScope = {
  tabIds: Set<string>
  worktreeIds: Set<string>
}

function changedKeys<Value>(
  prior: Record<string, Value> | undefined,
  next: Record<string, Value> | undefined
): Set<string> {
  const keys = new Set([...Object.keys(prior ?? {}), ...Object.keys(next ?? {})])
  for (const key of keys) {
    if (isDeepStrictEqual(prior?.[key], next?.[key])) {
      keys.delete(key)
    }
  }
  return keys
}

function addTabWorktree(
  scope: WorkspaceSessionPatchScope,
  session: WorkspaceSessionState,
  tabId: string
): void {
  for (const [worktreeId, tabs] of Object.entries(session.tabsByWorktree ?? {})) {
    if (tabs.some((tab) => tab.id === tabId)) {
      scope.worktreeIds.add(worktreeId)
      return
    }
  }
}

export function deriveWorkspaceSessionPatchScope(
  prior: WorkspaceSessionState,
  patch: WorkspaceSessionPatch
): WorkspaceSessionPatchScope {
  const scope: WorkspaceSessionPatchScope = { tabIds: new Set(), worktreeIds: new Set() }
  const next = { ...prior, ...patch }
  if (patch.tabsByWorktree) {
    for (const worktreeId of changedKeys(prior.tabsByWorktree, patch.tabsByWorktree)) {
      scope.worktreeIds.add(worktreeId)
      for (const tab of prior.tabsByWorktree?.[worktreeId] ?? []) {
        scope.tabIds.add(tab.id)
      }
      for (const tab of patch.tabsByWorktree[worktreeId] ?? []) {
        scope.tabIds.add(tab.id)
      }
    }
  }
  if (patch.terminalLayoutsByTabId) {
    for (const tabId of changedKeys(prior.terminalLayoutsByTabId, patch.terminalLayoutsByTabId)) {
      scope.tabIds.add(tabId)
    }
  }
  for (const tabId of scope.tabIds) {
    addTabWorktree(scope, prior, tabId)
    addTabWorktree(scope, next, tabId)
  }
  return scope
}
