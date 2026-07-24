import { randomUUID } from 'node:crypto'

import type { TerminalSessionHandleRecord } from './terminal-session-graph'

export class TerminalSessionHandleIndex<THandle extends TerminalSessionHandleRecord> {
  private readonly records = new Map<string, THandle>()
  private readonly byLeafKey = new Map<string, string>()
  private readonly byPtyId = new Map<string, string>()

  constructor(private readonly rejectHandle: (handle: string) => void) {}

  create(): string {
    return `term_${randomUUID()}`
  }

  preAllocate(ptyId: string, preferredHandle?: string): string {
    const existing = this.byPtyId.get(ptyId)
    if (existing) {
      return existing
    }
    const handle = preferredHandle ?? this.create()
    this.byPtyId.set(ptyId, handle)
    return handle
  }

  get(handle: string): THandle | null {
    return this.records.get(handle) ?? null
  }

  getForPty(ptyId: string): string | null {
    return this.byPtyId.get(ptyId) ?? null
  }

  getForLeaf(leafKey: string): string | null {
    return this.byLeafKey.get(leafKey) ?? null
  }

  listPtyBindings(): [string, string][] {
    return [...this.byPtyId.entries()]
  }

  listRecords(): [string, THandle][] {
    return [...this.records.entries()]
  }

  bindPty(ptyId: string, handle: string): void {
    this.byPtyId.set(ptyId, handle)
  }

  bindLeaf(leafKey: string, handle: string, record: THandle): void {
    this.records.set(handle, record)
    this.byLeafKey.set(leafKey, handle)
  }

  set(handle: string, record: THandle): void {
    this.records.set(handle, record)
  }

  has(handle: string): boolean {
    return this.records.has(handle)
  }

  deletePty(ptyId: string): THandle | null {
    const handle = this.byPtyId.get(ptyId)
    if (!handle) {
      return null
    }
    this.byPtyId.delete(ptyId)
    const record = this.records.get(handle) ?? null
    if (record?.tabId.startsWith('pty:')) {
      this.records.delete(handle)
    }
    return record
  }

  invalidateLeaf(leafKey: string): void {
    const handle = this.byLeafKey.get(leafKey)
    if (!handle) {
      return
    }
    this.byLeafKey.delete(leafKey)
    this.records.delete(handle)
    this.rejectHandle(handle)
  }

  deleteLeafAlias(leafKey: string): void {
    this.byLeafKey.delete(leafKey)
  }

  clearRendererBindings(): void {
    this.records.clear()
    this.byLeafKey.clear()
  }
}
