import type {
  TerminalSessionGraph,
  TerminalSessionHandleRecord,
  TerminalSessionLeaf,
  TerminalSessionTab
} from './terminal-session-graph'

type IncomingTerminalLeaf = {
  tabId: string
  leafId: string
  worktreeId: string
  ptyId: string | null
}

type LeafBuildContext<TLeaf> = {
  existing: TLeaf | null
  ptyId: string | null
  ptyGeneration: number
  writable: boolean
}

export type TerminalGraphSyncPort<TIncomingLeaf, TLeaf> = {
  buildLeaf(input: TIncomingLeaf, context: LeafBuildContext<TLeaf>): TLeaf
  recordLivePty(input: TIncomingLeaf, existing: TLeaf | null): void
}

function leafKey(leaf: Pick<IncomingTerminalLeaf, 'tabId' | 'leafId'>): string {
  return `${leaf.tabId}::${leaf.leafId}`
}

export class TerminalSessionGraphRecovery<
  TTab extends TerminalSessionTab,
  TLeaf extends TerminalSessionLeaf,
  THandle extends TerminalSessionHandleRecord
> {
  constructor(private readonly graph: TerminalSessionGraph<TTab, TLeaf, THandle>) {}

  synchronize<TIncomingLeaf extends IncomingTerminalLeaf>(
    windowId: number,
    tabs: TTab[],
    incomingLeaves: TIncomingLeaf[],
    port: TerminalGraphSyncPort<TIncomingLeaf, TLeaf>,
    runtimeId: string
  ): void {
    this.graph.requirePublisher(windowId)
    this.graph.replaceTabs(tabs)
    const nextLeaves = new Map<string, TLeaf>()
    const preserveLivePtys = this.graph.getStatus() === 'reloading'

    for (const input of incomingLeaves) {
      const key = leafKey(input)
      const existing = this.graph.getLeaf(key)
      const ptyId =
        preserveLivePtys && input.ptyId === null ? (existing?.ptyId ?? null) : input.ptyId
      const ptyGeneration =
        existing && existing.ptyId !== ptyId
          ? existing.ptyGeneration + 1
          : (existing?.ptyGeneration ?? 0)
      const existingSnapshot = existing ? structuredClone(existing) : null
      const next = port.buildLeaf(input, {
        existing: existingSnapshot,
        ptyId,
        ptyGeneration,
        writable: this.graph.getStatus() === 'ready' && ptyId !== null
      })
      nextLeaves.set(key, next)
      if (input.ptyId) {
        port.recordLivePty(input, existingSnapshot)
      }
      if (existing && (existing.ptyId !== ptyId || existing.ptyGeneration !== ptyGeneration)) {
        // Why: a leaf waiting for its first PTY keeps the handle promised to its caller.
        if (existing.ptyId !== null || !this.adoptFirstPty(key, ptyId, ptyGeneration)) {
          this.graph.invalidateLeafHandle(key)
        }
      }
    }

    this.preserveRecoverableLeaves(nextLeaves, preserveLivePtys)
    this.graph.replaceLeaves(nextLeaves)
    this.graph.markReady(windowId)
    for (const leaf of this.graph.listLeaves()) {
      this.adoptPreAllocatedLeaf(runtimeId, leaf)
    }
    this.graph.notifySynced()
  }

  issueLeafHandle(runtimeId: string, leaf: TLeaf): string {
    const key = leafKey(leaf)
    const existingHandle = this.graph.getHandleForLeaf(key)
    if (existingHandle) {
      const existingRecord = this.graph.getHandle(existingHandle)
      if (
        existingRecord?.rendererGraphEpoch === this.graph.getEpoch() &&
        existingRecord.ptyId === leaf.ptyId &&
        existingRecord.ptyGeneration === leaf.ptyGeneration
      ) {
        return existingHandle
      }
    }

    const handle = this.adoptPreAllocatedLeaf(runtimeId, leaf) ?? this.graph.createHandle()
    if (!this.graph.hasHandle(handle)) {
      this.graph.bindLeafHandle(key, handle, this.makeLeafHandleRecord(runtimeId, handle, leaf))
    }
    return handle
  }

  issuePtyHandle(runtimeId: string, ptyId: string, worktreeId: string): string {
    const existingHandle =
      this.graph.getHandleForPty(ptyId) ?? this.findSyntheticHandle(ptyId, runtimeId)
    const existingRecord = existingHandle ? this.graph.getHandle(existingHandle) : null
    if (
      existingHandle &&
      existingRecord?.runtimeId === runtimeId &&
      existingRecord.ptyId === ptyId
    ) {
      this.graph.bindPtyHandle(ptyId, existingHandle)
      return existingHandle
    }

    const handle = existingHandle ?? this.graph.createHandle()
    const syntheticId = `pty:${ptyId}`
    this.graph.setHandle(handle, {
      handle,
      runtimeId,
      rendererGraphEpoch: this.graph.getEpoch(),
      worktreeId,
      tabId: syntheticId,
      leafId: syntheticId,
      ptyId,
      ptyGeneration: 0
    } as THandle)
    this.graph.bindPtyHandle(ptyId, handle)
    return handle
  }

  registerPreAllocatedHandle(runtimeId: string, ptyId: string, handle: string): void {
    this.graph.bindPtyHandle(ptyId, handle)
    this.adoptPreAllocatedLeaves(runtimeId, ptyId)
  }

  adoptPreAllocatedLeaves(runtimeId: string, ptyId: string): void {
    for (const leaf of this.graph.getLeavesForPty(ptyId)) {
      this.adoptPreAllocatedLeaf(runtimeId, leaf)
    }
  }

  canAdoptControllerHandle(runtimeId: string, ptyId: string, handle: string): boolean {
    // Why: restart adoption is first-wins; replacing an issued handle strands its waiters.
    if (this.graph.getHandleForPty(ptyId) ?? this.findSyntheticHandle(ptyId, runtimeId)) {
      return false
    }
    for (const leaf of this.graph.getLeavesForPty(ptyId)) {
      const issued = this.graph.getHandleForLeaf(leafKey(leaf))
      if (issued && issued !== handle) {
        return false
      }
    }
    const record = this.graph.getHandle(handle)
    if (record && record.ptyId !== ptyId) {
      return false
    }
    return !this.graph.listPtyHandles().some(([otherPtyId, other]) => {
      return other === handle && otherPtyId !== ptyId
    })
  }

  private preserveRecoverableLeaves(nextLeaves: Map<string, TLeaf>, enabled: boolean): void {
    const livePtyIds = new Set(
      [...nextLeaves.values()].map((leaf) => leaf.ptyId).filter((ptyId): ptyId is string => !!ptyId)
    )
    for (const oldLeaf of this.graph.listLeaves()) {
      const oldKey = leafKey(oldLeaf)
      if (nextLeaves.has(oldKey)) {
        continue
      }
      if (
        enabled &&
        oldLeaf.ptyId &&
        this.graph.getHandleForPty(oldLeaf.ptyId) &&
        !livePtyIds.has(oldLeaf.ptyId)
      ) {
        // Why: renderer reload must not revoke a CLI-created terminal before it rebinds.
        nextLeaves.set(oldKey, oldLeaf)
        livePtyIds.add(oldLeaf.ptyId)
      } else {
        this.releaseStaleLeaf(oldLeaf, oldKey, livePtyIds)
      }
    }
    for (const leaf of this.graph.takeDetachedLeaves(livePtyIds)) {
      if (leaf.ptyId) {
        nextLeaves.set(leafKey(leaf), leaf)
      }
    }
  }

  private releaseStaleLeaf(oldLeaf: TLeaf, oldKey: string, livePtyIds: Set<string>): void {
    const oldHandle = this.graph.getHandleForLeaf(oldKey)
    if (
      oldLeaf.ptyId &&
      livePtyIds.has(oldLeaf.ptyId) &&
      oldHandle === this.graph.getHandleForPty(oldLeaf.ptyId)
    ) {
      // Why: a rebound PTY keeps its shared handle while shedding only the stale alias.
      this.graph.deleteLeafHandleAlias(oldKey)
      return
    }
    this.graph.invalidateLeafHandle(oldKey)
  }

  private adoptPreAllocatedLeaf(runtimeId: string, leaf: TLeaf): string | null {
    const handle = leaf.ptyId ? this.graph.getHandleForPty(leaf.ptyId) : null
    if (!handle) {
      return null
    }
    this.graph.bindLeafHandle(
      leafKey(leaf),
      handle,
      this.makeLeafHandleRecord(runtimeId, handle, leaf)
    )
    return handle
  }

  private adoptFirstPty(key: string, ptyId: string | null, ptyGeneration: number): boolean {
    const handle = this.graph.getHandleForLeaf(key)
    const record = handle ? this.graph.getHandle(handle) : null
    if (!handle || !record || record.ptyId !== null || ptyId === null) {
      return false
    }
    this.graph.setHandle(handle, { ...record, ptyId, ptyGeneration })
    return true
  }

  private findSyntheticHandle(ptyId: string, runtimeId: string): string | null {
    for (const [handle, record] of this.graph.listHandles()) {
      if (
        record.runtimeId === runtimeId &&
        record.ptyId === ptyId &&
        record.tabId.startsWith('pty:')
      ) {
        return handle
      }
    }
    return null
  }

  private makeLeafHandleRecord(runtimeId: string, handle: string, leaf: TLeaf): THandle {
    return {
      handle,
      runtimeId,
      rendererGraphEpoch: this.graph.getEpoch(),
      worktreeId: leaf.worktreeId,
      tabId: leaf.tabId,
      leafId: leaf.leafId,
      ptyId: leaf.ptyId,
      ptyGeneration: leaf.ptyGeneration
    } as THandle
  }
}
