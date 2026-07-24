export type TerminalSessionPtyRecord = {
  ptyId: string
  worktreeId: string
  worktreeInstanceId: string | null
  tabId: string | null
  paneKey: string | null
  connected: boolean
  disconnectedAt: number | null
  lastExitCode: number | null
  lastOutputAt: number | null
  preview: string
  waitBlockedAt: number | null
  launchAgent: unknown
  foregroundAgent: unknown
}

export class TerminalSessionRecordRegistry<TPty extends TerminalSessionPtyRecord> {
  private readonly records = new Map<string, TPty>()

  get(ptyId: string): TPty | null {
    return this.records.get(ptyId) ?? null
  }

  has(ptyId: string): boolean {
    return this.records.has(ptyId)
  }

  set(record: TPty): void {
    this.records.set(record.ptyId, record)
  }

  delete(ptyId: string): boolean {
    return this.records.delete(ptyId)
  }

  list(): TPty[] {
    return [...this.records.values()]
  }

  markDisconnectedUnless(
    livePtyIds: ReadonlySet<string>,
    hasLiveLeaf: (ptyId: string) => boolean
  ): void {
    for (const record of this.records.values()) {
      if (livePtyIds.has(record.ptyId) || hasLiveLeaf(record.ptyId)) {
        continue
      }
      record.connected = false
      record.disconnectedAt ??= Date.now()
    }
  }
}
