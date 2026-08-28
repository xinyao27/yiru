import type {
  RuntimeTerminalSummary,
  RuntimeTerminalVisualGroupNode,
  RuntimeTerminalVisualLayout,
  RuntimeTerminalVisualTab,
  RuntimeMobileSessionTerminalTab,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { TerminalPaneLayoutNode } from '@yiru/runtime-protocol/workbench/types'

import type { ResolvedWorktree } from '../model/worktree-resolution'
import { RuntimeTerminalFailActiveDispatchOnExit } from './fail-active-dispatch-on-exit'

export abstract class RuntimeTerminalBuildTerminalVisualLayouts extends RuntimeTerminalFailActiveDispatchOnExit {
  protected buildTerminalVisualLayouts(
    terminals: RuntimeTerminalSummary[],
    worktreesById: Map<string, ResolvedWorktree>,
    targetWorktreeId: string | null
  ): RuntimeTerminalVisualLayout[] {
    if (terminals.length === 0) {
      return []
    }
    // Why: the mobile/session snapshot supplies topology, but terminal.list
    // must print the same handles in both the flat list and visual tree.
    const summariesByLeafKey = new Map(
      terminals.map((terminal) => [this.getLeafKey(terminal.tabId, terminal.leafId), terminal])
    )
    const summariesByWorktree = new Map<string, RuntimeTerminalSummary[]>()
    for (const terminal of terminals) {
      const existing = summariesByWorktree.get(terminal.worktreeId)
      if (existing) {
        existing.push(terminal)
      } else {
        summariesByWorktree.set(terminal.worktreeId, [terminal])
      }
    }
    const snapshots = targetWorktreeId
      ? [this.mobileSessionTabsByWorktree.get(targetWorktreeId)].filter(
          (snapshot): snapshot is RuntimeMobileSessionTabsSnapshot => snapshot !== undefined
        )
      : [...this.mobileSessionTabsByWorktree.values()]
    const layouts: RuntimeTerminalVisualLayout[] = []
    for (const snapshot of snapshots) {
      const worktreeTerminals = summariesByWorktree.get(snapshot.worktree)
      if (!worktreeTerminals || worktreeTerminals.length === 0) {
        continue
      }
      const groups = this.buildTerminalVisualGroups(snapshot, summariesByLeafKey)
      if (groups.length === 0) {
        continue
      }
      const groupsById = new Map(
        groups
          .filter((group): group is RuntimeTerminalVisualGroupNode & { groupId: string } =>
            Boolean(group.groupId)
          )
          .map((group) => [group.groupId, group])
      )
      const root =
        this.buildTerminalVisualGroupLayout(snapshot.tabGroupLayout, groupsById) ?? groups[0]
      if (!root) {
        continue
      }
      const worktree = worktreesById.get(snapshot.worktree)
      layouts.push({
        worktreeId: snapshot.worktree,
        worktreePath: worktree?.path ?? worktreeTerminals[0]?.worktreePath ?? '',
        root
      })
    }
    return layouts
  }

  protected buildTerminalVisualGroups(
    snapshot: RuntimeMobileSessionTabsSnapshot,
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): RuntimeTerminalVisualGroupNode[] {
    const terminalTabs = snapshot.tabs.filter(
      (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
    )
    if (terminalTabs.length === 0) {
      return []
    }
    const tabsByParentId = new Map<string, RuntimeMobileSessionTerminalTab[]>()
    const parentOrder: string[] = []
    for (const tab of terminalTabs) {
      const existing = tabsByParentId.get(tab.parentTabId)
      if (existing) {
        existing.push(tab)
      } else {
        parentOrder.push(tab.parentTabId)
        tabsByParentId.set(tab.parentTabId, [tab])
      }
    }
    const groupSources =
      snapshot.tabGroups && snapshot.tabGroups.length > 0
        ? snapshot.tabGroups
        : [{ id: null, activeTabId: snapshot.activeTabId, tabOrder: parentOrder }]
    return groupSources
      .map((group): RuntimeTerminalVisualGroupNode | null => {
        const tabs = group.tabOrder
          .map((tabId) => {
            const surfaces =
              tabsByParentId.get(tabId) ?? terminalTabs.filter((tab) => tab.id === tabId)
            return this.buildTerminalVisualTab(tabId, surfaces, summariesByLeafKey)
          })
          .filter((tab): tab is RuntimeTerminalVisualTab => tab !== null)
        if (tabs.length === 0) {
          return null
        }
        return {
          type: 'group',
          groupId: group.id,
          activeTabId: group.activeTabId,
          tabs
        }
      })
      .filter((group): group is RuntimeTerminalVisualGroupNode => group !== null)
  }

  protected buildTerminalVisualTab(
    tabId: string,
    surfaces: RuntimeMobileSessionTerminalTab[],
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): RuntimeTerminalVisualTab | null {
    const firstSurface = surfaces[0]
    if (!firstSurface) {
      return null
    }
    const parentTabId = firstSurface.parentTabId
    const requestedActiveLeafId =
      firstSurface.parentLayout?.activeLeafId ??
      surfaces.find((surface) => surface.isActive)?.leafId ??
      firstSurface.leafId
    const root = firstSurface.parentLayout?.root ?? {
      type: 'leaf' as const,
      leafId: firstSurface.leafId
    }
    const visibleLeafIds = this.collectVisibleTerminalLeafIds(root, parentTabId, summariesByLeafKey)
    if (visibleLeafIds.length === 0) {
      return null
    }
    const activeLeafId =
      (requestedActiveLeafId && visibleLeafIds.includes(requestedActiveLeafId)
        ? requestedActiveLeafId
        : surfaces.find((surface) => surface.isActive && visibleLeafIds.includes(surface.leafId))
            ?.leafId) ?? visibleLeafIds[0]!
    const panes = this.buildTerminalVisualPane(root, parentTabId, activeLeafId, summariesByLeafKey)
    if (!panes) {
      return null
    }
    return {
      tabId: parentTabId || tabId,
      title: this.terminalSessions.getGraphTab(parentTabId)?.title ?? firstSurface.title ?? null,
      activeLeafId,
      panes
    }
  }

  protected collectVisibleTerminalLeafIds(
    node: TerminalPaneLayoutNode,
    tabId: string,
    summariesByLeafKey: ReadonlyMap<string, RuntimeTerminalSummary>
  ): string[] {
    if (node.type === 'leaf') {
      return summariesByLeafKey.has(this.getLeafKey(tabId, node.leafId)) ? [node.leafId] : []
    }
    return [
      ...this.collectVisibleTerminalLeafIds(node.first, tabId, summariesByLeafKey),
      ...this.collectVisibleTerminalLeafIds(node.second, tabId, summariesByLeafKey)
    ]
  }
}
