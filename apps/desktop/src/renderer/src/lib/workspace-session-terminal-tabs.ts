import type { TerminalTab, WorkspaceSessionState } from '../../../shared/types'

export function buildSanitizedTabsByWorktree(
  tabsByWorktree: Record<string, TerminalTab[]>
): WorkspaceSessionState['tabsByWorktree'] {
  // Why: pendingActivationSpawn is a transient renderer handoff; persisting it
  // can suppress the first legitimate PTY spawn after an interrupted save.
  return Object.fromEntries(
    Object.entries(tabsByWorktree).map(([worktreeId, tabs]) => [
      worktreeId,
      tabs
        // Why: the app shuts down the assistant PTY on exit; persisting its
        // runtime-only tab would restore dead terminal chrome on next launch.
        .filter((tab) => tab.isGlobalAssistant !== true)
        .map((tab) => {
          const { pendingActivationSpawn: _unused, ...rest } = tab
          void _unused
          return rest
        })
    ])
  )
}

export function buildSanitizedTerminalLayoutsByTabId(
  tabsByWorktree: Record<string, TerminalTab[]>,
  terminalLayoutsByTabId: WorkspaceSessionState['terminalLayoutsByTabId']
): WorkspaceSessionState['terminalLayoutsByTabId'] {
  const persistedTabIds = new Set(
    Object.values(buildSanitizedTabsByWorktree(tabsByWorktree))
      .flat()
      .map((tab) => tab.id)
  )
  return Object.fromEntries(
    Object.entries(terminalLayoutsByTabId).filter(([tabId]) => persistedTabIds.has(tabId))
  )
}
