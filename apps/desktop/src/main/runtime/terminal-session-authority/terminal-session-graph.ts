import type { RuntimeGraphStatus } from '../../../shared/runtime-types'
import { TerminalSessionHandleIndex } from './terminal-session-handle-index'

export type TerminalSessionTab = { tabId: string }

export type TerminalSessionLeaf = {
  tabId: string
  leafId: string
  worktreeId: string
  ptyId: string | null
  ptyGeneration: number
  connected: boolean
  writable: boolean
  lastExitCode: number | null
}

export type TerminalSessionHandleRecord = {
  handle: string
  runtimeId: string
  rendererGraphEpoch: number
  worktreeId: string
  tabId: string
  leafId: string
  ptyId: string | null
  ptyGeneration: number
}

export type TerminalSessionGraphPort = {
  rejectHandle(handle: string): void
  rejectAllHandles(): void
}

export class TerminalSessionGraph<
  TTab extends TerminalSessionTab,
  TLeaf extends TerminalSessionLeaf,
  THandle extends TerminalSessionHandleRecord
> {
  private rendererGraphEpoch = 0
  private status: RuntimeGraphStatus = 'unavailable'
  private authoritativeWindowId: number | null = null
  private tabs = new Map<string, TTab>()
  private leaves = new Map<string, TLeaf>()
  private leavesByPtyId = new Map<string, TLeaf[]>()
  private readonly handles: TerminalSessionHandleIndex<THandle>
  private readonly detachedPreAllocatedLeaves = new Map<string, TLeaf>()
  private readonly syncCallbacks: (() => void)[] = []

  constructor(private readonly port: TerminalSessionGraphPort) {
    this.handles = new TerminalSessionHandleIndex(port.rejectHandle)
  }

  getState(): {
    rendererGraphEpoch: number
    graphStatus: RuntimeGraphStatus
    authoritativeWindowId: number | null
    liveTabCount: number
    liveLeafCount: number
  } {
    return {
      rendererGraphEpoch: this.rendererGraphEpoch,
      graphStatus: this.status,
      authoritativeWindowId: this.authoritativeWindowId,
      liveTabCount: this.tabs.size,
      liveLeafCount: this.leaves.size
    }
  }

  getStatus(): RuntimeGraphStatus {
    return this.status
  }

  getEpoch(): number {
    return this.rendererGraphEpoch
  }

  getAuthoritativeWindowId(): number | null {
    return this.authoritativeWindowId
  }

  attachWindow(windowId: number): void {
    if (this.authoritativeWindowId === null) {
      this.authoritativeWindowId = windowId
    }
  }

  replaceAuthoritativeWindow(windowId: number): void {
    this.authoritativeWindowId = windowId
  }

  requirePublisher(windowId: number): void {
    if (this.authoritativeWindowId === null) {
      this.authoritativeWindowId = windowId
    }
    if (windowId !== this.authoritativeWindowId) {
      throw new Error('Runtime graph publisher does not match the authoritative window')
    }
  }

  replaceTabs(tabs: TTab[]): void {
    this.tabs = new Map(tabs.map((tab) => [tab.tabId, tab]))
  }

  listTabs(): TTab[] {
    return [...this.tabs.values()]
  }

  getTab(tabId: string): TTab | null {
    return this.tabs.get(tabId) ?? null
  }

  hasTab(tabId: string): boolean {
    return this.tabs.has(tabId)
  }

  listLeaves(): TLeaf[] {
    return [...this.leaves.values()]
  }

  getLeaf(leafKey: string): TLeaf | null {
    return this.leaves.get(leafKey) ?? null
  }

  replaceLeaves(leaves: Map<string, TLeaf>): void {
    this.leaves = leaves
    this.rebuildLeafIndex()
  }

  replaceLeavesForPty(ptyId: string, replacements: TLeaf[]): void {
    for (const leaf of replacements) {
      const key = `${leaf.tabId}::${leaf.leafId}`
      if (leaf.ptyId === ptyId && this.leaves.get(key)?.ptyId === ptyId) {
        this.leaves.set(key, leaf)
      }
    }
    this.rebuildLeafIndex()
  }

  getLeavesForPty(ptyId: string): TLeaf[] {
    return this.leavesByPtyId.get(ptyId) ?? []
  }

  hasLeafForPty(ptyId: string): boolean {
    return (this.leavesByPtyId.get(ptyId)?.length ?? 0) > 0
  }

  preAllocateHandle(ptyId: string, preferredHandle?: string): string {
    return this.handles.preAllocate(ptyId, preferredHandle)
  }

  createHandle(): string {
    return this.handles.create()
  }

  getHandle(handle: string): THandle | null {
    return this.handles.get(handle)
  }

  getHandleForPty(ptyId: string): string | null {
    return this.handles.getForPty(ptyId)
  }

  getHandleForLeaf(leafKey: string): string | null {
    return this.handles.getForLeaf(leafKey)
  }

  listPtyHandles(): [string, string][] {
    return this.handles.listPtyBindings()
  }

  listHandles(): [string, THandle][] {
    return this.handles.listRecords()
  }

  bindPtyHandle(ptyId: string, handle: string): void {
    this.handles.bindPty(ptyId, handle)
  }

  bindLeafHandle(leafKey: string, handle: string, record: THandle): void {
    this.handles.bindLeaf(leafKey, handle, record)
  }

  setHandle(handle: string, record: THandle): void {
    this.handles.set(handle, record)
  }

  hasHandle(handle: string): boolean {
    return this.handles.has(handle)
  }

  deletePtyHandle(ptyId: string): THandle | null {
    return this.handles.deletePty(ptyId)
  }

  invalidateLeafHandle(leafKey: string): void {
    this.handles.invalidateLeaf(leafKey)
  }

  deleteLeafHandleAlias(leafKey: string): void {
    this.handles.deleteLeafAlias(leafKey)
  }

  rememberDetachedPreAllocatedLeaves(): void {
    for (const leaf of this.leaves.values()) {
      if (leaf.ptyId && this.handles.getForPty(leaf.ptyId)) {
        this.detachedPreAllocatedLeaves.set(leaf.ptyId, leaf)
      }
    }
  }

  deleteDetachedPty(ptyId: string): void {
    this.detachedPreAllocatedLeaves.delete(ptyId)
  }

  takeDetachedLeaves(livePtyIds: Set<string>): TLeaf[] {
    const restored: TLeaf[] = []
    for (const [ptyId, leaf] of this.detachedPreAllocatedLeaves) {
      if (livePtyIds.has(ptyId) || !this.handles.getForPty(ptyId)) {
        this.detachedPreAllocatedLeaves.delete(ptyId)
        continue
      }
      livePtyIds.add(ptyId)
      restored.push(leaf)
      this.detachedPreAllocatedLeaves.delete(ptyId)
    }
    return restored
  }

  markReloading(windowId: number): boolean {
    if (windowId !== this.authoritativeWindowId || this.status !== 'ready') {
      return false
    }
    this.rendererGraphEpoch += 1
    this.status = 'reloading'
    this.rememberDetachedPreAllocatedLeaves()
    this.handles.clearRendererBindings()
    this.port.rejectAllHandles()
    this.refreshWritableFlags()
    return true
  }

  markReady(windowId: number): boolean {
    if (windowId !== this.authoritativeWindowId) {
      return false
    }
    this.status = 'ready'
    this.refreshWritableFlags()
    return true
  }

  markUnavailable(windowId: number): boolean {
    if (windowId !== this.authoritativeWindowId) {
      return false
    }
    if (this.status !== 'unavailable') {
      this.rendererGraphEpoch += 1
    }
    this.status = 'unavailable'
    this.authoritativeWindowId = null
    this.rememberDetachedPreAllocatedLeaves()
    this.tabs.clear()
    this.leaves.clear()
    this.leavesByPtyId.clear()
    this.handles.clearRendererBindings()
    this.port.rejectAllHandles()
    return true
  }

  assertReady(expectedEpoch?: number): void {
    if (
      this.status !== 'ready' ||
      (expectedEpoch !== undefined && this.rendererGraphEpoch !== expectedEpoch)
    ) {
      throw new Error('runtime_unavailable')
    }
  }

  addSyncCallback(callback: () => void): void {
    this.syncCallbacks.push(callback)
  }

  removeSyncCallback(callback: () => void): void {
    const index = this.syncCallbacks.indexOf(callback)
    if (index >= 0) {
      this.syncCallbacks.splice(index, 1)
    }
  }

  notifySynced(): void {
    for (const callback of this.syncCallbacks.slice()) {
      callback()
    }
  }

  private rebuildLeafIndex(): void {
    const next = new Map<string, TLeaf[]>()
    for (const leaf of this.leaves.values()) {
      if (!leaf.ptyId) {
        continue
      }
      const matches = next.get(leaf.ptyId) ?? []
      matches.push(leaf)
      next.set(leaf.ptyId, matches)
    }
    this.leavesByPtyId = next
  }

  private refreshWritableFlags(): void {
    for (const leaf of this.leaves.values()) {
      leaf.writable = this.status === 'ready' && leaf.connected && leaf.ptyId !== null
    }
  }
}
