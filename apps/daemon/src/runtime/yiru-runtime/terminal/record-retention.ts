import { DISCONNECTED_PTY_RECORD_MAX } from '../model/runtime-limits'
import type { RuntimePtyWorktreeRecord, RuntimeLeafRecord } from '../model/terminal-records'
import { RuntimeTerminalRecordPtyWorktree } from './record-pty-worktree'

export abstract class RuntimeTerminalRecordRetention extends RuntimeTerminalRecordPtyWorktree {
  protected pruneDisconnectedPtyTranscript(pty: RuntimePtyWorktreeRecord): void {
    pty.tailBuffer = []
    pty.tailPartialLine = ''
    pty.tailPendingAnsi = ''
    pty.tailRedrawCursor = null
    pty.tailTruncated = false
    pty.tailLinesTotal = 0
    pty.tailWaitState = undefined
  }

  protected pruneDisconnectedPtyRecords(): void {
    const staleRecords = this.terminalSessions
      .listPtyRecords()
      .filter((pty) => !pty.connected && !this.leafExistsForPty(pty.ptyId))
      .sort(
        (left, right) =>
          (right.disconnectedAt ?? right.lastOutputAt ?? 0) -
          (left.disconnectedAt ?? left.lastOutputAt ?? 0)
      )
    for (const stale of staleRecords.slice(DISCONNECTED_PTY_RECORD_MAX)) {
      this.dropDisconnectedPtyRecord(stale.ptyId)
    }
  }

  protected dropDisconnectedPtyRecord(ptyId: string): void {
    const record = this.terminalSessions.getPtyRecord(ptyId)
    if (!record || record.connected || this.leafExistsForPty(ptyId)) {
      return
    }
    this.terminalSessions.deletePtyRecord(ptyId)
  }

  protected leafExistsForPty(ptyId: string): boolean {
    return this.terminalSessions.getGraphLeavesForPty(ptyId).length > 0
  }

  protected getLeavesForPty(ptyId: string): RuntimeLeafRecord[] {
    return this.terminalSessions.getGraphLeavesForPty(ptyId)
  }
}
