import { HEADLESS_RUNTIME_WINDOW_ID } from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  RuntimeSyncWindowGraphResult,
  RuntimeMobileSessionTabsResult,
  RuntimeSyncWindowGraph
} from '@yiru/runtime-protocol/workbench/runtime-types'

import { RuntimeCoreEmitNestedRepoScanProgressEvent } from '../core/emit-nested-repo-scan-progress-event'

export abstract class RuntimeSessionAttachWindow extends RuntimeCoreEmitNestedRepoScanProgressEvent {
  attachWindow(windowId: number): void {
    const authoritativeWindowId = this.terminalSessions.getAuthoritativeWindowId()
    if (authoritativeWindowId === HEADLESS_RUNTIME_WINDOW_ID) {
      // Why: promotion is a renderer reload of the same graph owner, not a new
      // runtime; stale handles must transition before the real window publishes.
      this.persistWindowlessPtyBindingsForDesktopAttach()
      this.markRendererReloading(HEADLESS_RUNTIME_WINDOW_ID)
      this.terminalSessions.replaceAuthoritativeWindow(windowId)
      return
    }
    if (authoritativeWindowId === null) {
      // Why: a promoted serve can close and later reopen its window while new
      // background PTYs keep arriving; every windowless gap needs this handoff.
      this.persistWindowlessPtyBindingsForDesktopAttach()
      this.terminalSessions.attachGraphWindow(windowId)
    }
  }

  protected persistWindowlessPtyBindingsForDesktopAttach(): void {
    const session = this.store?.getWorkspaceSession?.()
    if (!session || !this.store?.patchWorkspaceSession) {
      return
    }
    const promotablePtys = [...this.terminalSessions.listPtyRecords()].filter((pty) => {
      if (!pty.connected || !pty.tabId) {
        return false
      }
      const tab = session.tabsByWorktree[pty.worktreeId]?.find(
        (candidate) => candidate.id === pty.tabId
      )
      if (!tab) {
        return false
      }
      const layoutPtyIds = Object.values(
        session.terminalLayoutsByTabId[pty.tabId]?.ptyIdsByLeafId ?? {}
      )
      return tab.ptyId === pty.ptyId || layoutPtyIds.includes(pty.ptyId)
    })
    if (promotablePtys.length === 0) {
      return
    }

    // Why: renderer hydration treats an explicitly-present shutdown list as
    // authoritative. A windowless owner has no renderer shutdown pass, so seed
    // that existing reattach contract before its next desktop window loads.
    const activeWorktreeIdsOnShutdown = [
      ...new Set([
        ...(session.activeWorktreeIdsOnShutdown ?? []),
        ...promotablePtys.map((pty) => pty.worktreeId)
      ])
    ]
    const activeConnectionIdsAtShutdown = [
      ...new Set([
        ...(session.activeConnectionIdsAtShutdown ?? []),
        ...promotablePtys
          .map((pty) => pty.connectionId)
          .filter((connectionId): connectionId is string => connectionId !== null)
      ])
    ]
    const remoteSessionIdsByTabId = { ...session.remoteSessionIdsByTabId }
    for (const pty of promotablePtys) {
      if (pty.connectionId && pty.tabId) {
        remoteSessionIdsByTabId[pty.tabId] = pty.ptyId
      }
    }

    this.store.patchWorkspaceSession({
      activeWorktreeIdsOnShutdown,
      ...(activeConnectionIdsAtShutdown.length > 0 ? { activeConnectionIdsAtShutdown } : {}),
      ...(Object.keys(remoteSessionIdsByTabId).length > 0 ? { remoteSessionIdsByTabId } : {})
    })
  }

