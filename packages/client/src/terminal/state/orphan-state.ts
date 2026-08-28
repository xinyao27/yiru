import type { AppState } from '../../store/types'
import { removeTabFromTerminalState, type TerminalState } from './removal'

type OrphanTerminalDetectionState = Pick<
  AppState,
  'tabsByWorktree' | 'unifiedTabsByWorktree' | 'ptyIdsByTabId'
>

type OrphanTerminalCleanupState = TerminalState

type OrphanTerminalAgentStatusSweepState = Pick<AppState, 'dropAgentStatusByTabPrefix'>

/**
 * Sweep live + retained agent status for tabs that orphan reconciliation is
 * about to remove.
 *
 * Why: buildOrphanTerminalCleanupPatch drops the tab from `tabsByWorktree`,
 * and the retention sync reads a pane leaving the live×tab join as "this agent
 * disappeared" — snapshotting every `done` row under it into
 * `retainedAgentsByPaneKey`. That snapshot is then unreachable: no future tab
 * close can match a tab id that no longer exists, so the row shows a completed
 * agent forever. closeTab already plants the same suppressors; orphan
 * reconciliation is the same teardown and must plant them too.
 *
 * Slept and hibernated tabs keep their wake-hint `tab.ptyId`, so
 * getOrphanTerminalIds never classifies them as orphans and their retained
 * completion evidence survives.
 */
export function dropOrphanTerminalAgentStatus(
  state: OrphanTerminalAgentStatusSweepState,
  worktreeId: string,
  orphanTerminalIds: ReadonlySet<string>
): void {
  for (const tabId of orphanTerminalIds) {
    state.dropAgentStatusByTabPrefix(tabId, { worktreeId })
  }
}

export function getOrphanTerminalIds(
  state: OrphanTerminalDetectionState,
  worktreeId: string
): Set<string> {
  const runtimeTabs = state.tabsByWorktree[worktreeId] ?? []
  const unifiedTerminalEntityIds = new Set(
    (state.unifiedTabsByWorktree[worktreeId] ?? [])
      .filter((tab) => tab.contentType === 'terminal')
      .map((tab) => tab.entityId)
  )

  return new Set(
    runtimeTabs
      .filter((tab) => {
        if (unifiedTerminalEntityIds.has(tab.id)) {
          return false
        }
        const livePtyIds = state.ptyIdsByTabId[tab.id] ?? []
        return livePtyIds.length === 0 && tab.ptyId == null
      })
      .map((tab) => tab.id)
  )
}

export function buildOrphanTerminalCleanupPatch(
  state: OrphanTerminalCleanupState,
  _worktreeId: string,
  orphanTerminalIds: Set<string>
): TerminalState {
  let next = state
  for (const orphanTabId of orphanTerminalIds) {
    next = removeTabFromTerminalState(next, orphanTabId)
  }
  return next
}
