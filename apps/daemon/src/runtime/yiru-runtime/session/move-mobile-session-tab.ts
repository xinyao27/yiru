import type {
  RuntimeMobileSessionTabMove,
  RuntimeMobileSessionTabMoveResult
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  TerminalPaneLayoutNode,
  WorkspaceSessionPatch
} from '@yiru/runtime-protocol/workbench/types'

import { RuntimeSessionNotifyRendererOfHeadlessTerminalClose } from './notify-renderer-of-headless-terminal-close'

export abstract class RuntimeSessionMoveMobileSessionTab extends RuntimeSessionNotifyRendererOfHeadlessTerminalClose {
  async moveMobileSessionTab(
    worktreeSelector: string,
    move: RuntimeMobileSessionTabMove
  ): Promise<RuntimeMobileSessionTabMoveResult> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    if (!snapshot) {
      throw new Error('tab_not_found')
    }
    if (!this.shellConnectionId) {
      return this.moveHeadlessMobileSessionTab(worktreeId, snapshot, move)
    }
    const hostTabId = this.resolveMobileSessionHostTabId(snapshot, move.tabId)
    if (!hostTabId) {
      throw new Error('tab_not_found')
    }
    const publicSnapshot = this.toMobileSessionTabsResult(snapshot)
    const targetGroup = publicSnapshot.tabGroups?.find((group) => group.id === move.targetGroupId)
    if (!targetGroup) {
      throw new Error('target_group_not_found')
    }

    // Why: web clients address terminal surfaces as tab::leaf, while desktop
    // tab grouping is owned by the outer terminal tab id.
    if (move.kind === 'reorder') {
      const tabOrder = this.normalizeMobileSessionTabOrder(snapshot, targetGroup, move.tabOrder)
      if (!tabOrder.includes(hostTabId)) {
        throw new Error('invalid_tab_order')
      }
      this.dispatchShellCommand({
        type: 'moveSessionTab',
        worktreeId,
        ...move,
        tabId: hostTabId,
        tabOrder
      })
      return { moved: true }
    }
    this.dispatchShellCommand({
      type: 'moveSessionTab',
      worktreeId,
      ...move,
      tabId: hostTabId
    })
    return { moved: true }
  }

  // Why: pane geometry inside a tab (split ratios, expanded pane, pane titles)
  // is host-authoritative for remote-server tabs but had no push path, so a
  // client divider-drag / expand / pane-rename reverted on the next snapshot.
  // Persist the structural fields onto the tab's layout, keeping host-owned
  // pty bindings and active leaf.

  async updateMobileSessionPaneLayout(
    worktreeSelector: string,
    args: {
      tabId: string
      root: TerminalPaneLayoutNode | null
      expandedLeafId: string | null
      titlesByLeafId?: Record<string, string>
    }
  ): Promise<{ updated: true }> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    // Why: when a renderer is authoritative (desktop host reached via shared
    // control), it owns pane geometry and republishes it — a headless write here
    // would be overwritten and could fight the renderer. Persist only headlessly.
    if (this.getAvailableAuthoritativeWindow()) {
      return { updated: true }
    }
    // Why: resolve to the host tab id (older/raw-id clients) so the persisted
    // layout entry matches, matching setMobileSessionTabProps.
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const hostTabId = snapshot
      ? (this.resolveMobileSessionHostTabId(snapshot, args.tabId) ?? args.tabId)
      : args.tabId
    const resolvedArgs = { ...args, tabId: hostTabId }
    this.persistHeadlessTerminalPaneLayout(resolvedArgs)
    this.applyHeadlessTerminalPaneLayoutToSnapshot(worktreeId, resolvedArgs)
    return { updated: true }
  }

  // Why: tab color/pin are host-authoritative for remote-server tabs but had no
  // push path, so pinning or coloring a tab reverted on the next snapshot and
  // was never persisted. Persist to the workspace session + live snapshot.

  async setMobileSessionTabProps(
    worktreeSelector: string,
    args: {
      tabId: string
      color?: string | null
      isPinned?: boolean
    }
  ): Promise<{ updated: true }> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    const worktreeId =
      explicitWorktreeId ?? (await this.resolveWorktreeSelector(worktreeSelector)).id
    // Why: a renderer-authoritative host owns + republishes tab props, so a
    // headless write would be overwritten. Persist only when headless.
    if (this.getAvailableAuthoritativeWindow()) {
      return { updated: true }
    }
    const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
    const hostTabId = snapshot
      ? (this.resolveMobileSessionHostTabId(snapshot, args.tabId) ?? args.tabId)
      : args.tabId
    this.persistHeadlessSessionTabProps(worktreeId, hostTabId, args)
    this.applyHeadlessSessionTabPropsToSnapshot(worktreeId, hostTabId, args)
    return { updated: true }
  }

  protected persistHeadlessSessionTabProps(
    worktreeId: string,
    tabId: string,
    props: { color?: string | null; isPinned?: boolean }
  ): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.patchWorkspaceSession) {
      return
    }
    const tabs = session.tabsByWorktree[worktreeId]
    const patch: WorkspaceSessionPatch = {}
    let changed = false
    if (tabs?.some((tab) => tab.id === tabId)) {
      changed = true
      patch.tabsByWorktree = {
        ...session.tabsByWorktree,
        [worktreeId]: tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                ...(props.color !== undefined ? { color: props.color } : {}),
                ...(props.isPinned !== undefined ? { isPinned: props.isPinned } : {})
              }
            : tab
        )
      }
    }

    const unifiedTabs = session.unifiedTabs?.[worktreeId]
    if (unifiedTabs?.some((tab) => tab.id === tabId || tab.entityId === tabId)) {
      changed = true
      patch.unifiedTabs = {
        ...session.unifiedTabs,
        [worktreeId]: unifiedTabs.map((tab) =>
          tab.id === tabId || tab.entityId === tabId
            ? {
                ...tab,
                ...(props.color !== undefined ? { color: props.color } : {}),
                ...(props.isPinned !== undefined ? { isPinned: props.isPinned } : {})
              }
            : tab
        )
      }
    }

    if (!changed) {
      return
    }
    this.store.patchWorkspaceSession(patch)
  }
}
