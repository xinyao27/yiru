import type { RuntimeGraphStatus } from '../../../shared/runtime-types'
import {
  TerminalSessionGraph,
  type TerminalSessionGraphPort,
  type TerminalSessionHandleRecord,
  type TerminalSessionLeaf,
  type TerminalSessionTab
} from './terminal-session-graph'
import {
  TerminalSessionGraphRecovery,
  type TerminalGraphSyncPort
} from './terminal-session-graph-recovery'
import {
  TerminalSessionRecordRegistry,
  type TerminalSessionPtyRecord
} from './terminal-session-record-registry'

function snapshotSessionValue<T>(value: T): T {
  return structuredClone(value)
}

export class TerminalSessionGraphAuthority<
  TTab extends TerminalSessionTab,
  TLeaf extends TerminalSessionLeaf,
  TPty extends TerminalSessionPtyRecord,
  THandle extends TerminalSessionHandleRecord
> {
  private readonly graph: TerminalSessionGraph<TTab, TLeaf, THandle>
  private readonly ptys = new TerminalSessionRecordRegistry<TPty>()
  private readonly recovery: TerminalSessionGraphRecovery<TTab, TLeaf, THandle>

  constructor(port: TerminalSessionGraphPort) {
    this.graph = new TerminalSessionGraph(port)
    this.recovery = new TerminalSessionGraphRecovery(this.graph)
  }

  getGraphState(): {
    rendererGraphEpoch: number
    graphStatus: RuntimeGraphStatus
    authoritativeWindowId: number | null
    liveTabCount: number
    liveLeafCount: number
  } {
    return this.graph.getState()
  }

  getGraphStatus(): RuntimeGraphStatus {
    return this.graph.getStatus()
  }

  getGraphEpoch(): number {
    return this.graph.getEpoch()
  }

  getAuthoritativeWindowId(): number | null {
    return this.graph.getAuthoritativeWindowId()
  }

  attachGraphWindow(windowId: number): void {
    this.graph.attachWindow(windowId)
  }

  replaceAuthoritativeWindow(windowId: number): void {
    this.graph.replaceAuthoritativeWindow(windowId)
  }

  listGraphTabs(): TTab[] {
    return this.graph.listTabs().map(snapshotSessionValue)
  }

  getGraphTab(tabId: string): TTab | null {
    const tab = this.graph.getTab(tabId)
    return tab ? snapshotSessionValue(tab) : null
  }

  hasGraphTab(tabId: string): boolean {
    return this.graph.hasTab(tabId)
  }

  listGraphLeaves(): TLeaf[] {
    return this.graph.listLeaves().map(snapshotSessionValue)
  }

  getGraphLeaf(tabId: string, leafId: string): TLeaf | null {
    const leaf = this.graph.getLeaf(`${tabId}::${leafId}`)
    return leaf ? snapshotSessionValue(leaf) : null
  }

  getGraphLeafByKey(leafKey: string): TLeaf | null {
    const leaf = this.graph.getLeaf(leafKey)
    return leaf ? snapshotSessionValue(leaf) : null
  }

  getGraphLeavesForPty(ptyId: string): TLeaf[] {
    return this.graph.getLeavesForPty(ptyId).map(snapshotSessionValue)
  }

  hasGraphLeafForPty(ptyId: string): boolean {
    return this.graph.hasLeafForPty(ptyId)
  }

  getTerminalHandle(handle: string): THandle | null {
    const record = this.graph.getHandle(handle)
    return record ? snapshotSessionValue(record) : null
  }

  getTerminalHandleForPty(ptyId: string): string | null {
    return this.graph.getHandleForPty(ptyId)
  }

  getPtyIdForTerminalHandle(handle: string): string | null {
    return this.graph.listPtyHandles().find(([, candidate]) => candidate === handle)?.[0] ?? null
  }

  getTerminalHandleForLeaf(tabId: string, leafId: string): string | null {
    return this.graph.getHandleForLeaf(`${tabId}::${leafId}`)
  }

  getTerminalHandleForLeafKey(leafKey: string): string | null {
    return this.graph.getHandleForLeaf(leafKey)
  }

  bindTerminalHandleToPty(ptyId: string, handle: string): void {
    this.graph.bindPtyHandle(ptyId, handle)
  }

  deleteTerminalHandleForPty(ptyId: string): THandle | null {
    const record = this.graph.deletePtyHandle(ptyId)
    return record ? snapshotSessionValue(record) : null
  }

  preAllocateHandle(ptyId: string, preferredHandle?: string): string {
    return this.graph.preAllocateHandle(ptyId, preferredHandle)
  }

  createPreAllocatedHandle(): string {
    return this.graph.createHandle()
  }

  markPtyExited(
    ptyId: string,
    exitCode: number
  ): { handle: string | null; pty: TPty | null; leaves: TLeaf[] } {
    const handle = this.graph.getHandleForPty(ptyId)
    const pty = this.ptys.get(ptyId)
    if (pty) {
      pty.connected = false
      pty.disconnectedAt = Date.now()
      pty.lastExitCode = exitCode
    }
    this.graph.deleteDetachedPty(ptyId)
    const leaves = this.graph.getLeavesForPty(ptyId)
    for (const leaf of leaves) {
      leaf.connected = false
      leaf.writable = false
      leaf.lastExitCode = exitCode
    }
    return {
      handle,
      pty: pty ? snapshotSessionValue(pty) : null,
      leaves: leaves.map(snapshotSessionValue)
    }
  }

  markPtySpawned(ptyId: string, runtimeId: string): void {
    const pty = this.ptys.get(ptyId)
    if (pty) {
      pty.connected = true
      pty.disconnectedAt = null
    }
    for (const leaf of this.graph.getLeavesForPty(ptyId)) {
      leaf.connected = true
      leaf.writable = this.graph.getStatus() === 'ready'
    }
    this.recovery.adoptPreAllocatedLeaves(runtimeId, ptyId)
  }

  addGraphSyncCallback(callback: () => void): void {
    this.graph.addSyncCallback(callback)
  }

  removeGraphSyncCallback(callback: () => void): void {
    this.graph.removeSyncCallback(callback)
  }

  notifyGraphSynced(): void {
    this.graph.notifySynced()
  }

  markGraphReloading(windowId: number): boolean {
    return this.graph.markReloading(windowId)
  }

  markGraphReady(windowId: number): boolean {
    return this.graph.markReady(windowId)
  }

  markGraphUnavailable(windowId: number): boolean {
    return this.graph.markUnavailable(windowId)
  }

  assertGraphReady(expectedEpoch?: number): void {
    this.graph.assertReady(expectedEpoch)
  }

  synchronizeGraph<
    TIncomingLeaf extends {
      tabId: string
      leafId: string
      worktreeId: string
      ptyId: string | null
    }
  >(
    windowId: number,
    tabs: TTab[],
    leaves: TIncomingLeaf[],
    port: TerminalGraphSyncPort<TIncomingLeaf, TLeaf>,
    runtimeId: string
  ): void {
    this.recovery.synchronize(windowId, tabs, leaves, port, runtimeId)
  }

  issueLeafHandle(runtimeId: string, leaf: TLeaf): string {
    return this.recovery.issueLeafHandle(runtimeId, leaf)
  }

  issuePtyHandle(runtimeId: string, ptyId: string, worktreeId: string): string {
    return this.recovery.issuePtyHandle(runtimeId, ptyId, worktreeId)
  }

  registerPreAllocatedHandle(runtimeId: string, ptyId: string, handle: string): void {
    this.recovery.registerPreAllocatedHandle(runtimeId, ptyId, handle)
  }

  canAdoptControllerHandle(runtimeId: string, ptyId: string, handle: string): boolean {
    return this.recovery.canAdoptControllerHandle(runtimeId, ptyId, handle)
  }

  getPtyRecord(ptyId: string): TPty | null {
    const record = this.ptys.get(ptyId)
    return record ? snapshotSessionValue(record) : null
  }

  hasPtyRecord(ptyId: string): boolean {
    return this.ptys.has(ptyId)
  }

  deletePtyRecord(ptyId: string): boolean {
    return this.ptys.delete(ptyId)
  }

  listPtyRecords(): TPty[] {
    return this.ptys.list().map(snapshotSessionValue)
  }

  commitPtyState(ptyId: string, update: { pty?: TPty; leaves?: TLeaf[] }): void {
    if (update.pty?.ptyId === ptyId) {
      this.ptys.set(snapshotSessionValue(update.pty))
    }
    if (update.leaves) {
      this.graph.replaceLeavesForPty(ptyId, update.leaves.map(snapshotSessionValue))
    }
  }

  mutatePtyOutputState(
    ptyId: string,
    update: (state: { pty: TPty | null; leaves: TLeaf[]; graphReady: boolean }) => void
  ): void {
    // Why: output ingestion is synchronous and may retain 256KB; editing in place avoids per-chunk clones.
    update({
      pty: this.ptys.get(ptyId),
      leaves: this.graph.getLeavesForPty(ptyId),
      graphReady: this.graph.getStatus() === 'ready'
    })
  }

  recordLivePtyBinding(
    ptyId: string,
    binding: {
      worktreeId: string
      preserveExistingWorktree: boolean
      lastOutputAt: number
      preview: string
      tabId: string
      paneKey: string
    }
  ): void {
    const pty = this.ptys.get(ptyId)
    if (!pty) {
      return
    }
    if (!binding.preserveExistingWorktree) {
      if (pty.worktreeId !== binding.worktreeId) {
        pty.worktreeId = binding.worktreeId
        pty.worktreeInstanceId = null
      }
    }
    pty.connected = true
    pty.disconnectedAt = null
    pty.lastOutputAt = Math.max(pty.lastOutputAt ?? 0, binding.lastOutputAt)
    if (binding.preview.length > 0) {
      pty.preview = binding.preview
    }
    pty.tabId = binding.tabId
    pty.paneKey = binding.paneKey
  }

  setPtyForegroundAgent(ptyId: string, agent: TPty['foregroundAgent']): boolean {
    const pty = this.ptys.get(ptyId)
    // Why: an async probe cannot revive an exited PTY or overwrite an explicit launch owner.
    if (!pty?.connected || pty.launchAgent || pty.foregroundAgent === agent) {
      return false
    }
    pty.foregroundAgent = agent
    return true
  }

  canProbePtyForegroundAgent(ptyId: string): boolean {
    const pty = this.ptys.get(ptyId)
    return Boolean(pty?.connected && !pty.launchAgent)
  }

  markDisconnectedPtysUnless(
    livePtyIds: ReadonlySet<string>,
    hasLiveLeaf: (ptyId: string) => boolean
  ): void {
    this.ptys.markDisconnectedUnless(livePtyIds, hasLiveLeaf)
  }
}
