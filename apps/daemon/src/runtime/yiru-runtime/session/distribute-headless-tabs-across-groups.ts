import type {
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { TerminalLayoutSnapshot } from '@yiru/runtime-protocol/workbench/types'
import { buildHeadlessTerminalSplitLayout } from '~main/runtime/headless-terminal-split-layout'
import { closeTerminalTabInWorkspaceSession } from '~main/workspace/session-terminal-tab-close'

import { RuntimeSessionCollectPersistedTerminalLeafIds } from './collect-persisted-terminal-leaf-ids'

export abstract class RuntimeSessionDistributeHeadlessTabsAcrossGroups extends RuntimeSessionCollectPersistedTerminalLeafIds {
  protected distributeHeadlessTabsAcrossGroups(
    existingGroups: readonly RuntimeMobileSessionTabGroup[],
    tabOrder: readonly string[],
    activeTopLevelId: string | null,
    newTabAssignment?: { tabId: string; groupId: string }
  ): RuntimeMobileSessionTabGroup[] {
    const groupIdByTabId = new Map<string, string>()
    for (const group of existingGroups) {
      for (const tabId of group.tabOrder) {
        groupIdByTabId.set(tabId, group.id)
      }
    }
    // Why: route a freshly-created tab to the group its "+" was clicked in,
    // when that group still exists; otherwise fall through to the active group.
    const hasTargetGroup =
      newTabAssignment !== undefined &&
      existingGroups.some((group) => group.id === newTabAssignment.groupId)
    if (hasTargetGroup) {
      groupIdByTabId.set(newTabAssignment!.tabId, newTabAssignment!.groupId)
    }
    const activeGroupId =
      (activeTopLevelId ? groupIdByTabId.get(activeTopLevelId) : undefined) ?? existingGroups[0]!.id
    const orderByGroup = new Map<string, string[]>(existingGroups.map((group) => [group.id, []]))
    for (const tabId of tabOrder) {
      const groupId = groupIdByTabId.get(tabId) ?? activeGroupId
      orderByGroup.get(groupId)?.push(tabId)
    }
    return existingGroups
      .map((group) => {
        const nextOrder = orderByGroup.get(group.id) ?? []
        return {
          ...group,
          tabOrder: nextOrder,
          activeTabId:
            activeTopLevelId && nextOrder.includes(activeTopLevelId)
              ? activeTopLevelId
              : group.activeTabId && nextOrder.includes(group.activeTabId)
                ? group.activeTabId
                : (nextOrder[0] ?? null)
        }
      })
      .filter((group) => group.tabOrder.length > 0)
  }

  protected buildMaterializedHeadlessParentLayout(
    leafId: string,
    ptyId: string,
    existingLayout: TerminalLayoutSnapshot | undefined,
    split?: { splitFromLeafId: string; direction: 'horizontal' | 'vertical' }
  ): TerminalLayoutSnapshot {
    if (!existingLayout) {
      return {
        root: { type: 'leaf', leafId },
        activeLeafId: leafId,
        expandedLeafId: null,
        ptyIdsByLeafId: { [leafId]: ptyId }
      }
    }
    // Why: a split must insert the new leaf into the live layout tree with the
    // requested direction, or the published snapshot keeps the old single-leaf
    // root and the split renders with a fallback direction ("Split Right" lands
    // as a top/bottom split). Reuse the persisted-split builder for parity.
    if (split) {
      return buildHeadlessTerminalSplitLayout(this.cloneTerminalLayoutSnapshot(existingLayout), {
        leafId,
        ptyId,
        splitFromLeafId: split.splitFromLeafId,
        direction: split.direction
      })
    }
    return {
      ...this.cloneTerminalLayoutSnapshot(existingLayout),
      ptyIdsByLeafId: {
        ...existingLayout.ptyIdsByLeafId,
        [leafId]: ptyId
      }
    }
  }

  protected removePersistedHeadlessTerminalTab(worktreeId: string, parentTabId: string): string[] {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.patchWorkspaceSession) {
      throw new Error('workspace_session_unavailable')
    }
    const result = closeTerminalTabInWorkspaceSession(session, worktreeId, parentTabId)
    if (result.pinned) {
      throw new Error('terminal_tab_pinned')
    }
    if (!result.closed) {
      throw new Error('tab_not_found')
    }
    this.store.patchWorkspaceSession(result.session)
    return result.ptyIdsToKill
  }

  protected persistHeadlessTerminalTabOrder(worktreeId: string, tabOrder: readonly string[]): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.patchWorkspaceSession) {
      return
    }
    const orderIndexByTabId = new Map(tabOrder.map((tabId, index) => [tabId, index]))
    const tabs = session.tabsByWorktree[worktreeId] ?? []
    const reordered = [...tabs]
      .sort((a, b) => {
        const aIndex = orderIndexByTabId.get(a.id) ?? Number.MAX_SAFE_INTEGER
        const bIndex = orderIndexByTabId.get(b.id) ?? Number.MAX_SAFE_INTEGER
        return aIndex - bIndex || a.sortOrder - b.sortOrder || a.createdAt - b.createdAt
      })
      .map((tab, index) => ({
        ...tab,
        sortOrder: index
      }))
    this.store.patchWorkspaceSession({
      tabsByWorktree: {
        ...session.tabsByWorktree,
        [worktreeId]: reordered
      }
    })
  }

  protected emitMobileSessionTabsSnapshot(snapshot: RuntimeMobileSessionTabsSnapshot): void {
    if (this.mobileSessionTabListeners.size === 0) {
      return
    }
    const result = this.toMobileSessionTabsResult(snapshot)
    for (const listener of this.mobileSessionTabListeners) {
      listener(result)
    }
  }

  protected async refreshMobileSessionPtyRecords(
    targetWorktreeId: string | null = null
  ): Promise<void> {
    if (!this.ptyController?.listProcesses && !this.ptyController?.hasPty) {
      return
    }
    const resolvedWorktrees = await this.listResolvedWorktrees()
    await this.refreshPtyWorktreeRecordsFromController(resolvedWorktrees, targetWorktreeId)
  }
}