  syncWindowGraph(windowId: number, graph: RuntimeSyncWindowGraph): RuntimeSyncWindowGraphResult {
    const leaves = this.preserveRemoteViewedLeafBindings(graph)
    this.syncMobileSessionTabs(graph.mobileSessionTabs)
    const graphSyncedAt = this.nextTitleObservationSequence()
    this.terminalSessions.synchronizeGraph(
      windowId,
      graph.tabs,
      leaves,
      {
        preserveRemotePty: (ptyId) => this.hasRemoteTerminalViewSubscriber(ptyId),
        buildLeaf: (leaf, { existing, ptyId, ptyGeneration, writable }) => {
          const existingPty = ptyId ? this.terminalSessions.getPtyRecord(ptyId) : null
          const tailSource = existing?.ptyId === ptyId ? existing : existingPty
          return {
            ...leaf,
            ptyId,
            ptyGeneration,
            connected: ptyId !== null,
            writable,
            lastOutputAt: tailSource?.lastOutputAt ?? null,
            lastExitCode: tailSource?.lastExitCode ?? null,
            tailBuffer: tailSource?.tailBuffer ?? [],
            tailPartialLine: tailSource?.tailPartialLine ?? '',
            tailPendingAnsi: tailSource?.tailPendingAnsi ?? '',
            tailRedrawCursor: tailSource?.tailRedrawCursor ?? null,
            tailTruncated: tailSource?.tailTruncated ?? false,
            tailLinesTotal: tailSource?.tailLinesTotal ?? 0,
            preview: tailSource?.preview ?? '',
            waitBlockedAt: tailSource?.waitBlockedAt ?? null,
            lastAgentStatus: tailSource?.lastAgentStatus ?? null,
            lastOscTitle: tailSource?.lastOscTitle ?? null,
            lastOscTitleAt: tailSource?.lastOscTitleAt ?? null,
            paneTitleUpdatedAt:
              existing?.ptyId === ptyId && existing.paneTitle === leaf.paneTitle
                ? existing.paneTitleUpdatedAt
                : graphSyncedAt
          }
        },
        recordLivePty: (leaf, existing) => {
          if (!leaf.ptyId) {
            return
          }
          const ptyId = this.resolveLocalRuntimeTerminalPtyId(leaf.ptyId)
          this.recordPtyWorktree(ptyId, leaf.worktreeId, {
            connected: true,
            lastOutputAt: existing?.ptyId === leaf.ptyId ? existing.lastOutputAt : null,
            preview: existing?.ptyId === leaf.ptyId ? existing.preview : '',
            tabId: leaf.tabId,
            paneKey: this.makeRuntimePaneKey(leaf)
          })
        }
      },
      this.runtimeId
    )
    this.notifyMobileSessionTabSnapshots()
    this.setTerminalSideEffectConsumerAvailable(windowId !== HEADLESS_RUNTIME_WINDOW_ID)

    const agentOrchestrationByPaneKey = this.buildAgentOrchestrationByPaneKey()
    return {
      ...this.getStatus(),
      ...(agentOrchestrationByPaneKey ? { agentOrchestrationByPaneKey } : {})
    }
  }

  protected preserveRemoteViewedLeafBindings(
    graph: RuntimeSyncWindowGraph
  ): RuntimeSyncWindowGraph['leaves'] {
    const remotePtyByLeaf = new Map<string, string>()
    for (const snapshot of graph.mobileSessionTabs ?? []) {
      for (const tab of snapshot.tabs) {
        if (tab.type !== 'terminal') {
          continue
        }
        const ptyId = tab.ptyId ?? tab.parentLayout?.ptyIdsByLeafId?.[tab.leafId] ?? null
        if (!ptyId || !this.hasRemoteTerminalViewSubscriber(ptyId)) {
          continue
        }
        remotePtyByLeaf.set(`${snapshot.worktree}\0${tab.parentTabId}\0${tab.leafId}`, ptyId)
      }
    }
    if (remotePtyByLeaf.size === 0) {
      return graph.leaves
    }
    // Why: a hidden desktop pane can report a null renderer leaf even while a paired phone is
    // streaming its PTY. The session snapshot still carries that stable binding; keep it in the
    // authoritative graph until the remote view releases ownership.
    return graph.leaves.map((leaf) => {
      if (leaf.ptyId !== null) {
        return leaf
      }
      const ptyId = remotePtyByLeaf.get(`${leaf.worktreeId}\0${leaf.tabId}\0${leaf.leafId}`)
      return ptyId ? { ...leaf, ptyId } : leaf
    })
  }

  async listMobileSessionTabs(worktreeSelector: string): Promise<RuntimeMobileSessionTabsResult> {
    const explicitWorktreeId = this.getValidatedExplicitWorktreeIdSelector(worktreeSelector)
    if (explicitWorktreeId) {
      this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(explicitWorktreeId)
      await this.refreshMobileSessionPtyRecords(explicitWorktreeId)
      return this.getMobileSessionTabsForWorktree(explicitWorktreeId)
    }
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktree.id)
    await this.refreshMobileSessionPtyRecords(worktree.id)
    return this.getMobileSessionTabsForWorktree(worktree.id)
  }

  async listAllMobileSessionTabs(): Promise<RuntimeMobileSessionTabsResult[]> {
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession()
    await this.refreshMobileSessionPtyRecords()
    return [...this.mobileSessionTabsByWorktree.values()].map((snapshot) =>
      this.toMobileSessionTabsResult(snapshot)
    )
  }
}
